import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const repos: unknown[] = []
  return { openModal: vi.fn(), repos }
})
vi.mock('@/store', () => ({
  useAppStore: { getState: () => ({ repos: mocks.repos, openModal: mocks.openModal }) }
}))

import { findRepoIdForProjectPath, openComposerForPluginTask } from './plugin-task-start'

const repos = [
  { id: 'remote', path: '/home/me/Work', connectionId: 'ssh-1' },
  { id: 'local', path: '/home/me/Work/', connectionId: null }
]

beforeEach(() => {
  mocks.openModal.mockReset()
  mocks.repos = repos
})

describe('findRepoIdForProjectPath', () => {
  it('matches across a trailing separator, preferring local projects', () => {
    expect(findRepoIdForProjectPath(repos, '/home/me/Work')).toBe('local')
  })

  it('keeps POSIX paths case-sensitive', () => {
    expect(findRepoIdForProjectPath(repos, '/home/me/work')).toBeNull()
  })
})

describe('openComposerForPluginTask', () => {
  it('prefills Create workspace from the start recipe', () => {
    const opened = openComposerForPluginTask({
      id: 'plan',
      title: 'Plan title',
      start: {
        workspaceName: 'plan',
        agentPrompt: 'Implement the plan.',
        baseRef: '//Depot/Main',
        projectPath: '/home/me/Work'
      }
    })

    expect(opened).toBe(true)
    expect(mocks.openModal).toHaveBeenCalledWith('new-workspace-composer', {
      prefilledName: 'plan',
      initialRepoId: 'local',
      initialBaseBranch: '//Depot/Main',
      initialAgentDraft: 'Implement the plan.',
      telemetrySource: 'sidebar'
    })
  })

  it('does nothing for an item without a start recipe', () => {
    expect(openComposerForPluginTask({ id: 'manual', title: 'Manual plan' })).toBe(false)
    expect(mocks.openModal).not.toHaveBeenCalled()
  })
})
