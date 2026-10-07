import type { PermissionMode } from '@anthropic-ai/claude-agent-sdk'
import type { GlobalSettings } from '../../shared/global-settings-types'
import { resolvedTuiAgentArgsBypassPermissions } from '../../shared/tui-agent-launch-defaults'
import {
  AGENT_SESSION_PERMISSION_MODES,
  type AgentSessionPermissionMode
} from '../../shared/agent-session-permission-mode'
import type { AgentSessionOptionsResult } from '../../shared/agent-session-wire'
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

/** A chat at rest: its saved pick, else the mode its next launch starts in. */
export function claudeStructuredRestingPermissionMode(
  saved: Readonly<Record<string, string>> | undefined,
  launchMode: PermissionMode
): NonNullable<AgentSessionOptionsResult['permissionMode']> {
  const modes = claudeStructuredPermissionModeChoices(
    launchMode === 'bypassPermissions' ? { bypassPermissionsAvailable: true } : {}
  )
  const pick = modes.find((mode) => mode === saved?.permissionMode)
  return { current: pick ?? launchMode, modes, confirmed: false }
}

type PermissionModeSession = Pick<
  ClaudeSession,
  | 'options'
  | 'reportedOptions'
  | 'confirmedOptions'
  | 'launchedPermissionMode'
  | 'bypassPermissionsAvailable'
>

/** What a running child can be switched to: the CLI refuses bypass unless it was launched with it. */
export function claudeStructuredPermissionModeChoices(
  session: Pick<ClaudeSession, 'bypassPermissionsAvailable'>
): AgentSessionPermissionMode[] {
  return AGENT_SESSION_PERMISSION_MODES.filter(
    (mode) => mode !== 'bypassPermissions' || session.bypassPermissionsAvailable === true
  )
}

/** What the child last reported or accepted, else the pick, else the mode it was launched in. */
function claudeStructuredCurrentPermissionMode(session: PermissionModeSession): string {
  return (
    session.reportedOptions.permissionMode ??
    session.options.get('permissionMode') ??
    session.launchedPermissionMode ??
    'default'
  )
}

export function claudeStructuredPermissionModeReport(
  session: PermissionModeSession
): NonNullable<AgentSessionOptionsResult['permissionMode']> {
  return {
    current: claudeStructuredCurrentPermissionMode(session),
    modes: claudeStructuredPermissionModeChoices(session),
    confirmed: session.confirmedOptions.has('permissionMode')
  }
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
