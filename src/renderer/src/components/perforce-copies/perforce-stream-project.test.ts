import { describe, expect, it, vi } from 'vitest'
import type { Repo } from '../../../../shared/repo-types'

const streams = vi.hoisted((): Record<string, string> => ({
  '/work/remote': '//Game/Main_Dev',
  '/work/game': '//Game/Main_Dev',
  '/work/feature': '//Game/Main_Dev_Feature',
  '/work/tools': '//Tools/Main'
}))

vi.mock('@/lib/perforce-workspace-target', () => ({
  perforceTargetForWorktree: (_worktreeId: string, worktreePath: string) => ({ worktreePath })
}))
vi.mock('../../runtime/runtime-perforce-client', () => ({
  runPerforceOperation: async ({ worktreePath }: { worktreePath: string }) => ({
    isWorkspace: true,
    info: { client: 'c', user: 'u', port: 'p', root: 'r', stream: streams[worktreePath] }
  })
}))

import {
  depotOfPath,
  findPerforceProjectForHint,
  scorePerforceStream
} from './perforce-stream-project'

describe('depotOfPath', () => {
  it('reads the depot of a depot or stream path', () => {
    expect(depotOfPath('//Game/Main_Dev')).toBe('//Game')
    expect(depotOfPath('//Game')).toBe('//Game')
    expect(depotOfPath('origin/main')).toBeUndefined()
    expect(depotOfPath('https://github.com/acme/app')).toBeUndefined()
  })
})

describe('scorePerforceStream', () => {
  const hint = { stream: '//Game/Main_Dev_Feature', depot: '//Game' }

  it('ranks the exact stream over the rest of the depot, and nothing outside it', () => {
    expect(scorePerforceStream('//game/main_dev_feature', hint)).toBe(2)
    expect(scorePerforceStream('//Game/Main_Dev', hint)).toBe(1)
    expect(scorePerforceStream('//Other/Main', hint)).toBe(0)
    expect(scorePerforceStream(undefined, hint)).toBe(0)
  })
})

function project(id: string, path: string, vcs?: 'perforce', connectionId?: string): Repo {
  return {
    id,
    path,
    displayName: id,
    badgeColor: '#000000',
    addedAt: 0,
    kind: vcs ? 'folder' : 'git',
    ...(vcs ? { vcs } : {}),
    ...(connectionId ? { connectionId } : {})
  }
}

const repos = [
  project('git', '/work/git'),
  project('remote', '/work/remote', 'perforce', 'ssh-1'),
  project('game', '/work/game', 'perforce'),
  project('feature', '/work/feature', 'perforce'),
  project('tools', '/work/tools', 'perforce')
]
describe('findPerforceProjectForHint', () => {
  it('prefers the base stream, then any local project in the depot, never a Git project', async () => {
    await expect(
      findPerforceProjectForHint(repos, { baseRef: '//Game/Main_Dev_Feature' }, 'git')
    ).resolves.toEqual({ repoId: 'feature' })
    await expect(
      findPerforceProjectForHint(repos, { projectSource: '//Game', baseRef: '//Game/Art' }, 'git')
    ).resolves.toEqual({ repoId: 'game' })
    await expect(
      findPerforceProjectForHint(repos, { projectSource: '//Game' }, 'remote')
    ).resolves.toEqual({ repoId: 'remote' })
  })

  it('names the depot when no project is in it, and ignores hints that are not depot paths', async () => {
    await expect(
      findPerforceProjectForHint(repos, { projectSource: '//Art' }, 'git')
    ).resolves.toMatchObject({ missing: expect.stringContaining('//Art') })
    await expect(
      findPerforceProjectForHint(
        repos,
        { projectSource: 'https://github.com/acme/app', baseRef: 'main' },
        'git'
      )
    ).resolves.toBeNull()
  })
})
