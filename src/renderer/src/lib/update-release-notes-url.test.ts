import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('getUpdateReleaseNotesUrl', () => {
  it("links a fork build's updates to the fork's own releases", async () => {
    vi.stubGlobal('ORCA_UPDATE_RELEASE_REPO', 'owner/fork')
    const { getUpdateReleaseNotesUrl } = await import('./update-release-notes-url')

    expect(getUpdateReleaseNotesUrl('v1.4.250-integration.20261105043458')).toBe(
      'https://github.com/owner/fork/releases/tag/v1.4.250-integration.20261105043458'
    )
    expect(getUpdateReleaseNotesUrl(null)).toBe('https://github.com/owner/fork/releases')
  })

  it('keeps upstream release links on official builds', async () => {
    const { getUpdateReleaseNotesUrl } = await import('./update-release-notes-url')

    expect(getUpdateReleaseNotesUrl('1.4.250')).toBe(
      'https://github.com/stablyai/orca/releases/tag/v1.4.250'
    )
  })
})
