import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { createBrowserUuid } from '@/lib/browser-uuid'
import { activateAndRevealWorktree } from '@/lib/worktree-activation'
import type { Repo } from '../../../../shared/repo-types'
import type {
  WorkspaceCopyCreateResult,
  WorkspaceCopyProgressPhase,
  WorkspaceCopyStreamChoice
} from '../../../../shared/perforce/workspace-copy/workspace-copy-types'

const PHASE_LABELS: Record<WorkspaceCopyProgressPhase, string> = {
  checking: 'Checking the workspace…',
  copying: 'Copying the workspace…',
  'creating-client': 'Creating the Perforce client…',
  adopting: 'Recording files in the new client…',
  restoring: 'Restoring files you have open…',
  aligning: 'Fetching files that differ…',
  rebinding: 'Pointing the copy at its client…',
  verifying: 'Checking the copy…',
  'rolling-back': 'Undoing the copy…'
}

function gb(bytes: number): string {
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`
}

/** What the copy cost and where it is, from the engine's measurements only. */
export function describeCreatedCopy(copy: WorkspaceCopyCreateResult): string {
  const { space } = copy
  const cost =
    space.cloned === true && space.copiedBytes !== null
      ? `Block-cloned ${gb(space.copiedBytes)} of files using ${gb(space.usedBytes)} of disk.`
      : `Used ${gb(space.usedBytes)} of disk.`
  return [
    `${copy.copyRoot} on ${copy.stream} (${copy.streamChoice}).`,
    cost,
    ...copy.warnings
  ].join(' ')
}

/**
 * Makes a Perforce copy of `repo` and opens it. Progress shows as stage labels in one toast; no
 * `name` lets main pick the next free `copy-<n>`.
 */
export async function runPerforceCopyCreate(
  repo: Pick<Repo, 'id'>,
  request: { name?: string; stream?: WorkspaceCopyStreamChoice } = {}
): Promise<boolean> {
  const operationId = createBrowserUuid()
  const toastId = toast.loading('Making a Perforce copy…', {
    description: 'Checking the workspace, the drive and Perforce'
  })
  const unsubscribe = window.api.perforce.onCopyProgress((event) => {
    if (event.operationId === operationId) {
      toast.loading(PHASE_LABELS[event.progress.phase], {
        id: toastId,
        description: event.progress.message
      })
    }
  })
  try {
    const result = await window.api.perforce.createCopy({
      repoId: repo.id,
      operationId,
      ...request
    })
    if (!result.ok) {
      toast.error('Could not make the Perforce copy', {
        id: toastId,
        description: result.error,
        duration: Number.POSITIVE_INFINITY,
        closeButton: true
      })
      return false
    }
    const { copy, worktreeId } = result.value
    const binding = copy.unityVersionControlBinding
    toast.success(`Perforce copy ${copy.name} is ready`, {
      id: toastId,
      description: describeCreatedCopy(copy),
      duration: 20_000,
      closeButton: true,
      ...(binding
        ? {
            action: {
              label: 'Copy Unity line',
              onClick: () => void navigator.clipboard.writeText(binding)
            }
          }
        : {})
    })
    await useAppStore.getState().fetchWorktrees(repo.id)
    activateAndRevealWorktree(worktreeId)
    return true
  } finally {
    unsubscribe()
  }
}
