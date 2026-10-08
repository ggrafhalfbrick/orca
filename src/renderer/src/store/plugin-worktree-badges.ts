import { useEffect, useMemo } from 'react'
import type { PluginHostListEntry } from '../../../preload/api-types'
import type { PluginWorktreeBadgeEntry } from '../../../shared/plugins/plugin-worktree-badge'
import {
  ensurePluginPanelsLoaded,
  usePluginPanelsStore,
  type ActivePluginCommand
} from './plugin-panels'

/** A worktree badge of an enabled plugin, with its command ids resolved to runnable commands. */
export type ActivePluginWorktreeBadge = Omit<PluginWorktreeBadgeEntry, 'commands'> & {
  key: string
  pluginKey: string
  pluginName: string
  commands: ActivePluginCommand[]
}

export function collectActivePluginWorktreeBadges(
  plugins: readonly PluginHostListEntry[]
): ActivePluginWorktreeBadge[] {
  return plugins
    .filter(
      (plugin) =>
        plugin.status === 'running' || plugin.status === 'restarting' || plugin.status === 'idle'
    )
    .flatMap((plugin) =>
      (plugin.worktreeBadges ?? []).flatMap((badge) => {
        const commands = badge.commands.flatMap((commandId) => {
          const command = plugin.commands.find(
            (entry) =>
              entry.id === commandId &&
              entry.context === 'worktree' &&
              entry.handler.type === 'worker'
          )
          return command
            ? [{ ...command, pluginKey: plugin.pluginKey, pluginName: plugin.name }]
            : []
        })
        return commands.length > 0
          ? [
              {
                ...badge,
                key: `${plugin.pluginKey}/${badge.id}`,
                pluginKey: plugin.pluginKey,
                pluginName: plugin.name,
                commands
              }
            ]
          : []
      })
    )
}

/** Worktree badges of enabled plugins, sharing the authoritative plugin-list refresh. */
export function usePluginWorktreeBadges(): ActivePluginWorktreeBadge[] {
  const plugins = usePluginPanelsStore((state) => state.plugins)
  useEffect(() => {
    ensurePluginPanelsLoaded()
  }, [])
  return useMemo(() => collectActivePluginWorktreeBadges(plugins), [plugins])
}
