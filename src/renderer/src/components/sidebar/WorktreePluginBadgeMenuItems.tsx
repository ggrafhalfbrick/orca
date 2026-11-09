import type React from 'react'
import { toast } from 'sonner'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { extractIpcErrorMessage } from '@/components/editor/rich-markdown/images/rich-markdown-ipc-error-message'
import { translate } from '@/i18n/i18n'
import { executePluginCommand } from '@/lib/plugin-command-execution'
import { showPluginCommandMessage } from '@/lib/plugin-command-message'
import {
  useMatchingPluginWorktreeBadges,
  type PluginWorktreeBadgeMatch
} from '@/lib/plugin-worktree-badge-match'
import type { ActivePluginCommand } from '@/store/plugins/catalog/plugin-contribution-catalog'
import { PluginWorktreeBadgeIcon } from './PluginWorktreeBadgeIcon'

/** Workers report a failed command as its stack; users see only the message line. */
function pluginCommandErrorDetail(error: unknown): string {
  const [firstLine = ''] = extractIpcErrorMessage(error, '').split('\n')
  return firstLine.replace(/^(?:\w*Error:\s*)+/, '').trim()
}

async function runPluginWorktreeCommand(
  command: ActivePluginCommand,
  worktreeId: string,
  folder: string
): Promise<void> {
  try {
    showPluginCommandMessage(
      await executePluginCommand(command, 'plugin-worktree-menu', {
        worktreeId,
        ...(folder ? { folder } : {})
      })
    )
  } catch (error) {
    const detail = pluginCommandErrorDetail(error)
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

/** The badge menu's heading: the one command when its items name the matched folders. */
export function pluginWorktreeBadgeMenuTitle({ badge, folders }: PluginWorktreeBadgeMatch): string {
  const [onlyCommand] = badge.commands
  return badge.commands.length === 1 && folders[0] !== '' ? onlyCommand.title : badge.title
}

/** One item per matched folder and command. `folderFirst` names the folder, under a heading that
 *  names the command; otherwise the folder follows the command, as in the worktree context menu. */
export function PluginWorktreeBadgeCommandItems({
  match,
  worktreeId,
  disabled,
  folderFirst
}: {
  match: PluginWorktreeBadgeMatch
  worktreeId: string
  disabled?: boolean
  folderFirst?: boolean
}): React.JSX.Element {
  const { badge, folders } = match
  return (
    <>
      {folders.flatMap((folder) =>
        badge.commands.map((command) => (
          <DropdownMenuItem
            key={`${command.id}/${folder}`}
            disabled={disabled}
            onSelect={() => void runPluginWorktreeCommand(command, worktreeId, folder)}
          >
            <PluginWorktreeBadgeIcon icon={badge.icon} className="size-3.5" />
            <span className="truncate">{folderFirst && folder ? folder : command.title}</span>
            {folder && (!folderFirst || badge.commands.length > 1) ? (
              <span className="ml-auto truncate pl-2 text-xs text-muted-foreground">
                {folderFirst ? command.title : folder}
              </span>
            ) : null}
          </DropdownMenuItem>
        ))
      )}
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
  const matches = useMatchingPluginWorktreeBadges({ path: worktreePath, connectionId })
  if (matches.length === 0) {
    return null
  }
  return (
    <>
      {matches.map((match) => (
        <PluginWorktreeBadgeCommandItems
          key={match.badge.key}
          match={match}
          worktreeId={worktreeId}
          disabled={disabled}
        />
      ))}
    </>
  )
}
