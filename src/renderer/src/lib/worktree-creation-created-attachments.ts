import { attachEphemeralVmRuntimeToWorkspace } from '@/lib/ephemeral-vm-worktree-creation'
import type { WorktreeCreationRequest } from '@/lib/pending-worktree-creation'
import { persistCreatedWorkspacePluginTaskLink } from '@/lib/plugin-task-workspace-link'

/** Binds what the request carried (a VM runtime, a plugin task) to the workspace it created. */
export async function attachCreatedWorkspaceState(
  request: WorktreeCreationRequest,
  worktreeId: string
): Promise<void> {
  await attachEphemeralVmRuntimeToWorkspace(request, worktreeId)
  persistCreatedWorkspacePluginTaskLink(worktreeId, request.linkedPluginTask)
}
