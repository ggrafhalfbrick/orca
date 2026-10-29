import { toast } from 'sonner'
import type { ActivePluginCommand } from '@/store/plugin-panels'
import { isWorkspaceScopedPluginContext } from '../../../shared/plugins/contributions/plugin-command-contribution'
import { pluginCommandResultMessageSchema } from '../../../shared/plugins/contributions/plugin-worktree-badge'
import { dispatchAppCommand, type AppCommandSource } from './app-command-dispatch'

/** Resolves with whatever a worker handler returned; built-in actions return nothing. A workspace
 *  command gets `target`'s workspace as its `args`. */
export async function executePluginCommand(
  command: ActivePluginCommand,
  source: AppCommandSource,
  target?: { worktreeId: string | null }
): Promise<unknown> {
  if (command.handler.type === 'built-in') {
    if (!dispatchAppCommand(command.handler.action, source)) {
      throw new Error('built-in action is unavailable in the current context')
    }
    return undefined
  }
  const worktreeId = isWorkspaceScopedPluginContext(command.context) ? target?.worktreeId : null
  return window.api.plugins.invokeCommand({
    pluginKey: command.pluginKey,
    commandId: command.id,
    ...(worktreeId ? { args: { worktreeId } } : {})
  })
}

/** Shows a worker's `{ message }` reply as a toast. */
export function showPluginCommandMessage(result: unknown): void {
  const reply = pluginCommandResultMessageSchema.safeParse(result)
  if (reply.success) {
    // Why: plugin replies render untranslated, like their manifest titles.
    toast(reply.data.message)
  }
}
