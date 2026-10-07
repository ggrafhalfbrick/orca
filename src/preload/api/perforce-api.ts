import type {
  PerforceDetectResult,
  PerforceEntry,
  PerforceHistoryEntry,
  PerforceOperationResult,
  PerforceStatusResult
} from '../../shared/perforce/perforce-types'
import type {
  PerforceStreamList,
  WorkspaceCopyIpcResult,
  WorkspaceCopyListResult,
  WorkspaceCopyReadiness,
  WorkspaceCopyRemovalOptions,
  WorkspaceCopyRemovalPreview,
  WorkspaceCopyRemovalResult
} from '../../shared/perforce/workspace-copy/workspace-copy-types'

type WorktreeArgs = { worktreePath: string; connectionId?: string }
type Result = Promise<PerforceOperationResult>

export type PerforceApi = {
  info: (
    args: WorktreeArgs
  ) => Promise<
    | { success: true; info: { client: string; user: string; port: string; root: string } }
    | { success: false; error: string }
  >
  generateDescription: (
    args: WorktreeArgs & {
      changelist: 'default' | 'new' | number
      filePaths: string[]
    }
  ) => Promise<{ success: true; message: string } | { success: false; error: string }>
  detect: (args: WorktreeArgs) => Promise<PerforceDetectResult>
  status: (args: WorktreeArgs) => Promise<PerforceStatusResult>
  history: (args: WorktreeArgs & { limit?: number }) => Promise<PerforceHistoryEntry[]>
  open: (args: WorktreeArgs & { filePaths: string[] }) => Result
  edit: (args: WorktreeArgs & { filePaths: string[] }) => Result
  close: (args: WorktreeArgs & { filePaths: string[] }) => Result
  discard: (
    args: WorktreeArgs & { entries: Pick<PerforceEntry, 'path' | 'group' | 'action'>[] }
  ) => Result
  submit: (args: WorktreeArgs & { changelist: 'default' | number; message?: string }) => Result
  sync: (args: WorktreeArgs) => Result
  shelve: (args: WorktreeArgs & { changelist: number }) => Result
  unshelve: (args: WorktreeArgs & { changelist: number }) => Result
  unshelveFrom: (
    args: WorktreeArgs & { sourceChangelist: number; changelist: 'default' | number }
  ) => Result
  shelveAndRevertFiles: (args: WorktreeArgs & { changelist: number; filePaths: string[] }) => Result
  unshelveFiles: (args: WorktreeArgs & { changelist: number; depotPaths: string[] }) => Result
  deleteChangelistWithFiles: (args: WorktreeArgs & { changelist: number }) => Result
  deleteShelf: (args: WorktreeArgs & { changelist: number }) => Result
  createChangelist: (
    args: WorktreeArgs & { description: string; filePaths: string[] }
  ) => Promise<PerforceOperationResult & { changelist?: number }>
  editDescription: (args: WorktreeArgs & { changelist: number; description: string }) => Result
  moveToChangelist: (
    args: WorktreeArgs & { filePaths: string[]; changelist: 'default' | number }
  ) => Result
  deleteChangelist: (args: WorktreeArgs & { changelist: number }) => Result
  /** Workspace copies of the Perforce folder project `repoId`. */
  copyReadiness: (args: {
    repoId: string
  }) => Promise<WorkspaceCopyIpcResult<WorkspaceCopyReadiness>>
  listCopies: (args: { repoId: string }) => Promise<WorkspaceCopyIpcResult<WorkspaceCopyListResult>>
  /** Streams in the workspace's depot, for the create-workspace stream picker. */
  listCopyStreams: (args: { repoId: string }) => Promise<WorkspaceCopyIpcResult<PerforceStreamList>>
  /** Marks a folder project inside a Perforce workspace as a Perforce project; true when it is one. */
  detectProject: (args: { repoId: string }) => Promise<WorkspaceCopyIpcResult<boolean>>
  /** Lists copies and brings the sidebar in line (adopts outside-made copies, drops vanished ones). */
  syncCopies: (args: { repoId: string }) => Promise<WorkspaceCopyIpcResult<WorkspaceCopyListResult>>
  previewCopyRemoval: (args: {
    repoId: string
    name: string
  }) => Promise<WorkspaceCopyIpcResult<WorkspaceCopyRemovalPreview>>
  removeCopy: (
    args: { repoId: string; name: string } & WorkspaceCopyRemovalOptions
  ) => Promise<WorkspaceCopyIpcResult<WorkspaceCopyRemovalResult>>
}
