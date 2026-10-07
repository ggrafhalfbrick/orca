import {
  isAgentSessionPermissionMode,
  type AgentSessionPermissionMode
} from './agent-session-permission-mode'
import type { AgentSessionOptionsResult } from './agent-session-wire'
import type {
  SessionOptionDescriptor,
  SessionOptionSelectChoice,
  SessionOptionValueSource
} from './native-chat-session-options'

/** Session-wide rather than per model, so it lives beside the per-model record, not in it. */
export type StructuredAgentSessionPermissionModeState = {
  choices: readonly AgentSessionPermissionMode[]
  current: string
  source: SessionOptionValueSource
}

const PERMISSION_MODE_CHOICES: Record<AgentSessionPermissionMode, SessionOptionSelectChoice> = {
  default: {
    value: 'default',
    label: 'Ask permissions',
    description: 'Ask before edits and commands'
  },
  acceptEdits: {
    value: 'acceptEdits',
    label: 'Accept edits',
    description: 'Edit files without asking; ask before commands'
  },
  plan: {
    value: 'plan',
    label: 'Plan mode',
    description: 'Explore and propose a plan without changing anything'
  },
  auto: {
    value: 'auto',
    label: 'Auto mode',
    description: 'A safety check approves or blocks each action instead of asking'
  },
  bypassPermissions: {
    value: 'bypassPermissions',
    label: 'Bypass permissions',
    description: 'Run everything without asking'
  }
}

/** Absent unless the session reports modes this client knows: an older host offers no picker. */
export function reportedStructuredAgentSessionPermissionMode(
  result: AgentSessionOptionsResult
): StructuredAgentSessionPermissionModeState | undefined {
  const reported = result.permissionMode
  const choices = (reported?.modes ?? []).filter(isAgentSessionPermissionMode)
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
    id: 'permissionMode',
    label: 'Permissions',
    category: 'mode',
    kind: {
      type: 'select',
      currentValue: state.current,
      choices: state.choices.map((mode) => PERMISSION_MODE_CHOICES[mode])
    },
    valueSource: state.source,
    transport: 'agent-session',
    settable: true
  }
}

/** A pick the host accepted, shown until the next read reports it. */
export function committedStructuredAgentSessionPermissionMode(
  shown: StructuredAgentSessionPermissionModeState | undefined,
  value: string | undefined
): StructuredAgentSessionPermissionModeState | undefined {
  return shown && value !== undefined && shown.current !== value
    ? { ...shown, current: value, source: 'dispatched' }
    : shown
}
