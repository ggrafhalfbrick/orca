import { describe, expect, it, vi } from 'vitest'
import { parsePluginManifest } from '../../shared/plugins/plugin-manifest'
import type { ValidDiscoveredPlugin } from './plugin-discovery'
import { prepareWorkerCommandArgs } from './plugin-command-invocation'

function plugin(
  capabilities: { kind: string }[] = [{ kind: 'workspace:read' }]
): ValidDiscoveredPlugin {
  const parsed = parsePluginManifest({
    manifestVersion: 1,
    id: 'engine',
    publisher: 'orca-samples',
    name: 'Engine',
    version: '1.0.0',
    engines: { orca: '>=1.0.0' },
    pluginApi: 1,
    main: 'main.mjs',
    contributes: {
      commands: [
        { id: 'open-project', title: 'Open project', context: 'worktree' },
        { id: 'refresh', title: 'Refresh' },
        { id: 'tasks', title: 'Tasks', action: 'view.tasks' }
      ]
    },
    capabilities
  })
  if (!parsed.ok) {
    throw new Error(parsed.error)
  }
  return {
    pluginKey: 'orca-samples.engine',
    rootDir: '/plugins/engine',
    manifest: parsed.manifest,
    consentFingerprint: 'fingerprint',
    contentHash: null,
    isDev: true
  }
}

const worktree = {
  path: '/work/game',
  displayName: 'game',
  branch: 'feature',
  host: 'local' as const
}

function resolver(result: typeof worktree | null = worktree) {
  return { resolvePluginWorktreeContext: vi.fn().mockResolvedValue(result) }
}

describe('prepareWorkerCommandArgs', () => {
  it('passes args without a worktree request through unchanged', async () => {
    const worktrees = resolver()

    await expect(
      prepareWorkerCommandArgs(plugin(), 'refresh', { page: 2 }, worktrees)
    ).resolves.toEqual({ page: 2 })
    expect(worktrees.resolvePluginWorktreeContext).not.toHaveBeenCalled()
  })

  it('replaces a worktree id with the resolved worktree context', async () => {
    const worktrees = resolver()

    await expect(
      prepareWorkerCommandArgs(plugin(), 'open-project', { worktreeId: 'r::/work/game' }, worktrees)
    ).resolves.toEqual({ worktree })
    expect(worktrees.resolvePluginWorktreeContext).toHaveBeenCalledWith('r::/work/game')
  })

  it('never forwards the worktree id, which embeds its path', async () => {
    const worktrees = resolver()
    const request = { worktreeId: 'r::/work/game' }

    await expect(
      prepareWorkerCommandArgs(plugin([]), 'open-project', request, worktrees)
    ).resolves.toBeUndefined()
    await expect(
      prepareWorkerCommandArgs(plugin(), 'refresh', request, worktrees)
    ).resolves.toBeUndefined()
    expect(worktrees.resolvePluginWorktreeContext).not.toHaveBeenCalled()
  })

  it('fails when the worktree cannot be resolved on this host', async () => {
    await expect(
      prepareWorkerCommandArgs(plugin(), 'open-project', { worktreeId: 'gone' }, resolver(null))
    ).rejects.toThrow('not available')
    await expect(
      prepareWorkerCommandArgs(plugin(), 'open-project', { worktreeId: 'gone' }, null)
    ).rejects.toThrow('not available')
  })

  it('still refuses built-in aliases and unknown commands', async () => {
    await expect(prepareWorkerCommandArgs(plugin(), 'tasks', undefined, null)).rejects.toThrow(
      'built-in action alias'
    )
    await expect(prepareWorkerCommandArgs(plugin(), 'missing', undefined, null)).rejects.toThrow(
      'does not contribute'
    )
  })
})
