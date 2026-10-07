import { describe, expect, it, vi } from 'vitest'
import {
  claudeStructuredLaunchPermissionMode,
  claudeStructuredPermissionModeForSettings,
  claudeStructuredPermissionModeReport,
  claudeStructuredRestingPermissionMode,
  observeClaudePermissionMode
} from './claude-structured-permission-mode'
import { sessionFor } from './claude-structured-dispatch-test-support'
import { setClaudeStructuredOption } from './claude-structured-options'
import {
  claudeStructuredSpawnOptions,
  claudeStructuredSpawnPermissionFacts
} from './claude-structured-spawn-options'
import type { ClaudeStructuredSdkOptions } from './claude-structured-launch-resolution'
import { isAgentSessionOptionRejectedError } from '../native-chat/agent-session-wire/structured-agent-session-option-error'

const BYPASSING: ClaudeStructuredSdkOptions = {
  extraArgs: { 'dangerously-skip-permissions': null }
}
const ALL_MODES = ['default', 'acceptEdits', 'plan', 'auto', 'bypassPermissions']

/** A session as published from these spawn options. */
function permissionSession(spawned: ClaudeStructuredSdkOptions) {
  const session = Object.assign(sessionFor(), claudeStructuredSpawnPermissionFacts(spawned))
  const setPermissionMode = vi.fn(async () => {})
  session.connection.setPermissionMode = setPermissionMode
  return { session, setPermissionMode }
}

describe('Claude structured permission mode', () => {
  it('offers bypass only to a child launched able to enter it', () => {
    expect(claudeStructuredPermissionModeReport(permissionSession(BYPASSING).session)).toEqual({
      current: 'bypassPermissions',
      modes: ALL_MODES,
      confirmed: false
    })
    expect(claudeStructuredPermissionModeReport(permissionSession({}).session)).toEqual({
      current: 'default',
      modes: ALL_MODES.filter((mode) => mode !== 'bypassPermissions'),
      confirmed: false
    })
  })

  it('names the mode the Arguments launched it in before any turn reports one', () => {
    const { session } = permissionSession({ permissionMode: 'auto' })

    expect(claudeStructuredPermissionModeReport(session).current).toBe('auto')
  })

  it('switches mode and reports the switch as confirmed', async () => {
    const { session, setPermissionMode } = permissionSession(BYPASSING)

    await expect(
      setClaudeStructuredOption(session, { key: 'permissionMode', value: 'auto' }, undefined)
    ).resolves.toEqual({ permissionMode: 'auto' })

    expect(setPermissionMode).toHaveBeenCalledWith('auto', { timeoutMs: undefined })
    expect(claudeStructuredPermissionModeReport(session)).toMatchObject({
      current: 'auto',
      confirmed: true
    })
  })

  it('refuses bypass for a prompting launch, and any mode it does not know', async () => {
    const { session, setPermissionMode } = permissionSession({})
    for (const value of ['bypassPermissions', 'yolo']) {
      const refusal = await setClaudeStructuredOption(
        session,
        { key: 'permissionMode', value },
        undefined
      ).catch((error: unknown) => error)
      expect(isAgentSessionOptionRejectedError(refusal), value).toBe(true)
    }
    expect(setPermissionMode).not.toHaveBeenCalled()
  })

  // Relaunching into a saved non-bypass pick drops the bypass flag; the allow flag keeps bypass on
  // offer where the CLI takes it, and only there.
  it.each([
    [true, true],
    [false, false]
  ])(
    'keeps bypass on offer after a relaunch into a saved pick: CLI takes the allow flag %s',
    (keepsBypassAvailable, offered) => {
      const relaunched = claudeStructuredSpawnOptions({
        launch: {
          options: BYPASSING,
          resumesTranscript: true,
          ...(keepsBypassAvailable ? { keepsBypassAvailable: true as const } : {})
        },
        saved: { permissionMode: 'plan' }
      })

      expect(relaunched.sdkOptions.permissionMode).toBe('plan')
      expect(relaunched.sdkOptions.extraArgs).not.toHaveProperty('dangerously-skip-permissions')
      expect(
        Object.hasOwn(relaunched.sdkOptions.extraArgs ?? {}, 'allow-dangerously-skip-permissions')
      ).toBe(offered)
      expect(claudeStructuredSpawnPermissionFacts(relaunched.sdkOptions)).toEqual({
        launchedPermissionMode: 'plan',
        ...(offered ? { bypassPermissionsAvailable: true } : {})
      })
    }
  )

  it('follows a mode the CLI changes itself, so the next start relaunches into it', () => {
    const { session } = permissionSession(BYPASSING)
    session.options.set('permissionMode', 'plan')

    observeClaudePermissionMode(session, {
      type: 'system',
      subtype: 'status',
      status: null,
      permissionMode: 'acceptEdits'
    })
    expect(session.options.get('permissionMode')).toBe('acceptEdits')
    expect(claudeStructuredPermissionModeReport(session)).toMatchObject({
      current: 'acceptEdits',
      confirmed: true
    })

    observeClaudePermissionMode(session, { type: 'assistant', permissionMode: 'default' })
    expect(session.reportedOptions.permissionMode).toBe('acceptEdits')
  })
})

describe('Claude structured permission mode before a launch', () => {
  it.each([
    ['bypassPermissions', 'auto', 'bypassPermissions'],
    ['default', 'auto', 'auto'],
    ['default', undefined, 'default'],
    // Only Yolo grants bypass, however the Arguments spell it.
    ['default', 'bypassPermissions', 'default']
  ] as const)('launches setting %s with Arguments mode %s in %s', (setting, configured, mode) => {
    expect(claudeStructuredLaunchPermissionMode(setting, configured)).toBe(mode)
  })

  // Every chat is at rest after an app start, so its pill reads this until Claude runs.
  it('offers a chat at rest its saved pick, else the mode its next launch starts in', () => {
    expect(claudeStructuredRestingPermissionMode({}, 'auto')).toEqual({
      current: 'auto',
      modes: ALL_MODES.filter((mode) => mode !== 'bypassPermissions'),
      confirmed: false
    })
    expect(
      claudeStructuredRestingPermissionMode({ permissionMode: 'plan' }, 'bypassPermissions')
    ).toEqual({ current: 'plan', modes: ALL_MODES, confirmed: false })
    // A saved bypass the next launch cannot grant reads as that launch's own mode.
    expect(
      claudeStructuredRestingPermissionMode({ permissionMode: 'bypassPermissions' }, 'default')
        .current
    ).toBe('default')
  })
})

describe('claudeStructuredPermissionModeForSettings', () => {
  // The three states the Agent Permissions toggle can leave behind. The untouched case is the
  // common one and the easiest to get wrong: the toggle writes nothing until it is used, and the
  // default Orca ships for the key it did not write is the bypass flag — which is what a terminal
  // launch has always applied to an untouched profile.
  it('bypasses when the user has never opened Agent settings', () => {
    expect(claudeStructuredPermissionModeForSettings({ agentDefaultArgs: {} })).toBe(
      'bypassPermissions'
    )
    expect(claudeStructuredPermissionModeForSettings({})).toBe('bypassPermissions')
    expect(claudeStructuredPermissionModeForSettings(null)).toBe('bypassPermissions')
    expect(claudeStructuredPermissionModeForSettings({ agentDefaultArgs: { codex: '' } })).toBe(
      'bypassPermissions'
    )
  })

  it('bypasses when Yolo wrote the flag, alone or beside other tokens', () => {
    for (const claude of [
      '--dangerously-skip-permissions',
      '--dangerously-skip-permissions --model Opus',
      '--model Opus --dangerously-skip-permissions'
    ]) {
      expect(
        claudeStructuredPermissionModeForSettings({ agentDefaultArgs: { claude } }),
        claude
      ).toBe('bypassPermissions')
    }
  })

  // Manual is stored as an empty string, which owns the key and so beats the shipped default.
  it('prompts when Manual cleared the flag', () => {
    expect(claudeStructuredPermissionModeForSettings({ agentDefaultArgs: { claude: '' } })).toBe(
      'default'
    )
  })

  it('prompts when the user replaced the flag with something else', () => {
    expect(
      claudeStructuredPermissionModeForSettings({ agentDefaultArgs: { claude: '--model Opus' } })
    ).toBe('default')
  })
})
