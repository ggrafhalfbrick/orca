import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { joinPath } from '@/lib/path'
import { useAppStore } from '@/store'
import {
  usePluginWorktreeBadges,
  type ActivePluginWorktreeBadge
} from '@/store/plugin-worktree-badges'

export type PluginBadgeWorktree = {
  path: string
  connectionId: string | null
}

type PathCheck = { exists: boolean; checkedAt: number; pending: boolean }

// Why: a new workspace can still be syncing files when its card mounts, so a miss is re-checked.
export const PLUGIN_BADGE_MISS_RECHECK_MS = 30_000

let checks: ReadonlyMap<string, PathCheck> = new Map()
const listeners = new Set<() => void>()

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getChecks(): ReadonlyMap<string, PathCheck> {
  return checks
}

function setCheck(key: string, check: PathCheck): void {
  checks = new Map(checks).set(key, check)
  listeners.forEach((listener) => listener())
}

function checkKey(worktree: PluginBadgeWorktree, relativePath: string): string {
  return `${worktree.connectionId ?? ''}\0${joinPath(worktree.path, relativePath)}`
}

function requestPathCheck(worktree: PluginBadgeWorktree, relativePath: string, now: number): void {
  const key = checkKey(worktree, relativePath)
  const previous = checks.get(key)
  if (
    previous &&
    (previous.pending || previous.exists || now - previous.checkedAt < PLUGIN_BADGE_MISS_RECHECK_MS)
  ) {
    return
  }
  setCheck(key, { exists: false, checkedAt: previous?.checkedAt ?? 0, pending: true })
  void window.api.fs
    .pathExists({
      filePath: joinPath(worktree.path, relativePath),
      ...(worktree.connectionId ? { connectionId: worktree.connectionId } : {})
    })
    // Why: an unreachable SSH host reads as a miss and is retried after the recheck delay.
    .catch(() => false)
    .then((exists) => setCheck(key, { exists, checkedAt: Date.now(), pending: false }))
}

export function badgeMatchesWorktree(
  badge: Pick<ActivePluginWorktreeBadge, 'when'>,
  worktree: PluginBadgeWorktree,
  pathChecks: ReadonlyMap<string, PathCheck>
): boolean {
  return badge.when.pathExists.some(
    (relativePath) => pathChecks.get(checkKey(worktree, relativePath))?.exists === true
  )
}

/** Badges whose `when` matches the worktree. `recheckToken` changes (e.g. on activation) re-check
 *  earlier misses that are older than the recheck delay. */
export function useMatchingPluginWorktreeBadges(
  worktree: PluginBadgeWorktree | null,
  recheckToken?: unknown
): ActivePluginWorktreeBadge[] {
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
  const pathChecks = useSyncExternalStore(subscribe, getChecks, getChecks)

  useEffect(() => {
    if (!target) {
      return
    }
    const now = Date.now()
    for (const badge of candidates) {
      badge.when.pathExists.forEach((relativePath) => requestPathCheck(target, relativePath, now))
    }
  }, [candidates, target, recheckToken])

  return target ? candidates.filter((badge) => badgeMatchesWorktree(badge, target, pathChecks)) : []
}

export function resetPluginWorktreeBadgeChecksForTests(): void {
  checks = new Map()
}
