import { describe, expect, it } from 'vitest'
import type { Repo } from '../../../shared/repo-types'
import { findGitProjectForSource } from './git-remote-project-match'

function project(id: string, canonicalKey: string | null, extra: Partial<Repo> = {}): Repo {
  return {
    id,
    path: `/work/${id}`,
    displayName: id,
    badgeColor: '#000000',
    addedAt: 0,
    gitRemoteIdentity: canonicalKey
      ? { canonicalKey, remoteName: 'origin', remoteUrl: `https://${canonicalKey}` }
      : null,
    ...extra
  }
}

const repos = [
  project('app', 'github.com/acme/app'),
  project('nested', 'gitlab.example.com/group/sub/tool'),
  project('aliased', 'github-work/acme/lib'),
  project('folder', 'github.com/acme/lib', { kind: 'folder' }),
  project('unprobed', null)
]

describe('findGitProjectForSource', () => {
  it('matches any remote URL form to the project with that remote', () => {
    for (const projectSource of [
      'https://github.com/acme/app',
      'git@github.com:acme/app.git',
      'ssh://git@ssh.github.com:443/Acme/App.git',
      'https://www.github.com/acme/app/'
    ]) {
      expect(findGitProjectForSource(repos, { projectSource }, null)).toEqual({ repoId: 'app' })
    }
    expect(
      findGitProjectForSource(
        repos,
        { projectSource: 'https://gitlab.example.com/group/sub/tool' },
        null
      )
    ).toEqual({ repoId: 'nested' })
  })

  it('accepts a project behind an SSH host alias with the same path, but prefers an exact host', () => {
    const hint = { projectSource: 'https://github.com/acme/lib' }
    expect(findGitProjectForSource(repos, hint, null)).toEqual({ repoId: 'aliased' })
    const exact = [...repos, project('exact', 'github.com/acme/lib')]
    expect(findGitProjectForSource(exact, hint, 'aliased')).toEqual({ repoId: 'exact' })
  })

  it('names the remote when no Git project has it', () => {
    expect(
      findGitProjectForSource(repos, { projectSource: 'https://github.com/acme/other' }, 'app')
    ).toEqual({ missing: expect.stringContaining('github.com/acme/other') })
  })

  it('leaves hints that are not Git remotes to other matchers', () => {
    expect(findGitProjectForSource(repos, {}, null)).toBeNull()
    expect(findGitProjectForSource(repos, { projectSource: 'docs' }, null)).toBeNull()
    expect(findGitProjectForSource(repos, { projectSource: '/srv/repos/app' }, null)).toBeNull()
  })
})
