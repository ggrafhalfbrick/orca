import { randomUUID } from 'node:crypto'
import type { BrowserWindow } from 'electron'
import {
  copyExcludedFolderList,
  normalizePerforceSettings
} from '../../../../shared/perforce/perforce-settings'
import { requireCreateOptions } from '../../../../shared/perforce/workspace-copy/workspace-copy-arguments'
import { uniqueCopyName } from '../../../../shared/perforce/workspace-copy/workspace-copy-name-rules'
import { toCopyName } from '../../../../shared/perforce/workspace-copy/workspace-copy-names'
import type { Repo } from '../../../../shared/repo-types'
import type { CreateWorktreeResult } from '../../../../shared/worktree/create-types'
import { getPerforceCopyWorktreeId } from '../../../../shared/worktree/perforce-copy-worktree'
import { resolveWorkspaceCopyBackend } from '../../../perforce/perforce-copy-backend'
import type { Store } from '../../../persistence/loading-store/store'
import {
  invalidateAuthorizedRootsCache,
  resolveRegisteredWorktreePath
} from '../../registered-worktree-roots-cache'
import { emitCreateWorktreeProgress } from '../../worktree-remote'
import { folderWorkspaceCreateMeta } from '../create/folder-workspace-creation'
import { mergeFolderWorkspace } from '../folder-workspace-model'
import type { CreateWorktreeArgsWithSystemProvenance } from '../ipc-context-schemas'
import { copyWorktreePath } from './perforce-copy-worktree-meta'

const GB = 1024 ** 3

/**
 * "Use worktree" for a folder project in a Perforce stream workspace: the new workspace is a Perforce
 * copy named after it, with its own client, instead of a second session on the project folder.
 */
export async function createPerforceCopyWorkspace(
  args: CreateWorktreeArgsWithSystemProvenance,
  repo: Repo,
  store: Store,
  mainWindow: BrowserWindow
): Promise<CreateWorktreeResult> {
  const backend = resolveWorkspaceCopyBackend(repo.connectionId)
  // Why: SSH paths belong to the remote host; only local paths are checked against registered roots.
  const dir = repo.connectionId ? repo.path : await resolveRegisteredWorktreePath(repo.path, store)
  const progress = (detail: string): void =>
    emitCreateWorktreeProgress(mainWindow, 'creating', args.creationId, detail)
  progress('Checking the workspace, the drive and Perforce…')
  const settings = normalizePerforceSettings(store.getSettings().perforce)
  const taken = (await backend.list(dir)).copies.map((copy) => copy.name)
  const options = requireCreateOptions({
    name: uniqueCopyName(toCopyName(args.name), taken),
    stream: args.perforceCopy?.stream,
    skipPackageCache: settings.copySkipPackageCache,
    extraExcludedFolders: copyExcludedFolderList(settings),
    minFreeBytes: settings.copyMinFreeSpaceGb * GB
  })
  const copy = await backend.create(dir, options, (step) => progress(step.message))
  const worktreeId = getPerforceCopyWorktreeId(
    repo,
    copyWorktreePath(repo, copy.source.root, copy.copyRoot)
  )
  const meta = store.setWorktreeMeta(worktreeId, {
    instanceId: randomUUID(),
    ...folderWorkspaceCreateMeta(args, repo, store, Date.now()),
    perforceStream: copy.stream
  })
  invalidateAuthorizedRootsCache()
  return {
    worktree: mergeFolderWorkspace(repo, worktreeId, meta),
    perforceCopy: {
      name: copy.name,
      copyRoot: copy.copyRoot,
      stream: copy.stream,
      streamChoice: copy.streamChoice,
      space: copy.space,
      warnings: copy.warnings,
      unityVersionControlBinding: copy.unityVersionControlBinding
    }
  }
}
