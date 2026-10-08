import { createElement } from 'react'
import type React from 'react'
import { resolvePluginPanelIcon } from '@/components/right-sidebar/plugin-panel-activity-items'
import { cn } from '@/lib/utils'
import type { PluginWorktreeBadgeIcon as BadgeIcon } from '../../../../shared/plugins/plugin-worktree-badge'

/** Lucide icons render as-is; plugin SVGs are used as a mask so they take the text color in
 *  light and dark themes, and can never run script or load anything. */
export function PluginWorktreeBadgeIcon({
  icon,
  className
}: {
  icon: BadgeIcon
  className?: string
}): React.JSX.Element {
  if (icon.kind === 'lucide') {
    // Why: the curated map holds stable module-level components; nothing is created per render.
    return createElement(resolvePluginPanelIcon(icon.name), {
      className: cn('shrink-0', className)
    })
  }
  const mask = `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(icon.markup)}")`
  return (
    <span
      aria-hidden
      className={cn('inline-block shrink-0 bg-current', className)}
      style={{
        maskImage: mask,
        WebkitMaskImage: mask,
        maskSize: 'contain',
        WebkitMaskSize: 'contain',
        maskRepeat: 'no-repeat',
        WebkitMaskRepeat: 'no-repeat',
        maskPosition: 'center',
        WebkitMaskPosition: 'center'
      }}
    />
  )
}
