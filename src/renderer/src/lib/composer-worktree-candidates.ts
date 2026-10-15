import type { AppState } from '@/store/types'
import { getIndexedAllWorktrees } from '@/store/worktree-repo-index'
import { compareWorktreeDisplayName } from '@/lib/worktree-display-name-order'
import {
  sharesWorktreeLineageBoundary,
  type WorktreeLineageBoundary
} from '../../../shared/resolved-worktree-lineage'
import type { ExecutionHostId } from '../../../shared/execution-host'
import type { Worktree } from '../../../shared/worktree/types'

export type ComposerWorktreeCandidateScope = {
  repoId: string
  executionHostId?: ExecutionHostId | null
  projectId?: string | null
}

/** Live worktrees of the composer's project on its execution host, sorted by display name. */
export function getComposerWorktreeCandidates(
  worktreesByRepo: AppState['worktreesByRepo'],
  scope: ComposerWorktreeCandidateScope,
  include: (candidate: Worktree) => boolean = () => true
): Worktree[] {
  // Why `?? undefined`: an unresolved host or project is "not known yet", not "no host", and
  // the boundary check reads undefined on either side as a wildcard. A candidate in this repo
  // with no recorded hostId inherits that repo's host, so it is on the composer's host too.
  const boundary: WorktreeLineageBoundary = {
    repoId: scope.repoId,
    hostId: scope.executionHostId ?? undefined,
    projectId: scope.projectId ?? undefined
  }
  return getIndexedAllWorktrees(worktreesByRepo)
    .filter(
      (candidate) =>
        candidate.repoId === scope.repoId &&
        !candidate.isArchived &&
        sharesWorktreeLineageBoundary(boundary, candidate) &&
        include(candidate)
    )
    .sort(compareWorktreeDisplayName)
}
