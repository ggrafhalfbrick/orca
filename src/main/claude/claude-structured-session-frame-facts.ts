import { observeClaudePermissionMode } from './claude-structured-permission-mode'
import { observeClaudeFastModeFacts } from './claude-structured-session-options'
import type { ClaudeSession } from './claude-structured-session-state'

/** Session-wide facts any frame on the live stream may carry. */
export function observeClaudeSessionFrameFacts(
  session: ClaudeSession,
  message: Record<string, unknown>
): void {
  observeClaudeFastModeFacts(session, message)
  observeClaudePermissionMode(session, message)
}
