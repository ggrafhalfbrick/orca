import { describe, expect, it, vi } from 'vitest'
import type { Repo } from '../../shared/repo-types'
import type { ProjectLatestMarkdownReader } from '../project-files/project-latest-markdown'
import { createPluginProjectFiles, type PluginProjectFilesDelegate } from './plugin-project-files'

function repo(id: string, extra: Partial<Repo> = {}): Repo {
  return { id, path: `/work/${id}`, displayName: id, badgeColor: '', addedAt: 0, ...extra }
}

const repos = [
  repo('app'),
  repo('notes', { kind: 'folder' }),
  repo('remote', { connectionId: 'box' }),
  repo('server', { executionHostId: 'runtime:env-1' })
]

function delegate(overrides: Partial<PluginProjectFilesDelegate> = {}): PluginProjectFilesDelegate {
  return {
    listRepos: () => repos,
    listRuntimeMarkdownDocuments: vi.fn().mockResolvedValue([
      { filePath: '', relativePath: 'plans\\a.md', basename: 'a.md', name: 'a' },
      { filePath: '', relativePath: 'plans/sub/b.md', basename: 'b.md', name: 'b' },
      { filePath: '', relativePath: 'README.md', basename: 'README.md', name: 'README' }
    ]),
    readMobileFile: vi.fn(async (_selector: string, path: string) =>
      path === 'big.md'
        ? { content: '', truncated: true }
        : { content: `# ${path}`, truncated: false }
    ),
    ...overrides
  }
}

const gitReader: ProjectLatestMarkdownReader = {
  sourceControl: 'git',
  handles: (candidate) => candidate.kind !== 'folder',
  list: vi.fn().mockResolvedValue({ revision: 'abc', files: [], truncated: false }),
  read: vi.fn().mockResolvedValue([{ path: 'a.md', content: 'latest' }])
}

describe('plugin project files', () => {
  it('lists projects with their source control and host, never their paths', async () => {
    const files = createPluginProjectFiles(delegate(), [gitReader])

    await expect(files.list()).resolves.toEqual([
      { id: 'app', name: 'app', sourceControl: 'git', host: 'local' },
      { id: 'notes', name: 'notes', sourceControl: 'none', host: 'local' },
      { id: 'remote', name: 'remote', sourceControl: 'git', host: 'ssh' },
      { id: 'server', name: 'server', sourceControl: 'git', host: 'server' }
    ])
  })

  it('lists markdown on disk under a folder, through the main worktree', async () => {
    const runtime = delegate()
    const files = createPluginProjectFiles(runtime, [gitReader])

    await expect(
      files.listMarkdown({ projectId: 'app', folder: 'plans', source: 'disk' })
    ).resolves.toEqual({
      revision: null,
      files: [
        { path: 'plans/a.md', version: null },
        { path: 'plans/sub/b.md', version: null }
      ],
      truncated: false
    })
    expect(runtime.listRuntimeMarkdownDocuments).toHaveBeenCalledWith('id:app::/work/app')
  })

  it('reads the latest version through the reader for the project, and disk for plain folders', async () => {
    const files = createPluginProjectFiles(delegate(), [gitReader])

    await files.listMarkdown({ projectId: 'app', folder: 'plans', source: 'latest' })
    expect(gitReader.list).toHaveBeenCalledWith(repos[0], 'plans')
    await expect(
      files.readMarkdown({
        projectId: 'app',
        source: 'latest',
        files: [{ path: 'a.md', version: 'x' }]
      })
    ).resolves.toEqual([{ path: 'a.md', content: 'latest' }])
    await expect(
      files.listMarkdown({ projectId: 'notes', folder: '', source: 'latest' })
    ).resolves.toMatchObject({ notice: expect.stringContaining('no server') })
  })

  it('reports files too large for a read, one by one', async () => {
    const files = createPluginProjectFiles(delegate(), [gitReader])

    await expect(
      files.readMarkdown({
        projectId: 'app',
        source: 'disk',
        files: [
          { path: 'a.md', version: null },
          { path: 'big.md', version: null }
        ]
      })
    ).resolves.toEqual([
      { path: 'a.md', content: '# a.md' },
      { path: 'big.md', error: 'file is larger than 512 KB' }
    ])
  })

  it('refuses unknown projects and projects on an Orca server', async () => {
    const files = createPluginProjectFiles(delegate(), [gitReader])

    await expect(
      files.listMarkdown({ projectId: 'gone', folder: '', source: 'disk' })
    ).rejects.toThrow(/no Orca project/)
    await expect(
      files.listMarkdown({ projectId: 'server', folder: '', source: 'disk' })
    ).rejects.toThrow(/Orca server/)
  })
})
