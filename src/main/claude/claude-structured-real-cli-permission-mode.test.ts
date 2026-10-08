import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import type { AgentSessionJournalIdentity } from '../../shared/agent-session-journal-types'
import { claudeProviderHandle } from '../../shared/agent-session-provider-handle-encoding'
import {
  CLAUDE_STRUCTURED_BASE_OPTIONS,
  claudeStructuredPermissionOptions
} from './claude-structured-launch-resolution'
import {
  realClaudeAuthenticated,
  realClaudeAvailable,
  realClaudeCliGate,
  realClaudeCommand,
  realClaudeLaunchHome
} from './claude-real-cli-availability-test-support'
import {
  ClaudeStructuredSessionAdapter,
  type ClaudeStructuredSessionEvent
} from './claude-structured-session-adapter'
import { claudeStartupSettled } from './claude-structured-session-test-support'
import { isAgentSessionOptionRejectedError } from '../native-chat/agent-session-wire/structured-agent-session-option-error'

const SESSION_ID = 'real-cli-permission-mode'
const suiteTitle = `Claude structured real CLI permission mode${realClaudeCliGate.skipReason ? ` (skipped: ${realClaudeCliGate.skipReason})` : ''}`

function realAdapter(
  providerSessionId: string,
  bypassing: boolean,
  events: ClaudeStructuredSessionEvent[],
  /** As a launch resolves for a CLI the allow-bypass probe vouched for. */
  keepsBypassAvailable = false
): ClaudeStructuredSessionAdapter {
  const home = realClaudeLaunchHome()
  const permission = claudeStructuredPermissionOptions(bypassing ? 'bypassPermissions' : 'default')
  const adapter = new ClaudeStructuredSessionAdapter({
    resolveLaunch: async () => ({
      pathToClaudeCodeExecutable: realClaudeCommand,
      options: {
        ...CLAUDE_STRUCTURED_BASE_OPTIONS,
        extraArgs: { ...CLAUDE_STRUCTURED_BASE_OPTIONS.extraArgs, ...permission.extraArgs },
        sessionId: providerSessionId
      },
      cwd: process.cwd(),
      env: home.env,
      claudeConfigDir: home.claudeConfigDir,
      providerSessionId,
      resumeLeafUuid: null,
      resumesTranscript: false,
      continuesChain: false,
      ...(keepsBypassAvailable ? { keepsBypassAvailable: true as const } : {})
    }),
    onEvent: (event) => events.push(event),
    readProcessStartTime: async () => 1,
    now: () => 2
  })
  const acquire = adapter.acquire
  adapter.acquire = async (input) => {
    const acquisition = await acquire(input)
    await claudeStartupSettled(adapter, input.identity.sessionId)
    return acquisition
  }
  return adapter
}

function identity(providerSessionId: string): AgentSessionJournalIdentity {
  return {
    sessionId: SESSION_ID,
    workspaceId: 'real-cli-workspace',
    hostId: 'local',
    agent: 'claude',
    providerHandle: claudeProviderHandle(providerSessionId, null)
  }
}

const setMode = (adapter: ClaudeStructuredSessionAdapter, value: string) =>
  adapter.setOption({ sessionId: SESSION_ID, key: 'permissionMode', value, fence: 1 })

/** The session's report with its modes as ids. */
const readMode = async (adapter: ClaudeStructuredSessionAdapter) => {
  const report = (await adapter.readOptions({ sessionId: SESSION_ID, fence: 1 })).permissionMode
  return report && { ...report, modes: report.modes.map((mode) => mode.id) }
}

describe.skipIf(!realClaudeAvailable)(suiteTitle, () => {
  // The init frame is the only report of the mode a turn actually ran under; a pick the CLI took
  // but never reported would leave the pill vouching for nothing.
  it.skipIf(!realClaudeAuthenticated)(
    'switches a prompting session into plan mode, refuses bypass, and reports plan on the turn',
    async () => {
      const providerSessionId = randomUUID()
      const events: ClaudeStructuredSessionEvent[] = []
      const adapter = realAdapter(providerSessionId, false, events)
      try {
        await adapter.acquire({ identity: identity(providerSessionId), fence: 1, spawnToken: 'pm' })
        expect(await readMode(adapter)).toMatchObject({
          current: 'default',
          modes: ['default', 'acceptEdits', 'plan', 'auto']
        })

        await setMode(adapter, 'plan')
        const refusal = await setMode(adapter, 'bypassPermissions').catch((error: unknown) => error)
        expect(isAgentSessionOptionRejectedError(refusal)).toBe(true)

        await adapter.setOption({ sessionId: SESSION_ID, key: 'model', value: 'haiku', fence: 1 })
        const before = events.length
        await adapter.dispatch({
          sessionId: SESSION_ID,
          clientMessageId: 'real-cli-permission-mode-1',
          body: { kind: 'message', role: 'user', blocks: [{ type: 'text', text: 'Say ok' }] },
          fence: 1
        })
        const deadline = Date.now() + 60_000
        let init: Record<string, unknown> | undefined
        while (!init && Date.now() < deadline) {
          init = events
            .slice(before)
            .flatMap((event) => (event.type === 'message' ? [event.message] : []))
            .find((message) => message.type === 'system' && message.subtype === 'init')
          await new Promise((resolve) => setTimeout(resolve, 250))
        }

        expect(init?.permissionMode).toBe('plan')
        expect(await readMode(adapter)).toMatchObject({ current: 'plan', confirmed: true })
      } finally {
        await adapter.closeAll()
      }
    },
    90_000
  )

  it.skipIf(!realClaudeAuthenticated)(
    'lets a session launched bypassing leave bypass and enter it again',
    async () => {
      const providerSessionId = randomUUID()
      const adapter = realAdapter(providerSessionId, true, [])
      try {
        await adapter.acquire({ identity: identity(providerSessionId), fence: 1, spawnToken: 'pm' })
        expect(await readMode(adapter)).toMatchObject({
          current: 'bypassPermissions',
          modes: ['default', 'acceptEdits', 'plan', 'auto', 'bypassPermissions']
        })

        await setMode(adapter, 'default')
        await setMode(adapter, 'bypassPermissions')

        expect(await readMode(adapter)).toMatchObject({
          current: 'bypassPermissions',
          confirmed: true
        })
      } finally {
        await adapter.closeAll()
      }
    },
    30_000
  )

  // The relaunch that used to cost bypass for good: a Yolo chat whose saved pick is another mode.
  it.skipIf(!realClaudeAuthenticated)(
    'relaunches a Yolo chat into its saved pick with bypass still one pick away',
    async () => {
      const providerSessionId = randomUUID()
      const adapter = realAdapter(providerSessionId, true, [], true)
      try {
        await adapter.acquire({
          identity: identity(providerSessionId),
          fence: 1,
          spawnToken: 'pm',
          options: { permissionMode: 'plan' }
        })
        expect(await readMode(adapter)).toMatchObject({
          current: 'plan',
          modes: ['default', 'acceptEdits', 'plan', 'auto', 'bypassPermissions']
        })

        await setMode(adapter, 'bypassPermissions')

        expect(await readMode(adapter)).toMatchObject({
          current: 'bypassPermissions',
          confirmed: true
        })
      } finally {
        await adapter.closeAll()
      }
    },
    30_000
  )
})
