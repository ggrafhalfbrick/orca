import {
  createClaudeLaunchFlagSupport,
  type ClaudeLaunchFlagSupport
} from './claude-launch-flag-support'

export type ClaudeAllowBypassSupport = ClaudeLaunchFlagSupport

/** Keeps the Agent Permissions bypass one pick away in a chat launched in another mode. */
export function createClaudeAllowBypassSupport(
  deps?: Parameters<typeof createClaudeLaunchFlagSupport>[1]
): ClaudeAllowBypassSupport {
  return createClaudeLaunchFlagSupport(
    {
      flag: 'allow-dangerously-skip-permissions',
      // Why: the earliest release the CLI changelog names the flag in. It may be older, which only
      // costs an older CLI bypass after such a relaunch, as before this flag was used.
      firstVersion: '2.1.143',
      args: { 'allow-dangerously-skip-permissions': null }
    },
    deps
  )
}

/** One per process: every structured launch on this host shares what it learned. */
export const claudeAllowBypassSupport = createClaudeAllowBypassSupport()
