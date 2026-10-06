import { join, relative } from 'node:path'
import type { Repo } from '../../../../shared/repo-types'
import type {
  WorkspaceCopyListEntry,
  WorkspaceCopyListResult
} from '../../../../shared/perforce/workspace-copy/workspace-copy-types'
import { splitWorktreeId } from '../../../../shared/worktree/id'
import {
  getPerforceCopyName,
  getPerforceCopyWorktreeId,
  isPerforceCopyWorktreeIdForRepo
} from '../../../../shared/worktree/perforce-copy-worktree'
import type { Store } from '../../../persistence'
import { removeWorktreeMetadataAndTransientState } from '../removal/worktree-removal-ownership'

/**
 * The copy's counterpart of the project folder: the copy root itself, or the same subfolder inside it
 * when the project is a folder below the client root.
 */
export function copyWorktreePath(repo: Repo, sourceRoot: string, copyRoot: string): string {
  const inside = relative(sourceRoot, repo.path)
  return inside && !inside.startsWith('..') ? join(copyRoot, inside) : copyRoot
}

/** Records a copy as a worktree of `repo`; creation metadata makes it a visible Orca workspace. */
function recordCopyWorktree(
  store: Store,
  repo: Repo,
  worktreePath: string,
  name: string,
  createdAt = Date.now()
): string {
  const worktreeId = getPerforceCopyWorktreeId(repo, worktreePath)
  if (!store.getWorktreeMeta(worktreeId)) {
    store.setWorktreeMeta(worktreeId, {
      displayName: name,
      createdAt,
      orcaCreatedAt: createdAt,
      orcaCreationSource: repo.connectionId ? 'ssh' : 'desktop',
      lastActivityAt: createdAt
    })
  }
  return worktreeId
}

function createdAtOf(copy: WorkspaceCopyListEntry): number {
  const parsed = copy.created ? Date.parse(copy.created) : Number.NaN
  return Number.isFinite(parsed) ? parsed : Date.now()
}

/**
 * Makes the sidebar match the copies on disk: adopts copies made outside Orca (the p4-worktree tool)
 * and forgets ones whose folder is gone. A folder whose client the server no longer has stays out of
 * the sidebar; Manage Perforce copies lists it for cleanup. Returns whether anything changed.
 */
export function syncCopyWorktrees(
  store: Store,
  repo: Repo,
  listing: WorkspaceCopyListResult
): boolean {
  let changed = false
  const live = new Set<string>()
  for (const copy of listing.copies) {
    const usable = copy.folderExists && (copy.clientExists || !listing.serverChecked)
    if (!usable) {
      continue
    }
    const path = copyWorktreePath(repo, listing.source.root, copy.copyRoot)
    const worktreeId = getPerforceCopyWorktreeId(repo, path)
    live.add(worktreeId)
    if (!store.getWorktreeMeta(worktreeId)) {
      recordCopyWorktree(store, repo, path, copy.name, createdAtOf(copy))
      changed = true
    }
  }
  for (const worktreeId of Object.keys(store.getAllWorktreeMeta())) {
    if (isPerforceCopyWorktreeIdForRepo(repo, worktreeId) && !live.has(worktreeId)) {
      const copyRootGone = !listing.copies.some(
        (copy) =>
          copy.folderExists &&
          getPerforceCopyWorktreeId(
            repo,
            copyWorktreePath(repo, listing.source.root, copy.copyRoot)
          ) === worktreeId
      )
      if (copyRootGone) {
        removeWorktreeMetadataAndTransientState(store, worktreeId)
        changed = true
      }
    }
  }
  return changed
}

export function copyWorktreeIdForName(
  store: Store,
  repo: Repo,
  name: string
): { worktreeId: string; path: string } | null {
  for (const worktreeId of Object.keys(store.getAllWorktreeMeta())) {
    const path = splitWorktreeId(worktreeId)?.worktreePath
    if (
      path &&
      isPerforceCopyWorktreeIdForRepo(repo, worktreeId) &&
      getPerforceCopyName(path)?.toLowerCase() === name.toLowerCase()
    ) {
      return { worktreeId, path }
    }
  }
  return null
}
