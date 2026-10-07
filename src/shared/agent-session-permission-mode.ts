// The permission-mode contract between a structured agent and every client. A provider names and
// describes its own modes, so a client renders any agent's without knowing its vocabulary.
// How a provider implements it: docs/reference/agent-permission-modes.md.

/** The session option key a pick is written under, through `agentSession.setOption`. */
export const AGENT_SESSION_PERMISSION_MODE_KEY = 'permissionMode'

/** One mode as its provider names it; a pick sends `id` back verbatim. Mirrors ACP's SessionMode,
 *  so an ACP agent's own modes map across unchanged. */
export type AgentSessionPermissionModeOption = {
  id: string
  label: string
  description?: string
}

/** A session's permission modes as its provider reports them: session-wide, not per model. */
export type AgentSessionPermissionModeReport = {
  /** The mode tools run under now. It may name a mode `modes` leaves out. */
  current: string
  /** What a client may switch to now, in menu order; a mode the session cannot enter is absent. */
  modes: readonly AgentSessionPermissionModeOption[]
  /** The provider itself reported `current`, rather than Orca inferring it from the launch. */
  confirmed: boolean
}

/** The modes of a report a client can render: a malformed entry from a newer host is dropped. */
export function renderableAgentSessionPermissionModes(
  modes: readonly unknown[] | undefined
): AgentSessionPermissionModeOption[] {
  return (modes ?? []).flatMap((mode) => {
    if (typeof mode !== 'object' || mode === null) {
      return []
    }
    const id: unknown = Reflect.get(mode, 'id')
    const label: unknown = Reflect.get(mode, 'label')
    const description: unknown = Reflect.get(mode, 'description')
    return typeof id === 'string' && id && typeof label === 'string' && label
      ? [{ id, label, ...(typeof description === 'string' && description ? { description } : {}) }]
      : []
  })
}
