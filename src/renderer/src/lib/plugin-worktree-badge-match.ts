import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { joinPath } from '@/lib/path'
import { useAppStore } from '@/store'
import {
  usePluginWorktreeBadges,
  type ActivePluginWorktreeBadge
} from '@/store/plugin-worktree-badges'
import type { PluginWorktreeBadgeEntry } from '../../../shared/plugins/contributions/plugin-worktree-badge'

export type PluginBadgeWorktree = {
  path: string
  connectionId: string | null
}

/** A badge matching a worktree, with the folders that hold its marker; `''` is the worktree folder. */
export type PluginWorktreeBadgeMatch = {
  badge: ActivePluginWorktreeBadge
  folders: readonly string[]
}

type BadgeWhen = PluginWorktreeBadgeEntry['when']
type FolderScan = { folders: readonly string[]; checkedAt: number; pending: boolean }

// Why: a new workspace can still be syncing files when its card mounts, so a scan is repeated.
export const PLUGIN_BADGE_MISS_RECHECK_MS = 30_000
// Why: bounds a subfolder search of a huge workspace (e.g. a game depot) to a few hundred reads.
const MAX_SCANNED_FOLDERS = 256
const SKIPPED_FOLDER_RE = /^(?:\..*|node_modules)$/

let scans: ReadonlyMap<string, FolderScan> = new Map()
const listeners = new Set<() => void>()

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getScans(): ReadonlyMap<string, FolderScan> {
  return scans
}

function setScan(key: string, scan: FolderScan): void {
  scans = new Map(scans).set(key, scan)
  listeners.forEach((listener) => listener())
}

function scanKey(worktree: PluginBadgeWorktree, when: BadgeWhen): string {
  return [worktree.connectionId ?? '', worktree.path, when.searchDepth, ...when.pathExists].join(
    '\0'
  )
}

function connectionArgs(worktree: PluginBadgeWorktree): { connectionId?: string } {
  return worktree.connectionId ? { connectionId: worktree.connectionId } : {}
}

function childPath(folder: string, name: string): string {
  return folder ? `${folder}/${name}` : name
}

async function folderHoldsMarker(
  worktree: PluginBadgeWorktree,
  folder: string,
  markers: readonly string[]
): Promise<boolean> {
  const found = await Promise.all(
    markers.map((marker) =>
      window.api.fs
        .pathExists({
          filePath: joinPath(worktree.path, childPath(folder, marker)),
          ...connectionArgs(worktree)
        })
        // Why: an unreachable SSH host reads as a miss and is retried after the recheck delay.
        .catch(() => false)
    )
  )
  return found.includes(true)
}

async function listSubfolders(worktree: PluginBadgeWorktree, folder: string): Promise<string[]> {
  const entries = await window.api.fs
    .readDir({ dirPath: joinPath(worktree.path, folder), ...connectionArgs(worktree) })
    .catch(() => [])
  return entries
    .filter((entry) => entry.isDirectory && !entry.isSymlink && !SKIPPED_FOLDER_RE.test(entry.name))
    .map((entry) => childPath(folder, entry.name))
}

/** Folders up to `when.searchDepth` levels down that hold one of the marker paths, breadth first. */
export async function findPluginBadgeFolders(
  worktree: PluginBadgeWorktree,
  when: BadgeWhen
): Promise<string[]> {
  const matches: string[] = []
  let level = ['']
  let scanned = 1
  for (let depth = 0; level.length > 0; depth++) {
    const holds = await Promise.all(
      level.map((folder) => folderHoldsMarker(worktree, folder, when.pathExists))
    )
    const unmatched = level.filter((folder, index) => {
      if (holds[index]) {
        matches.push(folder)
      }
      return !holds[index]
    })
    if (depth >= when.searchDepth) {
      break
    }
    // Why: a matched folder's subfolders belong to that project, so the search stops there.
    const children = (
      await Promise.all(unmatched.map((folder) => listSubfolders(worktree, folder)))
    ).flat()
    level = children.slice(0, Math.max(0, MAX_SCANNED_FOLDERS - scanned))
    scanned += level.length
  }
  return matches.sort((a, b) => a.localeCompare(b))
}

function requestFolderScan(worktree: PluginBadgeWorktree, when: BadgeWhen, now: number): void {
  const key = scanKey(worktree, when)
  const previous = scans.get(key)
  if (previous && (previous.pending || now - previous.checkedAt < PLUGIN_BADGE_MISS_RECHECK_MS)) {
    return
  }
  // Why: earlier folders stay listed while a rescan runs, so the badge does not flicker.
  setScan(key, {
    folders: previous?.folders ?? [],
    checkedAt: previous?.checkedAt ?? 0,
    pending: true
  })
  void findPluginBadgeFolders(worktree, when)
    .catch(() => [])
    .then((folders) => setScan(key, { folders, checkedAt: Date.now(), pending: false }))
}

/** Badges whose `when` matches the worktree. `recheckToken` changes (e.g. on activation) repeat
 *  scans that are older than the recheck delay. */
export function useMatchingPluginWorktreeBadges(
  worktree: PluginBadgeWorktree | null,
  recheckToken?: unknown
): PluginWorktreeBadgeMatch[] {
  const badges = usePluginWorktreeBadges()
  // Why: plugin commands run on this desktop, which cannot resolve a remote Orca server's worktrees.
  const usesRemoteRuntime = useAppStore((state) =>
    Boolean(state.settings?.activeRuntimeEnvironmentId?.trim())
  )
  const path = worktree?.path ?? null
  const connectionId = worktree?.connectionId ?? null
  const target = useMemo(
    () => (path && !usesRemoteRuntime ? { path, connectionId } : null),
    [path, connectionId, usesRemoteRuntime]
  )
  const candidates = useMemo(
    () =>
      target ? badges.filter((badge) => badge.when.host === 'any' || !target.connectionId) : [],
    [badges, target]
  )
  const folderScans = useSyncExternalStore(subscribe, getScans, getScans)

  useEffect(() => {
    if (!target) {
      return
    }
    const now = Date.now()
    candidates.forEach((badge) => requestFolderScan(target, badge.when, now))
  }, [candidates, target, recheckToken])

  return useMemo(
    () =>
      target
        ? candidates.flatMap((badge) => {
            const folders = folderScans.get(scanKey(target, badge.when))?.folders ?? []
            return folders.length > 0 ? [{ badge, folders }] : []
          })
        : [],
    [candidates, target, folderScans]
  )
}

export function resetPluginWorktreeBadgeChecksForTests(): void {
  scans = new Map()
}
