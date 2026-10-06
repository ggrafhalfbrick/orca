import { toast } from 'sonner'
import type { PerforceCopyCreateSummary } from '../../../../shared/perforce/workspace-copy/workspace-copy-types'

function gb(bytes: number): string {
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`
}

/** Where the copy is and what it cost, from the engine's measurements only. */
export function describeCreatedCopy(copy: PerforceCopyCreateSummary): string {
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

/** After Create workspace made a Perforce copy: its cost, warnings and the Unity binding line. */
export function announcePerforceCopy(copy: PerforceCopyCreateSummary | undefined): void {
  if (!copy) {
    return
  }
  const binding = copy.unityVersionControlBinding
  toast.success(`Perforce copy ${copy.name} is ready`, {
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
}
