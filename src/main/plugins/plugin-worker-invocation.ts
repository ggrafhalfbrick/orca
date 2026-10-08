import {
  parsePluginTaskSourceResult,
  pluginTaskSourceRequestSchema,
  type PluginTaskDetail,
  type PluginTaskListResult
} from '../../shared/plugins/plugin-task-source'
import {
  prepareWorkerCommandArgs,
  type PluginWorktreeContextResolver
} from './plugin-command-invocation'
import type { ValidDiscoveredPlugin } from './plugin-discovery'
import type { PluginWorkerHandle } from './plugin-host-process'

/** What invoking plugin worker code needs from the plugin service. */
export type PluginWorkerInvocationDeps = {
  /** Null unless the plugin is installed, approved, and allowed to start work. */
  findStartablePlugin(pluginKey: string): ValidDiscoveredPlugin | null
  ensureWorker(plugin: ValidDiscoveredPlugin): Promise<PluginWorkerHandle>
  /** Resolves the worktree a worktree-context command runs for; null when no runtime is bound. */
  worktreeContextResolver(): PluginWorktreeContextResolver | null
}

function requireStartablePlugin(
  deps: PluginWorkerInvocationDeps,
  pluginKey: string
): ValidDiscoveredPlugin {
  const plugin = deps.findStartablePlugin(pluginKey)
  if (!plugin) {
    throw new Error(`plugin ${pluginKey} is not enabled`)
  }
  return plugin
}

export async function invokePluginWorkerCommand(
  deps: PluginWorkerInvocationDeps,
  pluginKey: string,
  commandId: string,
  args?: unknown
): Promise<unknown> {
  const plugin = requireStartablePlugin(deps, pluginKey)
  const input = await prepareWorkerCommandArgs(
    plugin,
    commandId,
    args,
    deps.worktreeContextResolver()
  )
  const handle = await deps.ensureWorker(plugin)
  if (!handle.commands.includes(commandId)) {
    throw new Error(`plugin ${pluginKey} registered no handler for ${commandId}`)
  }
  return handle.invokeCommand(commandId, input)
}

/** Runs one task-source operation in the plugin's worker. Both the request
 *  (from a renderer or paired client) and the worker's answer are untrusted. */
export async function invokePluginTaskSource(
  deps: PluginWorkerInvocationDeps,
  rawRequest: unknown
): Promise<PluginTaskListResult | PluginTaskDetail> {
  const request = pluginTaskSourceRequestSchema.parse(rawRequest)
  const { pluginKey, sourceId, operation } = request
  const plugin = requireStartablePlugin(deps, pluginKey)
  if (!plugin.manifest.contributes.taskSources.some((source) => source.id === sourceId)) {
    throw new Error(`plugin ${pluginKey} does not contribute task source ${sourceId}`)
  }
  // Why: manifest validation already pairs taskSources with this capability;
  // re-check so a future validation gap cannot open an unconsented source.
  if (!plugin.manifest.capabilities.some((capability) => capability.kind === 'tasks:provide')) {
    throw new Error(`plugin ${pluginKey} is not allowed to provide tasks`)
  }
  const handle = await deps.ensureWorker(plugin)
  if (!handle.taskSources.includes(sourceId)) {
    throw new Error(`plugin ${pluginKey} registered no handler for task source ${sourceId}`)
  }
  const raw = await handle.invokeTaskSource(sourceId, operation, request.params)
  const parsed = parsePluginTaskSourceResult(operation, raw)
  if (!parsed.ok) {
    throw new Error(`plugin ${pluginKey} returned an invalid ${operation} result: ${parsed.error}`)
  }
  return parsed.value
}
