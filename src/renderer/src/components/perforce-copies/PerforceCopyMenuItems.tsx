import { Layers } from 'lucide-react'
import { DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu'
import { useAppStore } from '@/store'
import { isFolderRepo } from '../../../../shared/repo-kind'
import type { Repo } from '../../../../shared/repo-types'
import { usePerforceWorkspace } from '../right-sidebar/perforce/use-perforce-workspace'

/** Project-menu entry for a folder project inside a Perforce workspace; copies are made with Use worktree. */
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
      <DropdownMenuItem onSelect={() => openModal('perforce-copies', { repoId: repo.id })}>
        <Layers className="size-3.5" />
        Manage Perforce copies…
      </DropdownMenuItem>
    </>
  )
}
