import { useCallback, useEffect, useRef, useState } from 'react'
import type React from 'react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import {
  useMatchingPluginWorktreeBadges,
  type PluginWorktreeBadgeMatch
} from '@/lib/plugin-worktree-badge-match'
import { PluginWorktreeBadgeIcon } from './PluginWorktreeBadgeIcon'
import {
  PluginWorktreeBadgeCommandItems,
  pluginWorktreeBadgeMenuTitle
} from './WorktreePluginBadgeMenuItems'

/** Long enough that a pointer sweeping down the sidebar doesn't open every badge it crosses. */
const HOVER_OPEN_DELAY_MS = 150
/** Long enough for the pointer to cross the gap between the badge and its menu. */
const HOVER_CLOSE_DELAY_MS = 200

type BadgeTarget = {
  worktreeId: string
  onPointerDown: React.PointerEventHandler<HTMLButtonElement>
}

type MenuFocusEvent = { preventDefault: () => void }

/** Menu open state where mouse hover opens and closes after a delay, until a click or key pins it
 *  open. A hover-opened menu leaves focus where it was, and puts it back there when it closes. */
function useHoverMenuOpen(): {
  open: boolean
  setOpen: (next: boolean) => void
  hover: (next: boolean) => void
  pinIfHovered: () => boolean
  onOpenAutoFocus: (event: MenuFocusEvent) => void
  onCloseAutoFocus: (event: MenuFocusEvent) => void
} {
  const [open, setOpenState] = useState(false)
  const openedByHover = useRef(false)
  const returnFocus = useRef<HTMLElement | null>(null)
  const pendingHover = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dropPendingHover = useCallback((): void => {
    if (pendingHover.current) {
      clearTimeout(pendingHover.current)
      pendingHover.current = null
    }
  }, [])
  useEffect(() => dropPendingHover, [dropPendingHover])
  const setOpen = useCallback(
    (next: boolean): void => {
      dropPendingHover()
      openedByHover.current = false
      if (next) {
        returnFocus.current = null
      }
      setOpenState(next)
    },
    [dropPendingHover]
  )
  const hover = useCallback(
    (next: boolean): void => {
      dropPendingHover()
      if (next === open || (!next && !openedByHover.current)) {
        return
      }
      pendingHover.current = setTimeout(
        () => {
          pendingHover.current = null
          openedByHover.current = next
          if (next) {
            const focused = document.activeElement
            returnFocus.current = focused instanceof HTMLElement ? focused : null
          }
          setOpenState(next)
        },
        next ? HOVER_OPEN_DELAY_MS : HOVER_CLOSE_DELAY_MS
      )
    },
    [dropPendingHover, open]
  )
  const pinIfHovered = useCallback((): boolean => {
    dropPendingHover()
    if (!open || !openedByHover.current) {
      return false
    }
    openedByHover.current = false
    return true
  }, [dropPendingHover, open])
  const onOpenAutoFocus = useCallback((event: MenuFocusEvent): void => {
    if (openedByHover.current) {
      event.preventDefault()
    }
  }, [])
  const onCloseAutoFocus = useCallback((event: MenuFocusEvent): void => {
    const target = returnFocus.current
    returnFocus.current = null
    if (target) {
      event.preventDefault()
      if (target.isConnected) {
        target.focus({ preventScroll: true })
      }
    }
  }, [])
  return { open, setOpen, hover, pinIfHovered, onOpenAutoFocus, onCloseAutoFocus }
}

function WorktreeCardPluginBadge({
  match,
  worktreeId,
  onPointerDown
}: BadgeTarget & { match: PluginWorktreeBadgeMatch }): React.JSX.Element {
  const { badge } = match
  const { open, setOpen, hover, pinIfHovered, onOpenAutoFocus, onCloseAutoFocus } =
    useHoverMenuOpen()
  return (
    <span
      className="inline-flex"
      // Why: React pointer enter/leave follow the component tree, so entering the portaled menu
      // counts as staying; touch is left to the trigger's tap.
      onPointerEnter={(event) => event.pointerType === 'mouse' && hover(true)}
      onPointerLeave={(event) => event.pointerType === 'mouse' && hover(false)}
    >
      <DropdownMenu modal={false} open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            data-worktree-card-plugin-badge={badge.key}
            aria-label={badge.title}
            onPointerDown={(event) => {
              onPointerDown(event)
              // Why: the trigger toggles on press; a click on a hover-opened menu keeps it open.
              if (pinIfHovered()) {
                event.preventDefault()
              }
            }}
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
        {/* Why: React events bubble through portals, so menu clicks must not reach the card. */}
        <DropdownMenuContent
          align="start"
          className="w-56"
          onCloseAutoFocus={onCloseAutoFocus}
          // SAFETY: Radix forwards onOpenAutoFocus to its menu content (as its submenus do), but
          // DropdownMenuContent's type omits it; without it a passing hover takes the terminal's focus.
          {...({ onOpenAutoFocus } as object)}
          onClick={(event) => event.stopPropagation()}
        >
          <DropdownMenuLabel className="px-2 py-1 text-[11px] font-medium text-muted-foreground">
            {pluginWorktreeBadgeMenuTitle(match)}
          </DropdownMenuLabel>
          <PluginWorktreeBadgeCommandItems match={match} worktreeId={worktreeId} folderFirst />
        </DropdownMenuContent>
      </DropdownMenu>
    </span>
  )
}

/** Plugin badges beside the worktree name; hovering or clicking one opens a menu of the plugin's
 *  worktree commands, one per project folder the badge found. */
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
  const matches = useMatchingPluginWorktreeBadges({ path: worktreePath, connectionId }, isActive)
  if (matches.length === 0) {
    return null
  }
  return (
    <>
      {matches.map((match) => (
        <WorktreeCardPluginBadge
          key={match.badge.key}
          match={match}
          worktreeId={worktreeId}
          onPointerDown={onPointerDown}
        />
      ))}
    </>
  )
}
