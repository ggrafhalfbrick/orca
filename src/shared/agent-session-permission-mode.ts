/** Permission modes a client can pick for a structured session, in menu order. */
export const AGENT_SESSION_PERMISSION_MODES = [
  'default',
  'acceptEdits',
  'plan',
  'auto',
  'bypassPermissions'
] as const

export type AgentSessionPermissionMode = (typeof AGENT_SESSION_PERMISSION_MODES)[number]

export function isAgentSessionPermissionMode(value: unknown): value is AgentSessionPermissionMode {
  return AGENT_SESSION_PERMISSION_MODES.some((mode) => mode === value)
}
