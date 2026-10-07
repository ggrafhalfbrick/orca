import { ipcMain } from 'electron'
import { isPerforceCopyOperationName } from '../../../../shared/perforce/workspace-copy/workspace-copy-operations'
import type { WorkspaceCopyIpcResult } from '../../../../shared/perforce/workspace-copy/workspace-copy-types'
import type { WorktreeIpcContext } from '../worktree-ipc-context'

/** Copy operations of this desktop's folder projects, done by its runtime as for a paired client. */
export function registerPerforceCopyHandlers(context: WorktreeIpcContext): void {
  ipcMain.handle(
    'perforce:runCopy',
    async (
      _event,
      operation: unknown,
      args: Record<string, unknown> & { repoId: string }
    ): Promise<WorkspaceCopyIpcResult<unknown>> => {
      try {
        if (!isPerforceCopyOperationName(operation)) {
          throw new Error('Unknown Perforce copy operation')
        }
        // Why no settings: without a client's, the runtime applies this desktop's Settings > Perforce.
        const { repoId, ...params } = args
        const value = await context.runtime.runPerforceCopyOperation(
          `id:${repoId}`,
          operation,
          params
        )
        return { ok: true, value }
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) }
      }
    }
  )
}
