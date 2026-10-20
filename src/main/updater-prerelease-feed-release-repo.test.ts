import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installNetRequestFetchAdapter } from './updater-net-request.fixture'

const { netFetchMock, netRequestMock } = vi.hoisted(() => ({
  netFetchMock: vi.fn(),
  netRequestMock: vi.fn()
}))

vi.mock('electron', () => ({
  net: { fetch: netFetchMock, request: netRequestMock }
}))

// The dot proves the repo is escaped: unescaped, it would also match `example/orcaXfork`.
const FORK_REPO = 'example/orca.fork'
const CURRENT = '1.4.231-integration.20261020120000'
const NEWER_TAG = 'v1.4.231-integration.20261021090000'

function entry(repo: string, tag: string): string {
  return `<entry><link rel="alternate" type="text/html" href="https://github.com/${repo}/releases/tag/${tag}"/></entry>`
}

function serveForkFeed(fetched: string[]): void {
  netFetchMock.mockImplementation((url: string) => {
    fetched.push(url)
    if (url === `https://github.com/${FORK_REPO}/releases.atom`) {
      const entries = [
        entry('stablyai/orca', 'v9.9.9'),
        entry('example/orcaXfork', 'v9.9.8'),
        entry(FORK_REPO, NEWER_TAG),
        entry(FORK_REPO, `v${CURRENT}`)
      ].join('')
      return Promise.resolve({ ok: true, text: () => Promise.resolve(`<feed>${entries}</feed>`) })
    }
    if (url.endsWith('.yml')) {
      const manifest = `version: ${NEWER_TAG.slice(1)}\nfiles:\n  - url: orca-windows-setup.exe\n    sha512: test\npath: orca-windows-setup.exe`
      return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(manifest) })
    }
    return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('') })
  })
}

// Integration-only (AGENTS.md): a fork's release build updates from its own releases, never stablyai/orca.
describe('release feed of a build that names its release repo', () => {
  beforeEach(() => {
    vi.resetModules()
    netFetchMock.mockReset()
    netRequestMock.mockReset()
    installNetRequestFetchAdapter(netRequestMock, netFetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('follows stablyai/orca when the build names no repo', async () => {
    const { LATEST_RELEASE_DOWNLOAD_URL } = await import('./updater/update-release-repo')

    expect(LATEST_RELEASE_DOWNLOAD_URL).toBe(
      'https://github.com/stablyai/orca/releases/latest/download'
    )
  })

  it('reads and pins only the named repo', async () => {
    vi.stubGlobal('ORCA_UPDATE_RELEASE_REPO', FORK_REPO)
    const fetched: string[] = []
    serveForkFeed(fetched)
    const { fetchNewerReleaseTagsWithReadiness, getReleaseDownloadUrl } =
      await import('./updater-prerelease-feed')
    const { LATEST_RELEASE_DOWNLOAD_URL } = await import('./updater/update-release-repo')

    expect(await fetchNewerReleaseTagsWithReadiness(CURRENT, 1)).toEqual({
      tags: [NEWER_TAG],
      state: 'ready'
    })
    expect(getReleaseDownloadUrl(NEWER_TAG)).toBe(
      `https://github.com/${FORK_REPO}/releases/download/${encodeURIComponent(NEWER_TAG)}`
    )
    expect(LATEST_RELEASE_DOWNLOAD_URL).toBe(
      `https://github.com/${FORK_REPO}/releases/latest/download`
    )
    expect(fetched.filter((url) => !url.startsWith(`https://github.com/${FORK_REPO}/`))).toEqual([])
  })
})
