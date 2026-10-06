import { isFolderRepo } from '../../../../shared/repo-kind'
import type { Repo } from '../../../../shared/repo-types'
import {
  getPerforceCopyName,
  isPerforceCopyWorktreeIdForRepo
} from '../../../../shared/worktree/perforce-copy-worktree'
import type { Worktree } from '../../../../shared/worktree/types'

/** The delete-confirmation target when `worktree` is a Perforce copy of a folder project, else null. */
export function getPerforceCopyDeleteTarget(
  repos: readonly Repo[],
  worktree: Pick<Worktree, 'id' | 'repoId' | 'path'>
): { repoId: string; sourcePath: string; copyName: string } | null {
  const repo = repos.find(
    (candidate) => candidate.id === worktree.repoId && isFolderRepo(candidate)
  )
  if (!repo || !isPerforceCopyWorktreeIdForRepo(repo, worktree.id)) {
    return null
  }
  const copyName = getPerforceCopyName(worktree.path)
  return copyName ? { repoId: repo.id, sourcePath: repo.path, copyName } : null
}
