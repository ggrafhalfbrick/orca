// A structured agent's permission modes, as its adapter declares and reports them. Nothing here
// names an agent: each adapter brings its own catalog. How to add a provider:
// docs/reference/agent-permission-modes.md.

import type {
  AgentSessionPermissionModeOption,
  AgentSessionPermissionModeReport
} from '../../../shared/agent-session-permission-mode'

/** One entry of a provider's catalog, in the order its menu lists them. */
export type StructuredAgentPermissionMode = AgentSessionPermissionModeOption & {
  /** Enterable only when the launch granted it, as Claude's bypass needs Agent Permissions on
   *  Yolo; until then a report leaves it out rather than offer a switch the CLI refuses. */
  needsLaunchGrant?: true
}

/** The catalog's modes a session can enter now. */
export function enterableStructuredAgentPermissionModes(
  catalog: readonly StructuredAgentPermissionMode[],
  launchGranted: boolean
): AgentSessionPermissionModeOption[] {
  return catalog.flatMap(({ needsLaunchGrant, ...mode }) =>
    !needsLaunchGrant || launchGranted ? [mode] : []
  )
}

/** A session's report, built from its provider's catalog. */
export function structuredAgentPermissionModeReport(
  catalog: readonly StructuredAgentPermissionMode[],
  session: { current: string; launchGranted: boolean; confirmed: boolean }
): AgentSessionPermissionModeReport {
  return {
    current: session.current,
    modes: enterableStructuredAgentPermissionModes(catalog, session.launchGranted),
    confirmed: session.confirmed
  }
}
