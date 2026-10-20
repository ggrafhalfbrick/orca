import { MAIN_RELEASE_REPO } from '../../shared/release-channel'

// Integration-only (AGENTS.md): a fork's release build bakes in its own repo so its installs never update onto upstream.
export const UPDATE_RELEASE_REPO: string =
  typeof ORCA_UPDATE_RELEASE_REPO === 'string' && ORCA_UPDATE_RELEASE_REPO.length > 0
    ? ORCA_UPDATE_RELEASE_REPO
    : MAIN_RELEASE_REPO

export const LATEST_RELEASE_DOWNLOAD_URL = `https://github.com/${UPDATE_RELEASE_REPO}/releases/latest/download`
