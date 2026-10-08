import { toast } from 'sonner'
import type { ActivePluginCommand } from '@/store/plugin-panels'
import { pluginCommandResultMessageSchema } from '../../../shared/plugins/plugin-worktree-badge'
import { dispatchAppCommand, type AppCommandSource } from './app-command-dispatch'

export async function executePluginCommand(
  command: ActivePluginCommand,
  source: AppCommandSource,
  target?: { worktreeId: string | null }
): Promise<void> {
  if (command.handler.type === 'built-in') {
    if (!dispatchAppCommand(command.handler.action, source)) {
      throw new Error('built-in action is unavailable in the current context')
    }
    return
  }
  const worktreeId = command.context === 'worktree' ? target?.worktreeId : null
  const result = await window.api.plugins.invokeCommand({
    pluginKey: command.pluginKey,
    commandId: command.id,
    ...(worktreeId ? { args: { worktreeId } } : {})
  })
  const reply = pluginCommandResultMessageSchema.safeParse(result)
  if (reply.success) {
    // Why: plugin replies render untranslated, like their manifest titles.
    toast(reply.data.message)
  }
}
