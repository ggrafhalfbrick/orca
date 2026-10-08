import { describe, expect, it } from 'vitest'
import type { PluginHostListEntry } from '../../../preload/api-types'
import { collectActivePluginWorktreeBadges } from './plugin-worktree-badges'

function plugin(overrides: Partial<PluginHostListEntry> = {}): PluginHostListEntry {
  return {
    pluginKey: 'orca-samples.engine',
    consentFingerprint: 'fingerprint',
    name: 'Engine',
    version: '1.0.0',
    publisher: 'orca-samples',
    status: 'idle',
    needsReconsent: false,
    isDev: false,
    official: false,
    bundled: false,
    capabilities: [],
    panels: [],
    commands: [
      {
        id: 'open-project',
        title: 'Open project',
        context: 'worktree',
        handler: { type: 'worker' },
        keybindings: []
      },
      {
        id: 'refresh',
        title: 'Refresh',
        context: 'global',
        handler: { type: 'worker' },
        keybindings: []
      }
    ],
    worktreeBadges: [
      {
        id: 'engine-project',
        title: 'Engine project',
        icon: { kind: 'lucide', name: 'gamepad-2' },
        when: { pathExists: ['engine.project'], host: 'local' },
        commands: ['open-project', 'refresh', 'missing']
      }
    ],
    hasWorker: true,
    restarts: 0,
    ...overrides
  }
}

describe('collectActivePluginWorktreeBadges', () => {
  it('keeps only runnable worktree commands of enabled plugins', () => {
    const [badge, ...rest] = collectActivePluginWorktreeBadges([plugin()])

    expect(rest).toEqual([])
    expect(badge).toMatchObject({
      key: 'orca-samples.engine/engine-project',
      pluginName: 'Engine',
      title: 'Engine project'
    })
    expect(badge?.commands.map((command) => command.id)).toEqual(['open-project'])
  })

  it('drops badges of disabled or pending plugins and of hosts without badges', () => {
    expect(collectActivePluginWorktreeBadges([plugin({ status: 'pending' })])).toEqual([])
    expect(collectActivePluginWorktreeBadges([plugin({ status: 'disabled' })])).toEqual([])
    expect(collectActivePluginWorktreeBadges([plugin({ worktreeBadges: undefined })])).toEqual([])
  })

  it('drops a badge with no runnable command left', () => {
    const entry = plugin()
    entry.worktreeBadges = [{ ...entry.worktreeBadges![0]!, commands: ['refresh'] }]

    expect(collectActivePluginWorktreeBadges([entry])).toEqual([])
  })
})
