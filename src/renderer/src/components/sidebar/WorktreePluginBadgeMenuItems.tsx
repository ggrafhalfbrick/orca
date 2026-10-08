import type React from 'react'
import { toast } from 'sonner'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { extractIpcErrorMessage } from '@/components/editor/rich-markdown-ipc-error-message'
import { translate } from '@/i18n/i18n'
import { executePluginCommand } from '@/lib/plugin-command-execution'
import { useMatchingPluginWorktreeBadges } from '@/lib/plugin-worktree-badge-match'
import type { ActivePluginCommand } from '@/store/plugin-panels'
import type { ActivePluginWorktreeBadge } from '@/store/plugin-worktree-badges'
import { PluginWorktreeBadgeIcon } from './PluginWorktreeBadgeIcon'

async function runPluginWorktreeCommand(
  command: ActivePluginCommand,
  worktreeId: string
): Promise<void> {
  try {
    await executePluginCommand(command, 'plugin-worktree-menu', { worktreeId })
  } catch (error) {
    const detail = extractIpcErrorMessage(error, '')
    toast.error(
      translate(
        'auto.components.sidebar.WorktreePluginBadgeMenuItems.failed',
        'Could not run {{value0}}',
        {
          value0: command.title
        }
      ),
      detail ? { description: detail } : undefined
    )
  }
}

/** Commands of one badge, for the badge's own menu and the worktree context menu. */
export function PluginWorktreeBadgeCommandItems({
  badge,
  worktreeId,
  disabled
}: {
  badge: ActivePluginWorktreeBadge
  worktreeId: string
  disabled?: boolean
}): React.JSX.Element {
  return (
    <>
      {badge.commands.map((command) => (
        <DropdownMenuItem
          key={command.id}
          disabled={disabled}
          onSelect={() => void runPluginWorktreeCommand(command, worktreeId)}
        >
          <PluginWorktreeBadgeIcon icon={badge.icon} className="size-3.5" />
          {command.title}
        </DropdownMenuItem>
      ))}
    </>
  )
}

/** Worktree context menu entries for every plugin badge that matches this worktree. */
export function WorktreePluginBadgeMenuItems({
  worktreeId,
  worktreePath,
  connectionId,
  disabled
}: {
  worktreeId: string
  worktreePath: string
  connectionId: string | null
  disabled?: boolean
}): React.JSX.Element | null {
  const badges = useMatchingPluginWorktreeBadges({ path: worktreePath, connectionId })
  if (badges.length === 0) {
    return null
  }
  return (
    <>
      {badges.map((badge) => (
        <PluginWorktreeBadgeCommandItems
          key={badge.key}
          badge={badge}
          worktreeId={worktreeId}
          disabled={disabled}
        />
      ))}
    </>
  )
}
