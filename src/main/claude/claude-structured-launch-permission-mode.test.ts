import { describe, expect, it, vi } from 'vitest'
import type { AgentSessionJournalIdentity } from '../../shared/agent-session-journal-types'
import { agentSessionRecordFixture } from '../../shared/agent-session-record.test-fixture'
import { LOCAL_EXECUTION_HOST_ID } from '../../shared/execution-host'
import { createClaudeStructuredLaunchResolver } from './claude-structured-launch-resolution'
import { claudeStructuredPermissionModeForSettings } from './claude-structured-permission-mode'
import { createClaudeAllowBypassSupport } from './claude-allow-bypass-support'

// A chat that has never started: no provider handle to resume.
const RECORD = { ...agentSessionRecordFixture(), providerHandleChain: [] }
const IDENTITY: AgentSessionJournalIdentity = {
  sessionId: RECORD.sessionId,
  workspaceId: RECORD.location.workspaceId,
  hostId: LOCAL_EXECUTION_HOST_ID,
  agent: 'claude',
  providerHandle: null
}

/** One Arguments field, as Settings holds it: the toggle and the launch read the same string. */
function launchFor(
  claudeArguments: string,
  allowBypass?: (launch: { command: string }) => Promise<Record<string, string | null>>
) {
  return createClaudeStructuredLaunchResolver({
    store: { getRecord: () => RECORD, pinLaunchDirectory: vi.fn() },
    resolveWorkspacePath: async (id) => `/repos/${id}`,
    resolveCommand: () => '/usr/local/bin/claude',
    resolveAuthPolicy: () => ({ stripAuthEnv: false }),
    resolvePermissionMode: () =>
      claudeStructuredPermissionModeForSettings({ agentDefaultArgs: { claude: claudeArguments } }),
    resolveLaunchArgs: () => claudeArguments.split(' ').filter(Boolean),
    hasTranscript: async () => false,
    ...(allowBypass ? { allowBypass: { argsFor: allowBypass } } : {})
  })({ identity: IDENTITY })
}

const ALLOW = { 'allow-dangerously-skip-permissions': null }

describe('Claude structured launch permission mode', () => {
  it.each(['auto', 'acceptEdits', 'plan', 'dontAsk'])(
    'starts a Manual chat in the Arguments mode %s, as a terminal would',
    async (mode) => {
      const launch = await launchFor(`--permission-mode ${mode}`)

      expect(launch.options.permissionMode).toBe(mode)
      expect(launch.options.extraArgs).not.toHaveProperty('dangerously-skip-permissions')
      expect(launch.options.extraArgs).not.toHaveProperty('permission-mode')
    }
  )

  it('lets Yolo win over an Arguments mode', async () => {
    const launch = await launchFor('--permission-mode auto --dangerously-skip-permissions')

    expect(launch.options.permissionMode).toBeUndefined()
    expect(launch.options.extraArgs).toHaveProperty('dangerously-skip-permissions')
  })

  // Bypass is the Agent Permissions setting's to grant, whatever the Arguments spell it as.
  it('never bypasses on an Arguments mode alone', async () => {
    const launch = await launchFor('--permission-mode bypassPermissions')

    expect(launch.options.permissionMode).toBeUndefined()
    expect(launch.options.extraArgs).not.toHaveProperty('dangerously-skip-permissions')
  })

  it('records whether a bypassing launch can keep bypass on offer, without passing the flag', async () => {
    const asked = vi.fn(async () => ALLOW)
    const yolo = await launchFor('--dangerously-skip-permissions', asked)

    expect(yolo.keepsBypassAvailable).toBe(true)
    expect(yolo.options.extraArgs).not.toHaveProperty('allow-dangerously-skip-permissions')
    expect(asked).toHaveBeenCalledWith(
      expect.objectContaining({ command: '/usr/local/bin/claude' })
    )
    const older = await launchFor('--dangerously-skip-permissions', async () => ({}))
    expect(older.keepsBypassAvailable).toBeUndefined()
  })

  it('never asks about the allow flag for a launch with no bypass to keep', async () => {
    const asked = vi.fn(async () => ALLOW)
    const manual = await launchFor('--permission-mode auto', asked)

    expect(asked).not.toHaveBeenCalled()
    expect(manual.keepsBypassAvailable).toBeUndefined()
  })
})

describe('Claude allow-bypass flag support', () => {
  // The flag's floor is the earliest release the CLI changelog names it in.
  it.each([
    ['2.1.142', {}],
    ['2.1.143', ALLOW],
    ['2.1.292', ALLOW]
  ])('reads CLI %s as %o', async (version, args) => {
    const support = createClaudeAllowBypassSupport({
      probe: async () => version,
      keyOf: async () => 'claude-key',
      budgetMs: 1_000,
      now: () => 0
    })

    await expect(
      support.argsFor({ command: '/usr/local/bin/claude', cwd: '/repo', env: {} })
    ).resolves.toEqual(args)
  })
})
