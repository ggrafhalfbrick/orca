import {
  getReleaseNotesUrlForVersion,
  normalizeTagToVersion
} from '../../../shared/release-channel'

// Integration-only (AGENTS.md): a fork's release build names the repo whose releases it updates from.
const FORK_RELEASE_REPO =
  typeof ORCA_UPDATE_RELEASE_REPO === 'string' && ORCA_UPDATE_RELEASE_REPO.length > 0
    ? ORCA_UPDATE_RELEASE_REPO
    : null

/** Release notes for an update: the fork's own release on fork builds, whose tags upstream lacks. */
export function getUpdateReleaseNotesUrl(version: string | null): string {
  if (!FORK_RELEASE_REPO) {
    return getReleaseNotesUrlForVersion(version)
  }
  return version
    ? `https://github.com/${FORK_RELEASE_REPO}/releases/tag/v${normalizeTagToVersion(version)}`
    : `https://github.com/${FORK_RELEASE_REPO}/releases`
}
