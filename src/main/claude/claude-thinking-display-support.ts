import {
  createClaudeLaunchFlagSupport,
  type ClaudeLaunchFlagSupport
} from './claude-launch-flag-support'

export type ClaudeThinkingDisplaySupport = ClaudeLaunchFlagSupport

/**
 * Asks for readable thinking: under Orca's launch the CLI otherwise streams thinking blocks with
 * no text. Only the display is set, never `--thinking`, so a user who turned thinking off keeps
 * it off.
 */
export function createClaudeThinkingDisplaySupport(
  deps?: Parameters<typeof createClaudeLaunchFlagSupport>[1]
): ClaudeThinkingDisplaySupport {
  return createClaudeLaunchFlagSupport(
    {
      flag: 'thinking-display',
      // Why: the first CLI whose parser defines the flag (2.1.93 was never published). Found by
      // reading published packages, not by running them.
      firstVersion: '2.1.94',
      args: { 'thinking-display': 'summarized' }
    },
    deps
  )
}

/** One per process: every structured launch on this host shares what it learned. */
export const claudeThinkingDisplaySupport = createClaudeThinkingDisplaySupport()
