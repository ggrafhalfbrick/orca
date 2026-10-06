import { Copy, CopyPlus, Layers } from 'lucide-react'
import { DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu'
import { useAppStore } from '@/store'
import { isFolderRepo } from '../../../../shared/repo-kind'
import type { Repo } from '../../../../shared/repo-types'
import { usePerforceWorkspace } from '../right-sidebar/perforce/use-perforce-workspace'
import { runPerforceCopyCreate } from './perforce-copy-create-flow'

/** Project-menu items for a folder project inside a Perforce workspace; nothing for other projects. */
export function PerforceCopyMenuItems({ repo }: { repo: Repo }) {
  const eligible = isFolderRepo(repo)
  const { isPerforce } = usePerforceWorkspace(
    eligible ? repo.path : null,
    repo.connectionId,
    eligible
  )
  const openModal = useAppStore((s) => s.openModal)
  if (!isPerforce) {
    return null
  }
  return (
    <>
      <DropdownMenuSeparator />
      <DropdownMenuItem onSelect={() => void runPerforceCopyCreate(repo)}>
        <Copy className="size-3.5" />
        New Perforce copy
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={() => openModal('perforce-copy-create', { repoId: repo.id })}>
        <CopyPlus className="size-3.5" />
        New Perforce copy…
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={() => openModal('perforce-copies', { repoId: repo.id })}>
        <Layers className="size-3.5" />
        Manage Perforce copies…
      </DropdownMenuItem>
    </>
  )
}
