import { useCallback, useEffect, useState } from 'react'
import { LoaderCircle, RefreshCw, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { useAppStore } from '@/store'
import type {
  WorkspaceCopyListEntry,
  WorkspaceCopyListResult
} from '../../../../shared/perforce/workspace-copy/workspace-copy-types'

/** The copy's state in words; anything but "Ready" is something Clean up (Delete) resolves. */
export function copyStatus(copy: WorkspaceCopyListEntry, serverChecked: boolean): string {
  if (!copy.folderExists && !copy.clientExists) {
    return 'Only the marker file is left'
  }
  if (!copy.folderExists) {
    return 'Folder missing; client still on the server'
  }
  if (serverChecked && !copy.clientExists) {
    return 'Client deleted on the server; folder left behind'
  }
  return 'Ready'
}

/** Lists every copy of a Perforce folder project, including leftovers, each with Delete. */
export default function PerforceCopiesModal() {
  const modalData = useAppStore((s) => s.modalData)
  const closeModal = useAppStore((s) => s.closeModal)
  const openModal = useAppStore((s) => s.openModal)
  const repos = useAppStore((s) => s.repos)
  const repo = repos.find((candidate) => candidate.id === modalData.repoId) ?? null
  const [listing, setListing] = useState<WorkspaceCopyListResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    if (!repo) {
      return
    }
    setLoading(true)
    setError(null)
    // Sync, not just list: copies made outside Orca join the sidebar and vanished ones leave it.
    const result = await window.api.perforce.syncCopies({ repoId: repo.id })
    setLoading(false)
    if (result.ok) {
      setListing(result.value)
    } else {
      setError(result.error)
    }
  }, [repo])

  useEffect(() => {
    void load()
  }, [load])

  const remove = (copy: WorkspaceCopyListEntry): void => {
    if (repo) {
      openModal('delete-perforce-copy', {
        repoId: repo.id,
        sourcePath: repo.path,
        copyName: copy.name
      })
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && closeModal()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Perforce copies</DialogTitle>
          <DialogDescription>
            {listing
              ? `Copies of ${listing.source.client} in ${listing.copiesDir}, including any made with the p4-worktree tool.`
              : 'Copies of this workspace, including any made with the p4-worktree tool.'}
          </DialogDescription>
        </DialogHeader>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {listing && !listing.serverChecked ? (
          <p className="text-sm text-muted-foreground">
            The Perforce server could not be asked ({listing.serverError}); showing what is on disk.
          </p>
        ) : null}
        {!listing && loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" />
            Reading copies from disk and the Perforce server…
          </div>
        ) : null}
        {listing && listing.copies.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No copies yet. Use New Perforce copy in the project menu.
          </p>
        ) : null}
        {listing && listing.copies.length > 0 ? (
          <ul className="flex max-h-[55vh] flex-col divide-y divide-border overflow-y-auto scrollbar-sleek rounded-md border border-border text-sm">
            {listing.copies.map((copy) => {
              const status = copyStatus(copy, listing.serverChecked)
              return (
                <li key={copy.name} className="flex items-center gap-3 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">{copy.name}</span>
                      <Badge variant={status === 'Ready' ? 'secondary' : 'destructive'}>
                        {status}
                      </Badge>
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {copy.stream ?? 'stream unknown'} · {copy.client}
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => remove(copy)}>
                    <Trash2 className="size-3.5" />
                    Delete…
                  </Button>
                </li>
              )
            })}
          </ul>
        ) : null}

        <DialogFooter>
          <Button variant="ghost" onClick={() => void load()} disabled={loading}>
            <RefreshCw className="size-3.5" />
            Refresh
          </Button>
          <Button variant="secondary" onClick={closeModal}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
