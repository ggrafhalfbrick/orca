import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Repo } from '../../shared/repo-types'

const mocks = vi.hoisted(() => ({
  latestMarkdownFiles: vi.fn(),
  printDepotFiles: vi.fn()
}))
vi.mock('../runtime/runtime-perforce-commands', () => ({
  perforceBackendForHost: () => ({
    latestMarkdownFiles: mocks.latestMarkdownFiles,
    printDepotFiles: mocks.printDepotFiles
  })
}))

import { perforceLatestMarkdownReader } from './perforce-latest-markdown'

const repo: Repo = {
  id: 'ws',
  path: '/ws/project',
  displayName: 'Project',
  badgeColor: '',
  addedAt: 0,
  kind: 'folder',
  vcs: 'perforce'
}

beforeEach(() => {
  mocks.latestMarkdownFiles.mockReset().mockResolvedValue({
    files: [
      { path: 'docs/a@v2.md', depotFile: '//depot/main/docs/a%40v2.md', rev: 3, change: 120 },
      {
        path: 'docs/.drafts/x.md',
        depotFile: '//depot/main/docs/.drafts/x.md',
        rev: 1,
        change: 140
      },
      // A stream component: another depot, mapped under the same folder.
      { path: 'docs/sub/b.md', depotFile: '//notes/component/b.md', rev: 2, change: 130 }
    ],
    truncated: false
  })
  mocks.printDepotFiles.mockReset()
})

describe('perforceLatestMarkdownReader', () => {
  it('handles Perforce projects only', () => {
    expect(perforceLatestMarkdownReader.handles(repo)).toBe(true)
    expect(perforceLatestMarkdownReader.handles({ ...repo, kind: 'git', vcs: undefined })).toBe(
      false
    )
  })

  it('lists head revisions as project paths, newest change as the revision', async () => {
    await expect(perforceLatestMarkdownReader.list(repo, 'docs')).resolves.toEqual({
      revision: '130',
      files: [
        { path: 'docs/a@v2.md', version: '3' },
        { path: 'docs/sub/b.md', version: '2' }
      ],
      truncated: false
    })
    expect(mocks.latestMarkdownFiles).toHaveBeenCalledWith('/ws/project', 'docs')
  })

  it('reads listed files at their revision and refuses ones it did not list', async () => {
    await perforceLatestMarkdownReader.list(repo, 'docs')
    mocks.printDepotFiles.mockResolvedValue([
      { depotFile: '//depot/main/docs/a%40v2.md', rev: 3, content: '# A' }
    ])

    await expect(
      perforceLatestMarkdownReader.read(repo, [
        { path: 'docs/a@v2.md', version: '3' },
        { path: 'docs/unlisted.md', version: '1' }
      ])
    ).resolves.toEqual([
      { path: 'docs/a@v2.md', content: '# A' },
      { path: 'docs/unlisted.md', error: 'needs the version from the latest listing' }
    ])
    expect(mocks.printDepotFiles).toHaveBeenCalledWith('/ws/project', [
      { depotFile: '//depot/main/docs/a%40v2.md', rev: 3 }
    ])
  })
})
