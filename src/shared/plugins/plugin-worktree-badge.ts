import { z } from 'zod'
import {
  pluginCommandIdSchema,
  pluginIdSchema,
  pluginRelativePathSchema
} from './plugin-manifest-fields'
import { isSafePluginRelativePath } from './plugin-path-safety'

/**
 * Worktree badges: a plugin marks worktrees whose folder contains a known file
 * (e.g. a game-engine project file) with a small icon beside the worktree name.
 * The icon opens a menu of the plugin's worktree commands, which the worktree
 * context menu lists too. The host evaluates `when` itself, so a plugin learns
 * nothing about a worktree until the user runs one of its commands on it.
 */

export const PLUGIN_WORKTREE_BADGE_LIMIT = 16
export const PLUGIN_WORKTREE_BADGE_PATH_LIMIT = 8
export const PLUGIN_WORKTREE_BADGE_COMMAND_LIMIT = 8
export const PLUGIN_WORKTREE_BADGE_SVG_MAX_BYTES = 32 * 1024

export function isPluginWorktreeBadgeSvgIcon(icon: string): boolean {
  return /\.svg$/i.test(icon)
}

const badgeIconSchema = z
  .string()
  .min(1)
  .max(1024)
  .refine(
    (icon) =>
      isPluginWorktreeBadgeSvgIcon(icon)
        ? isSafePluginRelativePath(icon)
        : /^[A-Za-z0-9-]{1,64}$/.test(icon),
    'must be a Lucide icon name or a portable relative path to an .svg file'
  )

export const pluginWorktreeBadgeContributionSchema = z.strictObject({
  id: pluginIdSchema,
  /** Tooltip and accessible name, e.g. "Unity project". */
  title: z.string().min(1).max(256),
  /** A Lucide icon name (as for panels), or a plugin-relative monochrome `.svg`
   *  drawn in the surrounding text color. */
  icon: badgeIconSchema,
  when: z.strictObject({
    /** Matches when the worktree folder contains any of these relative paths. */
    pathExists: z.array(pluginRelativePathSchema).min(1).max(PLUGIN_WORKTREE_BADGE_PATH_LIMIT),
    /** `local` skips SSH and Orca-server worktrees, e.g. for commands that start a desktop app. */
    host: z.enum(['local', 'any']).default('any')
  }),
  /** Worktree commands offered from the badge menu and the worktree context menu. */
  commands: z.array(pluginCommandIdSchema).min(1).max(PLUGIN_WORKTREE_BADGE_COMMAND_LIMIT)
})

export type PluginWorktreeBadgeContribution = z.infer<typeof pluginWorktreeBadgeContributionSchema>

export type PluginWorktreeBadgeIcon =
  | { kind: 'lucide'; name: string }
  | { kind: 'svg'; markup: string }

/** Wire projection of a badge for clients; the SVG travels inline so clients never read plugin files. */
export type PluginWorktreeBadgeEntry = {
  id: string
  title: string
  icon: PluginWorktreeBadgeIcon
  when: { pathExists: string[]; host: 'local' | 'any' }
  commands: string[]
}

/** What a client sends to run a worktree command on a specific worktree. */
export const pluginWorktreeCommandRequestSchema = z.object({
  worktreeId: z
    .string()
    .min(1)
    .max(32 * 1024)
})

/** The `args` a worker command with `context: "worktree"` receives when the user runs it on a
 *  worktree. Only plugins granted `workspace:read` receive it. */
export type PluginWorktreeCommandArgs = {
  worktree: {
    /** Absolute folder path on the host named by `host`. */
    path: string
    displayName: string
    /** Empty for folder workspaces. */
    branch: string
    host: 'local' | 'ssh'
  }
}

/** Optional result of a worker command: `message` is shown to the user as a toast. */
export const pluginCommandResultMessageSchema = z.object({
  message: z.string().min(1).max(512)
})
