import assert from 'node:assert/strict'
import { test } from 'node:test'
import { openUnityProject } from '../src/open-project.mjs'

const worktree = { path: '/work/game', displayName: 'game', branch: 'feature', host: 'local' }

function deps(overrides = {}) {
  const launches = []
  return {
    launches,
    readVersion: async () => '6000.0.23f1',
    isOpen: async () => false,
    findEditor: async () => '/opt/Unity/6000.0.23f1/Editor/Unity',
    listVersions: async () => [],
    launch: async (...args) => {
      launches.push(args)
    },
    env: { DISPLAY: ':0' },
    platform: 'linux',
    ...overrides
  }
}

test('opens the project in the editor version it was saved with', async () => {
  const d = deps()
  assert.deepEqual(await openUnityProject(worktree, d), {
    message: 'Opening game in Unity 6000.0.23f1…'
  })
  assert.equal(d.launches[0][0], '/opt/Unity/6000.0.23f1/Editor/Unity')
  assert.equal(d.launches[0][1], '/work/game')
})

test('does not start a second editor on an open project', async () => {
  const d = deps({ isOpen: async () => true })
  assert.deepEqual(await openUnityProject(worktree, d), { message: 'Unity already has game open.' })
  assert.equal(d.launches.length, 0)
})

test('names the missing version and what is installed', async () => {
  const d = deps({ findEditor: async () => null, listVersions: async () => ['2022.3.1f1'] })
  await assert.rejects(
    openUnityProject(worktree, d),
    /Unity 6000\.0\.23f1 is not installed\. Install it from Unity Hub, then try again\. Installed: 2022\.3\.1f1\./
  )
})

test('refuses remote worktrees and runs without a worktree', async () => {
  await assert.rejects(openUnityProject({ ...worktree, host: 'ssh' }, deps()), /on this computer/)
  await assert.rejects(openUnityProject(undefined, deps()), /on a worktree/)
})

test('explains a missing Linux display instead of starting a windowless editor', async () => {
  const d = deps({ env: {} })
  await assert.rejects(openUnityProject(worktree, d), /display/)
  assert.equal(d.launches.length, 0)
})
