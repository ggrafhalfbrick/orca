import { translate } from '@/i18n/i18n'
import {
  foldComparableGitHubHost,
  foldComparableGitLabHost
} from '../../../shared/git-remote-host-alias'
import {
  matchGitRemoteKeyParts,
  normalizeGitRemoteUrl,
  splitGitRemoteKey
} from '../../../shared/git-remote-identity'
import { isGitRepoKind } from '../../../shared/repo-kind'
import { pickBestProjectMatch, type ProjectSourceMatcher } from './project-source-match'

// Why both folds: each maps only its own forge's alias hosts, so together they suit any host.
function foldForgeHost(host: string): string {
  return foldComparableGitLabHost(foldComparableGitHubHost(host))
}

/**
 * Git projects whose remote is the hint's `projectSource` (any forge). A project behind an
 * unexpanded SSH host alias with the same path also matches, ranked below an exact host.
 */
export const findGitProjectForSource: ProjectSourceMatcher = (repos, hint, activeRepoId) => {
  const remote = hint.projectSource ? normalizeGitRemoteUrl(hint.projectSource) : null
  const target = splitGitRemoteKey(remote, foldForgeHost)
  if (!remote || !target) {
    return null
  }
  const scored = repos.filter(isGitRepoKind).map((repo) => {
    const own = splitGitRemoteKey(repo.gitRemoteIdentity?.canonicalKey, foldForgeHost)
    const verdict = own ? matchGitRemoteKeyParts(own, target) : false
    return { repo, score: verdict === true ? 2 : verdict === 'unknown' ? 1 : 0 }
  })
  const repoId = pickBestProjectMatch(scored, activeRepoId)
  return repoId
    ? { repoId }
    : {
        missing: translate(
          'auto.lib.gitRemoteProjectMatch.noProject',
          'No Git project in Orca has the remote {{remote}}. Add a clone of it as a project, then start again.',
          { remote }
        )
      }
}
