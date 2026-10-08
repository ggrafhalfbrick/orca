// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { usePluginPanelsStore } from '@/store/plugin-panels'
import { resetPluginWorktreeBadgeChecksForTests } from '@/lib/plugin-worktree-badge-match'
import type { PluginHostListEntry } from '../../../../preload/api-types'
import { WorktreeCardPluginBadges } from './WorktreeCardPluginBadges'

const toastMocks = vi.hoisted(() => Object.assign(vi.fn(), { error: vi.fn() }))

vi.mock('sonner', () => ({ toast: toastMocks }))

vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string, values?: Record<string, string>) =>
    fallback.replace('{{value0}}', values?.value0 ?? '')
}))

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => (
    <span data-tooltip="">{children}</span>
  ),
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>
}))

const WORKTREE_ID = 'repo-1::/work/game'

function enginePlugin(host: 'local' | 'any' = 'local'): PluginHostListEntry {
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
        title: 'Open in Engine',
        context: 'worktree',
        handler: { type: 'worker' },
        keybindings: []
      }
    ],
    worktreeBadges: [
      {
        id: 'engine-project',
        title: 'Engine project',
        icon: { kind: 'svg', markup: '<svg viewBox="0 0 16 16"></svg>' },
        when: { pathExists: ['engine.project'], host },
        commands: ['open-project']
      }
    ],
    hasWorker: true,
    restarts: 0
  }
}

let pathExists: ReturnType<typeof vi.fn>
let invokeCommand: ReturnType<typeof vi.fn>

beforeEach(() => {
  resetPluginWorktreeBadgeChecksForTests()
  pathExists = vi.fn().mockResolvedValue(true)
  invokeCommand = vi.fn().mockResolvedValue({ message: 'Starting Engine…' })
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      fs: { pathExists },
      plugins: { list: vi.fn().mockResolvedValue([]), onChanged: vi.fn(), invokeCommand }
    }
  })
  usePluginPanelsStore.getState().setPlugins([enginePlugin()])
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function renderBadges(connectionId: string | null = null) {
  return render(
    <WorktreeCardPluginBadges
      worktreeId={WORKTREE_ID}
      worktreePath="/work/game"
      connectionId={connectionId}
      isActive={false}
      onPointerDown={vi.fn()}
    />
  )
}

describe('WorktreeCardPluginBadges', () => {
  it('shows the badge once the marker file exists and runs its command on this worktree', async () => {
    const user = userEvent.setup()
    renderBadges()

    const badge = await screen.findByRole('button', { name: 'Engine project' })
    expect(pathExists).toHaveBeenCalledWith({ filePath: '/work/game/engine.project' })

    await user.click(badge)
    await user.click(await screen.findByRole('menuitem', { name: 'Open in Engine' }))

    await waitFor(() =>
      expect(invokeCommand).toHaveBeenCalledWith({
        pluginKey: 'orca-samples.engine',
        commandId: 'open-project',
        args: { worktreeId: WORKTREE_ID }
      })
    )
    expect(toastMocks).toHaveBeenCalledWith('Starting Engine…')
  })

  it('stays hidden when the marker file is missing', async () => {
    pathExists.mockResolvedValue(false)
    renderBadges()

    await waitFor(() => expect(pathExists).toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: 'Engine project' })).toBeNull()
  })

  it('never checks SSH worktrees for local-only badges', async () => {
    renderBadges('ssh-target-1')

    await Promise.resolve()
    expect(pathExists).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Engine project' })).toBeNull()
  })

  it('checks SSH worktrees through their connection when a badge allows any host', async () => {
    usePluginPanelsStore.getState().setPlugins([enginePlugin('any')])
    renderBadges('ssh-target-1')

    await screen.findByRole('button', { name: 'Engine project' })
    expect(pathExists).toHaveBeenCalledWith({
      filePath: '/work/game/engine.project',
      connectionId: 'ssh-target-1'
    })
  })

  it('reports a failed command with the plugin error', async () => {
    invokeCommand.mockRejectedValue(
      new Error(
        "Error invoking remote method 'plugins:invokeCommand': Error: Engine 2.1 is not installed."
      )
    )
    const user = userEvent.setup()
    renderBadges()

    await user.click(await screen.findByRole('button', { name: 'Engine project' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Open in Engine' }))

    await waitFor(() =>
      expect(toastMocks.error).toHaveBeenCalledWith('Could not run Open in Engine', {
        description: 'Engine 2.1 is not installed.'
      })
    )
  })
})
