import { readContainedPluginArtifactText } from './plugin-artifact-validation'
import type { ValidDiscoveredPlugin } from './plugin-discovery'
import {
  isPluginWorktreeBadgeSvgIcon,
  PLUGIN_WORKTREE_BADGE_SVG_MAX_BYTES,
  type PluginWorktreeBadgeEntry,
  type PluginWorktreeBadgeIcon
} from '../../shared/plugins/plugin-worktree-badge'

const FALLBACK_BADGE_ICON: PluginWorktreeBadgeIcon = { kind: 'lucide', name: 'puzzle' }

export async function projectPluginWorktreeBadges(
  plugin: ValidDiscoveredPlugin
): Promise<PluginWorktreeBadgeEntry[]> {
  return Promise.all(
    plugin.manifest.contributes.worktreeBadges.map(async (badge) => ({
      id: badge.id,
      title: badge.title,
      icon: await resolveBadgeIcon(plugin.rootDir, badge.icon),
      when: { pathExists: [...badge.when.pathExists], host: badge.when.host },
      commands: [...badge.commands]
    }))
  )
}

async function resolveBadgeIcon(rootDir: string, icon: string): Promise<PluginWorktreeBadgeIcon> {
  if (!isPluginWorktreeBadgeSvgIcon(icon)) {
    return { kind: 'lucide', name: icon }
  }
  try {
    const markup = await readContainedPluginArtifactText(
      rootDir,
      icon,
      PLUGIN_WORKTREE_BADGE_SVG_MAX_BYTES
    )
    return /<svg[\s>]/i.test(markup) ? { kind: 'svg', markup } : FALLBACK_BADGE_ICON
  } catch {
    // Why: a dev plugin can delete its icon mid-session; the badge stays usable.
    return FALLBACK_BADGE_ICON
  }
}
