import { toast } from 'sonner'
import { pluginCommandResultMessageSchema } from '../../../shared/plugins/contributions/plugin-worktree-badge'

/** Shows a worker's `{ message }` reply as a toast. */
export function showPluginCommandMessage(result: unknown): void {
  const reply = pluginCommandResultMessageSchema.safeParse(result)
  if (reply.success) {
    // Why: plugin replies render untranslated, like their manifest titles.
    toast(reply.data.message)
  }
}
