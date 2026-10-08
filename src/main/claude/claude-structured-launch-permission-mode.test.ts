import { describe, expect, it, vi } from 'vitest'
import type { AgentSessionJournalIdentity } from '../../shared/agent-session-journal-types'
import { agentSessionRecordFixture } from '../../shared/agent-session-record.test-fixture'
import { LOCAL_EXECUTION_HOST_ID } from '../../shared/execution-host'
import {
  createClaudeStructuredLaunchResolver,
  type ClaudeStructuredLaunchResolverDeps
} from './claude-structured-launch-resolution'
import { claudeStructuredPermissionModeForSettings } from './claude-structured-permission-mode'
import {
  CLAUDE_ALLOW_BYPASS_FLAG,
  CLAUDE_THINKING_DISPLAY_FLAG,
  createClaudeCliFlagSupport,
  type ClaudeCliFlag
} from './claude-cli-flag-support'

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
  cliFlags?: ClaudeStructuredLaunchResolverDeps['cliFlags']
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
    ...(cliFlags ? { cliFlags } : {})
  })({ identity: IDENTITY })
}

/** A CLI that takes the allow-bypass flag and, when asked, nothing else. */
const takesAllowBypass = () =>
  vi.fn(
    async (flag: ClaudeCliFlag, _launch: { command: string }) => flag === CLAUDE_ALLOW_BYPASS_FLAG
  )

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
    const supports = takesAllowBypass()
    const yolo = await launchFor('--dangerously-skip-permissions', { supports })

    expect(yolo.keepsBypassAvailable).toBe(true)
    expect(yolo.options.extraArgs).not.toHaveProperty('allow-dangerously-skip-permissions')
    expect(supports).toHaveBeenCalledWith(
      CLAUDE_ALLOW_BYPASS_FLAG,
      expect.objectContaining({ command: '/usr/local/bin/claude' })
    )
    const older = await launchFor('--dangerously-skip-permissions', {
      supports: async () => false
    })
    expect(older.keepsBypassAvailable).toBeUndefined()
  })

  it('never asks about the allow flag for a launch with no bypass to keep', async () => {
    const supports = takesAllowBypass()
    const manual = await launchFor('--permission-mode auto', { supports })

    expect(supports).not.toHaveBeenCalledWith(CLAUDE_ALLOW_BYPASS_FLAG, expect.anything())
    expect(manual.keepsBypassAvailable).toBeUndefined()
  })
})

describe('Claude allow-bypass flag support', () => {
  // The flag's floor is the earliest release the CLI changelog names it in.
  it.each([
    ['2.1.142', false],
    ['2.1.143', true],
    ['2.1.292', true]
  ])('reads CLI %s as %s', async (version, takesFlag) => {
    const support = createClaudeCliFlagSupport({
      probe: async () => version,
      keyOf: async () => 'claude-key',
      budgetMs: 1_000,
      now: () => 0
    })
    const launch = { command: '/usr/local/bin/claude', cwd: '/repo', env: {} }

    await expect(support.supports(CLAUDE_ALLOW_BYPASS_FLAG, launch)).resolves.toBe(takesFlag)
    // One probe answers every flag: thinking display predates the allow flag.
    await expect(support.supports(CLAUDE_THINKING_DISPLAY_FLAG, launch)).resolves.toBe(true)
  })

  it('stops passing the flag once a CLI refuses it', async () => {
    const support = createClaudeCliFlagSupport({
      probe: async () => '2.1.200',
      keyOf: async () => 'claude-key',
      budgetMs: 1_000,
      now: () => 0
    })
    const launch = { command: '/usr/local/bin/claude', cwd: '/repo', env: {} }
    await support.supports(CLAUDE_ALLOW_BYPASS_FLAG, launch)

    support.observeExit(
      launch,
      new Error("error: unknown option '--allow-dangerously-skip-permissions'")
    )

    await vi.waitFor(async () =>
      expect(await support.supports(CLAUDE_ALLOW_BYPASS_FLAG, launch)).toBe(false)
    )
    await expect(support.supports(CLAUDE_THINKING_DISPLAY_FLAG, launch)).resolves.toBe(true)
  })
})
