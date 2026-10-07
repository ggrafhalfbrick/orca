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

const SOURCE = { pluginKey: 'orca-samples.roadmap', sourceId: 'plans', title: 'Roadmap' }

describe('openComposerForPluginTask', () => {
  it('prefills Create workspace from the start recipe and links the workspace back', () => {
    const opened = openComposerForPluginTask(
      {
        id: 'plan',
        title: 'Plan title',
        url: 'https://example.com/plan',
        start: {
          workspaceName: 'plan',
          agentPrompt: 'Implement the plan.',
          baseRef: 'main',
          projectPath: '/home/me/Work',
          sessionOptions: { model: 'opus', effort: 'max' },
          linkMetadata: { plan: 'plans/plan.md' }
        }
      },
      SOURCE
    )

    expect(opened).toBe(true)
    expect(mocks.openModal).toHaveBeenCalledWith('new-workspace-composer', {
      prefilledName: 'plan',
      initialRepoId: 'local',
      initialBaseBranch: 'main',
      initialAgentDraft: 'Implement the plan.',
      initialAgentSessionOptions: { model: 'opus', effort: 'max' },
      linkedPluginTask: {
        pluginKey: 'orca-samples.roadmap',
        sourceId: 'plans',
        itemId: 'plan',
        title: 'Plan title',
        sourceTitle: 'Roadmap',
        url: 'https://example.com/plan',
        metadata: { plan: 'plans/plan.md' }
      },
      telemetrySource: 'sidebar'
    })
  })

  it('does nothing for an item without a start recipe', () => {
    expect(openComposerForPluginTask({ id: 'manual', title: 'Manual plan' }, SOURCE)).toBe(false)
    expect(mocks.openModal).not.toHaveBeenCalled()
  })
})
