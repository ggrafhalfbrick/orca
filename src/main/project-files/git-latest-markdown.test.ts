import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Repo } from '../../shared/repo-types'
import { runProcess } from '../../shared/child-process/run-process'
import { gitLatestMarkdownReader, parseLsTreeMarkdown } from './git-latest-markdown'

let root = ''
let env: NodeJS.ProcessEnv = {}
let repoCount = 0

async function git(cwd: string, args: string[]): Promise<string> {
  const result = await runProcess({ program: 'git', args, cwd, env })
  if (result.code !== 0) {
    throw new Error(result.stderr)
  }
  return result.stdout
}

async function writeNote(base: string, path: string, text: string): Promise<void> {
  const full = join(base, ...path.split('/'))
  await mkdir(join(full, '..'), { recursive: true })
  await writeFile(full, text)
}

function project(path: string): Repo {
  repoCount += 1
  // Why: a fresh id per project skips the reader's once-a-minute fetch throttle between tests.
  return { id: `repo-${repoCount}`, path, displayName: 'notes', badgeColor: '', addedAt: 0 }
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'orca-git-latest-markdown-'))
  const globalConfig = join(root, 'global.gitconfig')
  await writeFile(globalConfig, '[user]\n\tname = Test\n\temail = test@example.com\n')
  env = { ...process.env, GIT_CONFIG_GLOBAL: globalConfig, GIT_CONFIG_NOSYSTEM: '1' }
  vi.stubEnv('GIT_CONFIG_GLOBAL', globalConfig)
  vi.stubEnv('GIT_CONFIG_NOSYSTEM', '1')
})

afterEach(async () => {
  vi.unstubAllEnvs()
  await rm(root, { recursive: true, force: true })
})

/** A clone of a bare "server" repo, plus a second clone that has pushed a newer note. */
async function cloneBehindServer(): Promise<string> {
  const server = join(root, 'server.git')
  const work = join(root, 'work')
  const other = join(root, 'other')
  await git(root, ['init', '-q', '--bare', server])
  await mkdir(work)
  await git(work, ['init', '-q'])
  await git(work, ['checkout', '-q', '-b', 'main'])
  await writeNote(work, 'notes/a.md', '# A\n')
  await writeNote(work, 'notes/sub/b.md', '# B\n')
  await writeNote(work, 'notes/.hidden/c.md', '# C\n')
  await writeNote(work, 'notes/readme.txt', 'not markdown\n')
  await writeNote(work, 'elsewhere/d.md', '# D\n')
  await git(work, ['add', '-A'])
  await git(work, ['commit', '-q', '-m', 'notes'])
  await git(work, ['remote', 'add', 'origin', server])
  await git(work, ['push', '-q', '-u', 'origin', 'main'])
  await git(root, ['clone', '-q', '--branch', 'main', server, other])
  await writeNote(other, 'notes/new.md', '# New on the server\n')
  await git(other, ['add', '-A'])
  await git(other, ['commit', '-q', '-m', 'new note'])
  await git(other, ['push', '-q', 'origin', 'main'])
  return work
}

describe('gitLatestMarkdownReader', () => {
  it('fetches and lists the upstream branch, then reads files by blob id', async () => {
    const repo = project(await cloneBehindServer())

    const listing = await gitLatestMarkdownReader.list(repo, 'notes')

    expect(listing.revision).toMatch(/^[0-9a-f]{40}$/)
    expect(listing.notice).toBeUndefined()
    expect(listing.files.map((file) => file.path).sort()).toEqual([
      'notes/a.md',
      'notes/new.md',
      'notes/sub/b.md'
    ])
    const reads = await gitLatestMarkdownReader.read(repo, listing.files)
    expect(reads).toContainEqual({ path: 'notes/new.md', content: '# New on the server\n' })
    expect(reads).toContainEqual({ path: 'notes/a.md', content: '# A\n' })
  })

  it('says so and keeps the last fetched version when the server is unreachable', async () => {
    const work = await cloneBehindServer()
    await git(work, ['fetch', '-q'])
    await git(work, ['remote', 'set-url', 'origin', join(root, 'gone.git')])

    const listing = await gitLatestMarkdownReader.list(project(work), '')

    expect(listing.notice).toMatch(/Could not fetch, so this is origin\/main as last fetched/)
    expect(listing.files.map((file) => file.path)).toContain('notes/new.md')
  })

  it('refuses a branch with no upstream and reads that need a listed version', async () => {
    const lonely = join(root, 'lonely')
    await mkdir(lonely)
    await git(lonely, ['init', '-q'])
    const repo = project(lonely)

    await expect(gitLatestMarkdownReader.list(repo, '')).rejects.toThrow(/no upstream/)
    await expect(
      gitLatestMarkdownReader.read(repo, [{ path: 'a.md', version: null }])
    ).resolves.toEqual([{ path: 'a.md', error: 'needs the version from the latest listing' }])
  })
})

describe('parseLsTreeMarkdown', () => {
  const blob = (n: number): string => String(n).repeat(40)
  const entry = (type: string, id: string, path: string): string =>
    `100644 ${type} ${id}     12\t${path}`

  it('keeps markdown blobs in the folder and skips trees, dot-folders and other files', () => {
    const stdout = [
      entry('blob', blob(1), 'plans/a.md'),
      entry('blob', blob(2), 'plans/B.MARKDOWN'),
      entry('commit', blob(3), 'plans/submodule.md'),
      entry('blob', blob(4), 'plans/.drafts/x.md'),
      entry('blob', blob(5), 'plans/node_modules/y.md'),
      entry('blob', blob(6), 'plans-old/z.md'),
      entry('blob', blob(7), 'plans/notes.txt'),
      ''
    ].join('\0')

    expect(parseLsTreeMarkdown(stdout, 'plans')).toEqual({
      files: [
        { path: 'plans/a.md', version: blob(1) },
        { path: 'plans/B.MARKDOWN', version: blob(2) }
      ],
      truncated: false
    })
  })
})
