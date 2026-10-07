import { useAppStore } from '@/store'
import type { LinkedPluginTask } from '../../../shared/plugins/plugin-task-link'

/** Records which plugin task a just-created workspace came from; best-effort like other post-create steps. */
export function persistCreatedWorkspacePluginTaskLink(
  worktreeId: string,
  link: LinkedPluginTask | undefined
): void {
  if (link) {
    void useAppStore.getState().updateWorktreeMeta(worktreeId, { linkedPluginTask: link })
  }
}
