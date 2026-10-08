import type React from 'react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useMatchingPluginWorktreeBadges } from '@/lib/plugin-worktree-badge-match'
import type { ActivePluginWorktreeBadge } from '@/store/plugin-worktree-badges'
import { PluginWorktreeBadgeIcon } from './PluginWorktreeBadgeIcon'
import { PluginWorktreeBadgeCommandItems } from './WorktreePluginBadgeMenuItems'

type BadgeTarget = {
  worktreeId: string
  onPointerDown: React.PointerEventHandler<HTMLButtonElement>
}

function WorktreeCardPluginBadge({
  badge,
  worktreeId,
  onPointerDown
}: BadgeTarget & { badge: ActivePluginWorktreeBadge }): React.JSX.Element {
  return (
    <DropdownMenu modal={false}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              data-worktree-card-plugin-badge={badge.key}
              aria-label={badge.title}
              onPointerDown={onPointerDown}
              onKeyDown={(event) => {
                // Why: the sidebar treats a bubbled Enter as "focus the terminal".
                if (event.key === 'Enter' || event.key === ' ') {
                  event.stopPropagation()
                }
              }}
              // Why: opening the badge menu and activating the workspace are separate intents.
              onClick={(event) => event.stopPropagation()}
              className="inline-flex size-4 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-worktree-sidebar-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-worktree-sidebar-ring data-[state=open]:bg-worktree-sidebar-accent data-[state=open]:text-foreground"
            >
              <PluginWorktreeBadgeIcon icon={badge.icon} className="size-3" />
            </button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="right" sideOffset={8}>
          {badge.title}
        </TooltipContent>
      </Tooltip>
      {/* Why: React events bubble through portals, so menu clicks must not reach the card. */}
      <DropdownMenuContent
        align="start"
        className="w-52"
        onClick={(event) => event.stopPropagation()}
      >
        <DropdownMenuLabel className="px-2 py-1 text-[11px] font-medium text-muted-foreground">
          {badge.title}
        </DropdownMenuLabel>
        <PluginWorktreeBadgeCommandItems badge={badge} worktreeId={worktreeId} />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Plugin badges beside the worktree name; each opens a menu of the plugin's worktree commands. */
export function WorktreeCardPluginBadges({
  worktreeId,
  worktreePath,
  connectionId,
  isActive,
  onPointerDown
}: BadgeTarget & {
  worktreePath: string
  connectionId: string | null
  isActive: boolean
}): React.JSX.Element | null {
  const badges = useMatchingPluginWorktreeBadges({ path: worktreePath, connectionId }, isActive)
  if (badges.length === 0) {
    return null
  }
  return (
    <>
      {badges.map((badge) => (
        <WorktreeCardPluginBadge
          key={badge.key}
          badge={badge}
          worktreeId={worktreeId}
          onPointerDown={onPointerDown}
        />
      ))}
    </>
  )
}
