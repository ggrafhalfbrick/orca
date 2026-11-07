import { join, posix } from 'node:path'
import type { ValidDiscoveredPlugin } from './plugin-discovery'
import type { PluginWorkerController } from './workers/plugin-worker-controller'
import { isSafePluginRelativePath } from '../../shared/plugins/installation/plugin-path-safety'
import {
  pluginWorktreeCommandRequestSchema,
  type PluginWorktreeCommandArgs
} from '../../shared/plugins/contributions/plugin-worktree-badge'
import { runPluginReplacementWithinDeadline } from './plugin-command-replacement-deadline'

export type PluginWorktreeContextResolver = {
  resolvePluginWorktreeContext(
    worktreeId: string
  ): Promise<PluginWorktreeCommandArgs['worktree'] | null>
}

export function assertPluginWorkerCommand(
  plugin: ValidDiscoveredPlugin,
  commandId: string
): ValidDiscoveredPlugin['manifest']['contributes']['commands'][number] {
  const command = plugin.manifest.contributes.commands.find((entry) => entry.id === commandId)
  if (!command) {
    throw new Error(`plugin ${plugin.pluginKey} does not contribute command ${commandId}`)
  }
  // Renderer-owned action aliases cannot activate workers, even through direct IPC.
  if (command.action !== undefined) {
    throw new Error(`plugin ${plugin.pluginKey} command ${commandId} is a built-in action alias`)
  }
  return command
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
  if (command?.when !== 'workspace' || !canReadWorkspace) {
    return undefined
  }
  const worktree = await worktrees?.resolvePluginWorktreeContext(request.data.worktreeId)
  if (!worktree) {
    throw new Error('This workspace is not available on this computer.')
  }
  if (!request.data.folder) {
    return { worktree } satisfies PluginWorktreeCommandArgs
  }
  if (!isSafePluginRelativePath(request.data.folder)) {
    throw new Error('That folder is not inside this workspace.')
  }
  const relativePath = request.data.folder.replaceAll('\\', '/')
  // Why: an SSH worktree's path is POSIX even when this computer is Windows.
  const path =
    worktree.host === 'ssh'
      ? posix.join(worktree.path, relativePath)
      : join(worktree.path, relativePath)
  return { worktree, folder: { path, relativePath } } satisfies PluginWorktreeCommandArgs
}

/** `plugin` is the approved plugin (null when it is not): a palette or CLI run of its command. */
export async function invokePluginWorkerCommand(
  pluginKey: string,
  plugin: ValidDiscoveredPlugin | null,
  workers: Pick<PluginWorkerController, 'ensure'>,
  commandId: string,
  args?: unknown,
  /** Epoch ms past which the caller stopped waiting, so a slow start must not run it late. */
  startBy?: number
): Promise<unknown> {
  if (!plugin) {
    throw new Error(`plugin ${pluginKey} is not enabled`)
  }
  const command = assertPluginWorkerCommand(plugin, commandId)
  const handle = await workers.ensure(plugin)
  if (!handle.commands.includes(commandId)) {
    throw new Error(`plugin ${pluginKey} registered no handler for ${commandId}`)
  }
  if (startBy !== undefined && Date.now() > startBy) {
    throw new Error(`plugin ${pluginKey} started too late to run ${commandId}`)
  }
  if (startBy !== undefined && command.replaces !== undefined) {
    // Why: past startBy the renderer runs Orca's own action, so a handler that finishes later
    // must not run it again through commands.run.
    return runPluginReplacementWithinDeadline(pluginKey, command.replaces, startBy, () =>
      handle.invokeCommand(commandId, args)
    )
  }
  return handle.invokeCommand(commandId, args)
}

/** Integration-only (worktree badges): resolves a worktree command's folder before the worker runs it. */
export async function invokePluginWorktreeAwareCommand(
  worktrees: PluginWorktreeContextResolver | null,
  ...[pluginKey, plugin, workers, commandId, args, startBy]: Parameters<
    typeof invokePluginWorkerCommand
  >
): Promise<unknown> {
  const input = plugin ? await prepareWorkerCommandArgs(plugin, commandId, args, worktrees) : args
  return invokePluginWorkerCommand(pluginKey, plugin, workers, commandId, input, startBy)
}
