import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { isFolderRepo } from '../../../../../shared/repo-kind'
import { normalizePerforceSettings } from '../../../../../shared/perforce/perforce-settings'
import type { PerforceChordAction } from '../../../../../shared/perforce/perforce-file-chord'
import { refreshPerforceOpenedFiles } from './perforce-opened-files'
import { isKnownPerforceWorkspace } from './use-perforce-workspace'

export type PerforceChordFile = {
  worktreePath: string
  connectionId: string | undefined
  relativePath: string
}

/** The Perforce workspace file in the active editor tab, or null when no chord applies. */
export function readActivePerforceFile(): PerforceChordFile | null {
  const state = useAppStore.getState()
  if (state.activeTabType !== 'editor') {
    return null
  }
  const file = state.openFiles.find((candidate) => candidate.id === state.activeFileId)
  const isFileTab =
    file?.mode === 'edit' || (file?.mode === 'diff' && file.diffSource === 'unstaged')
  const worktree = file ? state.getKnownWorktreeById(file.worktreeId) : null
  const repo = worktree ? state.repos.find((candidate) => candidate.id === worktree.repoId) : null
  if (!file || !isFileTab || !worktree || !repo || !isFolderRepo(repo)) {
    return null
  }
  const connectionId = repo.connectionId ?? undefined
  return isKnownPerforceWorkspace(worktree.path, connectionId)
    ? {
        worktreePath: worktree.path,
        connectionId,
        relativePath: file.relativePath.replaceAll('\\', '/')
      }
    : null
}

async function openForEdit(file: PerforceChordFile): Promise<void> {
  const result = await window.api.perforce.edit({
    worktreePath: file.worktreePath,
    connectionId: file.connectionId,
    filePaths: [file.relativePath]
  })
  if (result.success) {
    toast.success(`Opened for edit: ${file.relativePath}`)
  } else {
    toast.error(result.error ?? 'Perforce command failed')
  }
}

async function revertFile(file: PerforceChordFile): Promise<void> {
  const target = { worktreePath: file.worktreePath, connectionId: file.connectionId }
  const status = await window.api.perforce.status(target)
  const entry = status.entries.find((candidate) => candidate.path === file.relativePath)
  if (!entry) {
    toast.info(`No changes to revert in ${file.relativePath}`)
    return
  }
  const settings = normalizePerforceSettings(useAppStore.getState().settings?.perforce)
  if (
    settings.confirmDestructiveActions &&
    !window.confirm(`Revert changes to ${file.relativePath}? This cannot be undone.`)
  ) {
    return
  }
  const result = await window.api.perforce.discard({ ...target, entries: [entry] })
  if (result.success) {
    toast.success(`Reverted: ${file.relativePath}`)
  } else {
    toast.error(result.error ?? 'Perforce command failed')
  }
}

export async function runPerforceChordAction(
  action: PerforceChordAction,
  file: PerforceChordFile
): Promise<void> {
  try {
    await (action === 'edit' ? openForEdit(file) : revertFile(file))
  } catch (error) {
    toast.error(error instanceof Error ? error.message : String(error))
  }
  // Why: the "E" tab marker and panel poll on a timer; refresh now so the change shows immediately.
  void refreshPerforceOpenedFiles(file.worktreePath, file.connectionId)
}
