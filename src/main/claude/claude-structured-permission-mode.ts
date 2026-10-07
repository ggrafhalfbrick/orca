import type { PermissionMode } from '@anthropic-ai/claude-agent-sdk'
import type { GlobalSettings } from '../../shared/global-settings-types'
import { resolvedTuiAgentArgsBypassPermissions } from '../../shared/tui-agent-launch-defaults'
import type {
  AgentSessionPermissionModeOption,
  AgentSessionPermissionModeReport
} from '../../shared/agent-session-permission-mode'
import {
  enterableStructuredAgentPermissionModes,
  structuredAgentPermissionModeReport,
  type StructuredAgentPermissionMode
} from '../native-chat/agent-session-wire/structured-agent-permission-modes'
import type { ClaudeSession } from './claude-structured-session-state'

/**
 * The Agent Permissions setting as the SDK's own permission mode.
 *
 * Read per acquisition — like the environment overlay and the auth policy beside it — rather than
 * latched into the session record: the setting is the one copy of this fact, so nothing can
 * disagree with it and a failed restore cannot silently downgrade a session to prompting.
 *
 * Yolo still stores itself as the agent's bypass flag inside the launch arguments, which is also
 * what a terminal launch acts on, so presence of that flag is the fact to read — resolved through
 * the same default fallback the terminal uses, which is why an untouched profile bypasses. Any
 * other mode the arguments name is `claudeStructuredLaunchPermissionMode`'s to apply.
 */
export function claudeStructuredPermissionModeForSettings(
  settings:
    | Partial<Pick<GlobalSettings, 'agentDefaultArgs' | 'terminalWindowsShell'>>
    | null
    | undefined
): PermissionMode {
  return resolvedTuiAgentArgsBypassPermissions('claude', settings, process.platform)
    ? 'bypassPermissions'
    : 'default'
}

/** The mode a chat launches in: Yolo wins; otherwise the Arguments' own `--permission-mode`, short
 *  of the bypass only Yolo grants. */
export function claudeStructuredLaunchPermissionMode(
  setting: PermissionMode,
  argumentsMode: PermissionMode | undefined
): PermissionMode {
  if (setting === 'bypassPermissions' || argumentsMode === 'bypassPermissions') {
    return setting
  }
  return argumentsMode ?? setting
}

/** Claude's modes as the chat offers them; the SDK's `dontAsk` is reported but not offered. */
const CLAUDE_STRUCTURED_PERMISSION_MODES: readonly (StructuredAgentPermissionMode & {
  id: PermissionMode
})[] = [
  { id: 'default', label: 'Ask permissions', description: 'Ask before edits and commands' },
  {
    id: 'acceptEdits',
    label: 'Accept edits',
    description: 'Edit files without asking; ask before commands'
  },
  {
    id: 'plan',
    label: 'Plan mode',
    description: 'Explore and propose a plan without changing anything'
  },
  {
    id: 'auto',
    label: 'Auto mode',
    description: 'A safety check approves or blocks each action instead of asking'
  },
  {
    id: 'bypassPermissions',
    label: 'Bypass permissions',
    description: 'Run everything without asking',
    // The CLI refuses to enter bypass unless it was launched with it.
    needsLaunchGrant: true
  }
]

/** What a running child can be switched to. */
export function claudeStructuredPermissionModeChoices(
  session: Pick<ClaudeSession, 'bypassPermissionsAvailable'>
): AgentSessionPermissionModeOption[] {
  return enterableStructuredAgentPermissionModes(
    CLAUDE_STRUCTURED_PERMISSION_MODES,
    session.bypassPermissionsAvailable === true
  )
}

/** `id` as a mode this child can be switched into now, else undefined. */
export function claudeStructuredEnterablePermissionMode(
  session: Pick<ClaudeSession, 'bypassPermissionsAvailable'>,
  id: string
): PermissionMode | undefined {
  const mode = CLAUDE_STRUCTURED_PERMISSION_MODES.find((entry) => entry.id === id)
  return mode && (!mode.needsLaunchGrant || session.bypassPermissionsAvailable === true)
    ? mode.id
    : undefined
}

/** A chat at rest: its saved pick, else the mode its next launch starts in. */
export function claudeStructuredRestingPermissionMode(
  saved: Readonly<Record<string, string>> | undefined,
  launchMode: PermissionMode
): AgentSessionPermissionModeReport {
  const launchGranted = launchMode === 'bypassPermissions'
  const pick = saved?.permissionMode
  const enterable =
    pick !== undefined &&
    claudeStructuredEnterablePermissionMode(
      launchGranted ? { bypassPermissionsAvailable: true } : {},
      pick
    )
  return structuredAgentPermissionModeReport(CLAUDE_STRUCTURED_PERMISSION_MODES, {
    current: enterable ? pick : launchMode,
    launchGranted,
    confirmed: false
  })
}

type PermissionModeSession = Pick<
  ClaudeSession,
  | 'options'
  | 'reportedOptions'
  | 'confirmedOptions'
  | 'launchedPermissionMode'
  | 'bypassPermissionsAvailable'
>

/** What the child last reported or accepted, else the pick, else the mode it was launched in. */
export function claudeStructuredPermissionModeReport(
  session: PermissionModeSession
): AgentSessionPermissionModeReport {
  return structuredAgentPermissionModeReport(CLAUDE_STRUCTURED_PERMISSION_MODES, {
    current:
      session.reportedOptions.permissionMode ??
      session.options.get('permissionMode') ??
      session.launchedPermissionMode ??
      'default',
    launchGranted: session.bypassPermissionsAvailable === true,
    confirmed: session.confirmedOptions.has('permissionMode')
  })
}

/**
 * `system/init` names the mode at every turn start and `system/status` reports a change the CLI
 * made itself, such as leaving plan mode once a plan is approved.
 */
export function observeClaudePermissionMode(
  session: PermissionModeSession,
  message: Record<string, unknown>
): void {
  if (message.type !== 'system' || (message.subtype !== 'init' && message.subtype !== 'status')) {
    return
  }
  const mode = message.permissionMode
  if (typeof mode !== 'string' || !mode) {
    return
  }
  session.reportedOptions.permissionMode = mode
  session.confirmedOptions.add('permissionMode')
  // Otherwise the next start relaunches into a pick the CLI has since moved off.
  if (session.options.has('permissionMode')) {
    session.options.set('permissionMode', mode)
  }
}
