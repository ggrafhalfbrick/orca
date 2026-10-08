import { translate } from '@/i18n/i18n'
import { perforceTargetForWorktree } from '@/lib/perforce-workspace-target'
import { pickBestProjectMatch, type ProjectSourceMatcher } from '@/lib/project-source-match'
import { isPerforceRepo } from '../../../../shared/repo-kind'
import { getRepoMainWorktreeId } from '../../../../shared/worktree/id'
import { runPerforceOperation } from '../../runtime/runtime-perforce-client'

/** `//Depot` of a depot path, or undefined when `value` is not one. */
export function depotOfPath(value: string): string | undefined {
  return /^(\/\/[^/\s]+)/.exec(value.trim())?.[1]
}

function sameDepotPath(a: string, b: string): boolean {
  // Why: hint matching only; Windows servers are case-insensitive and notes are hand-written.
  return a.replace(/\/+$/, '').toLowerCase() === b.replace(/\/+$/, '').toLowerCase()
}

/** 2 for a workspace on the hint's exact stream, 1 for one elsewhere in its depot, else 0. */
export function scorePerforceStream(
  workspaceStream: string | undefined,
  hint: { stream?: string; depot: string }
): number {
  if (!workspaceStream) {
    return 0
  }
  if (hint.stream && sameDepotPath(workspaceStream, hint.stream)) {
    return 2
  }
  const own = depotOfPath(workspaceStream)
  return own && sameDepotPath(own, hint.depot) ? 1 : 0
}

/**
 * Perforce projects for a `//Depot` projectSource or `//Depot/Stream` baseRef: asks each project's
 * workspace which stream it is on (`p4 info`), preferring the base stream over the rest of the depot.
 */
export const findPerforceProjectForHint: ProjectSourceMatcher = async (
  repos,
  hint,
  activeRepoId
) => {
  const stream = hint.baseRef && depotOfPath(hint.baseRef) ? hint.baseRef : undefined
  const depot = (hint.projectSource && depotOfPath(hint.projectSource)) || depotOfPath(stream ?? '')
  if (!depot) {
    return null
  }
  const scored = await Promise.all(
    repos.filter(isPerforceRepo).map(async (repo) => {
      const detected = await runPerforceOperation(
        perforceTargetForWorktree(getRepoMainWorktreeId(repo), repo.path, repo.connectionId),
        'detect',
        {}
      ).catch(() => null)
      const workspaceStream = detected?.isWorkspace ? detected.info.stream : undefined
      return { repo, score: scorePerforceStream(workspaceStream, { stream, depot }) }
    })
  )
  const repoId = pickBestProjectMatch(scored, activeRepoId)
  return repoId
    ? { repoId }
    : {
        missing: translate(
          'perforce.copies.noProjectInDepot',
          'No Perforce project in Orca is in {{depot}}. Add your Perforce workspace as a project, then start again.',
          { depot }
        )
      }
}
