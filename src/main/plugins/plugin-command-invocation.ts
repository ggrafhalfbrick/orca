import type { ValidDiscoveredPlugin } from './plugin-discovery'
import {
  pluginWorktreeCommandRequestSchema,
  type PluginWorktreeCommandArgs
} from '../../shared/plugins/plugin-worktree-badge'

export type PluginWorktreeContextResolver = {
  resolvePluginWorktreeContext(
    worktreeId: string
  ): Promise<PluginWorktreeCommandArgs['worktree'] | null>
}

export function assertPluginWorkerCommand(plugin: ValidDiscoveredPlugin, commandId: string): void {
  const command = plugin.manifest.contributes.commands.find((entry) => entry.id === commandId)
  if (!command) {
    throw new Error(`plugin ${plugin.pluginKey} does not contribute command ${commandId}`)
  }
  // Declarative aliases are renderer-owned and must never cross the worker
  // activation boundary, even if a compromised renderer invokes IPC directly.
  if (command.action !== undefined) {
    throw new Error(`plugin ${plugin.pluginKey} command ${commandId} is a built-in action alias`)
  }
}

/** Asserts the command is a worker command and returns the args its handler receives. Callers
 *  pass only approved plugins, whose manifest capabilities are exactly their grant. */
export async function prepareWorkerCommandArgs(
  plugin: ValidDiscoveredPlugin,
  commandId: string,
  args: unknown,
  worktrees: PluginWorktreeContextResolver | null
): Promise<unknown> {
  assertPluginWorkerCommand(plugin, commandId)
  const request = pluginWorktreeCommandRequestSchema.safeParse(args)
  if (!request.success) {
    return args
  }
  const command = plugin.manifest.contributes.commands.find((entry) => entry.id === commandId)
  const canReadWorkspace = plugin.manifest.capabilities.some(
    (capability) => capability.kind === 'workspace:read'
  )
  // Why: worktree ids embed the folder path, so a request is never forwarded as-is; only a
  // worktree command of a plugin granted workspace:read learns the folder.
  if (command?.context !== 'worktree' || !canReadWorkspace) {
    return undefined
  }
  const worktree = await worktrees?.resolvePluginWorktreeContext(request.data.worktreeId)
  if (!worktree) {
    throw new Error('This workspace is not available on this computer.')
  }
  return { worktree } satisfies PluginWorktreeCommandArgs
}
