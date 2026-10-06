import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { PerforceCopyDeleteDialog, type PerforceCopyDeleteTarget } from './PerforceCopyDeleteDialog'

function readTarget(data: Record<string, unknown>): PerforceCopyDeleteTarget | null {
  const { repoId, sourcePath, copyName } = data
  return typeof repoId === 'string' &&
    typeof sourcePath === 'string' &&
    typeof copyName === 'string'
    ? { repoId, sourcePath, copyName }
    : null
}

/** The `delete-perforce-copy` modal, opened from any sidebar delete of a Perforce copy. */
export default function PerforceCopyDeleteModal() {
  const modalData = useAppStore((s) => s.modalData)
  const closeModal = useAppStore((s) => s.closeModal)
  const target = readTarget(modalData)
  return (
    <PerforceCopyDeleteDialog
      target={target}
      onClose={closeModal}
      onDeleted={(result) => {
        toast.success(`Deleted Perforce copy ${result.name}`, {
          description: result.note ?? undefined
        })
      }}
    />
  )
}
