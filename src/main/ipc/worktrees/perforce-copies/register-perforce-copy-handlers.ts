import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import { getRepoExecutionHostId } from '../../../../shared/execution-host'
import { normalizePerforceSettings } from '../../../../shared/perforce/perforce-settings'
import {
  requireCopyName,
  requireRemovalOptions
} from '../../../../shared/perforce/workspace-copy/workspace-copy-arguments'
import type { WorkspaceCopyBackend } from '../../../../shared/perforce/workspace-copy/workspace-copy-backend'
import type {
  WorkspaceCopyIpcResult,
  WorkspaceCopyRemovalResult
} from '../../../../shared/perforce/workspace-copy/workspace-copy-types'
import { isFolderRepo } from '../../../../shared/repo-kind'
import type { Repo } from '../../../../shared/repo-types'
import { resolveWorkspaceCopyBackend } from '../../../perforce/perforce-copy-backend'
import {
  invalidateAuthorizedRootsCache,
  resolveRegisteredWorktreePath
} from '../../registered-worktree-roots-cache'
import { notifyWorktreesChanged } from '../../worktree-remote'
import {
  removeWorktreeMetadataAndTransientState,
  stopPtysForDestructiveWorktreeRemoval
} from '../removal/worktree-removal-ownership'
import { copyRemovalRefusal } from '../../../../shared/perforce/workspace-copy/workspace-copy-remove'
import type { WorktreeIpcContext } from '../worktree-ipc-context'
import { copyWorktreeIdForName, syncCopyWorktrees } from './perforce-copy-worktree-meta'

type RepoArgs = { repoId: string }
type CopyArgs = RepoArgs & { name: string }

const GB = 1024 ** 3

/** Copies belong to a folder project: its folder is where the source workspace is resolved. */
function requireFolderRepo(context: WorktreeIpcContext, repoId: string): Repo {
  const repo = context.store.getRepos().find((candidate) => candidate.id === repoId)
  if (!repo || !isFolderRepo(repo)) {
    throw new Error('Perforce copies belong to a folder project; this project is not one.')
  }
  return repo
}

async function sourceDir(context: WorktreeIpcContext, repo: Repo): Promise<string> {
  // Why: SSH paths belong to the remote host; only local paths are checked against registered roots.
  return repo.connectionId ? repo.path : resolveRegisteredWorktreePath(repo.path, context.store)
}

function changed(context: WorktreeIpcContext, repo: Repo): void {
  invalidateAuthorizedRootsCache()
  notifyWorktreesChanged(context.mainWindow, repo.id)
}

export function registerPerforceCopyHandlers(context: WorktreeIpcContext): void {
  const { store } = context
  const settings = () => normalizePerforceSettings(store.getSettings().perforce)
  const handle = <A extends RepoArgs, T>(
    channel: string,
    run: (
      backend: WorkspaceCopyBackend,
      dir: string,
      repo: Repo,
      args: A,
      event: IpcMainInvokeEvent
    ) => Promise<T>
  ): void => {
    ipcMain.handle(
      `perforce:${channel}`,
      async (event, args: A): Promise<WorkspaceCopyIpcResult<T>> => {
        try {
          const repo = requireFolderRepo(context, args.repoId)
          const backend = resolveWorkspaceCopyBackend(repo.connectionId)
          const value = await run(backend, await sourceDir(context, repo), repo, args, event)
          return { ok: true, value }
        } catch (error) {
          return { ok: false, error: error instanceof Error ? error.message : String(error) }
        }
      }
    )
  }

  handle('copyReadiness', (b, dir) => b.readiness(dir, settings().copyMinFreeSpaceGb * GB))
  handle('listCopies', (b, dir) => b.list(dir))
  handle('listCopyStreams', (b, dir) => b.streams(dir))
  handle('syncCopies', async (b, dir, repo) => {
    const listing = await b.list(dir)
    if (syncCopyWorktrees(store, repo, listing)) {
      changed(context, repo)
    }
    return listing
  })
  handle<CopyArgs, Awaited<ReturnType<WorkspaceCopyBackend['previewRemoval']>>>(
    'previewCopyRemoval',
    (b, dir, _repo, args) => b.previewRemoval(dir, requireCopyName(args.name))
  )
  handle<
    CopyArgs & { revertOpenFiles?: boolean; deleteShelves?: boolean },
    WorkspaceCopyRemovalResult
  >('removeCopy', async (b, dir, repo, args) => {
    const name = requireCopyName(args.name)
    const options = requireRemovalOptions(args)
    // Why first: a refusal must not have already closed the copy's terminals.
    const refusal = copyRemovalRefusal(await b.previewRemoval(dir, name), options)
    if (refusal) {
      throw new Error(refusal)
    }
    const found = copyWorktreeIdForName(store, repo, name)
    const { runtime } = context
    // Why: watchers and terminals hold handles inside the copy, and Windows will not move a folder in use.
    const gate = found
      ? await runtime.acquireFileWatcherRemoval(found.path, repo.connectionId ?? undefined)
      : null
    let completed = false
    let result: WorkspaceCopyRemovalResult
    try {
      if (found) {
        await stopPtysForDestructiveWorktreeRemoval(
          runtime,
          found.worktreeId,
          repo.connectionId ? { connectionId: repo.connectionId } : {}
        )
      }
      result = await b.remove(dir, name, options)
      completed = true
    } finally {
      await gate?.finish(completed)
    }
    if (found) {
      removeWorktreeMetadataAndTransientState(store, found.worktreeId, getRepoExecutionHostId(repo))
    }
    changed(context, repo)
    return result
  })
}
