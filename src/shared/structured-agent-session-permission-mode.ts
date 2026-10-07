import {
  AGENT_SESSION_PERMISSION_MODE_KEY,
  renderableAgentSessionPermissionModes
} from './agent-session-permission-mode'
import type { AgentSessionOptionsResult } from './agent-session-wire'
import type {
  SessionOptionDescriptor,
  SessionOptionSelectChoice,
  SessionOptionValueSource
} from './native-chat-session-options'

/** Session-wide rather than per model, so it lives beside the per-model record, not in it. */
export type StructuredAgentSessionPermissionModeState = {
  /** As the provider names and describes them; no client-side vocabulary. */
  choices: readonly SessionOptionSelectChoice[]
  current: string
  source: SessionOptionValueSource
}

/** Absent unless the session reports modes: a host or provider without them offers no picker. */
export function reportedStructuredAgentSessionPermissionMode(
  result: AgentSessionOptionsResult
): StructuredAgentSessionPermissionModeState | undefined {
  const reported = result.permissionMode
  const choices = renderableAgentSessionPermissionModes(reported?.modes).map(({ id, ...mode }) => ({
    value: id,
    ...mode
  }))
  if (!reported?.current || choices.length === 0) {
    return undefined
  }
  return {
    choices,
    current: reported.current,
    source: reported.confirmed ? 'reported' : 'default'
  }
}

export function structuredAgentSessionPermissionModeDescriptor(
  state: StructuredAgentSessionPermissionModeState
): SessionOptionDescriptor {
  return {
    id: AGENT_SESSION_PERMISSION_MODE_KEY,
    label: 'Permissions',
    category: 'mode',
    kind: { type: 'select', currentValue: state.current, choices: [...state.choices] },
    valueSource: state.source,
    transport: 'agent-session',
    settable: true
  }
}

/** A pick the host accepted, shown until the next read reports it. */
export function committedStructuredAgentSessionPermissionMode(
  shown: StructuredAgentSessionPermissionModeState | undefined,
  committed: Readonly<Record<string, string>>
): StructuredAgentSessionPermissionModeState | undefined {
  const value = committed[AGENT_SESSION_PERMISSION_MODE_KEY]
  return shown && value !== undefined && shown.current !== value
    ? { ...shown, current: value, source: 'dispatched' }
    : shown
}
