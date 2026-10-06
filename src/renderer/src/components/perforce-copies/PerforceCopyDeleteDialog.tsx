import { useEffect, useState, type ReactNode } from 'react'
import { LoaderCircle, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import type {
  WorkspaceCopyRemovalPreview,
  WorkspaceCopyRemovalResult
} from '../../../../shared/perforce/workspace-copy/workspace-copy-types'
import { summarizeCopyRemoval } from './perforce-copy-removal-summary'

export type PerforceCopyDeleteTarget = {
  /** The Perforce folder project the copy belongs to. */
  repoId: string
  sourcePath: string
  copyName: string
}

type Props = {
  target: PerforceCopyDeleteTarget | null
  onClose: () => void
  onDeleted: (result: WorkspaceCopyRemovalResult) => void
}

/**
 * Asks before deleting a Perforce workspace copy, listing exactly what goes and what stays. Checked-out
 * files and shelves each need their own opt-in; nothing is deleted until the user confirms.
 */
export function PerforceCopyDeleteDialog({ target, onClose, onDeleted }: Props) {
  const [preview, setPreview] = useState<WorkspaceCopyRemovalPreview | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [revertOpenFiles, setRevertOpenFiles] = useState(false)
  const [deleteShelves, setDeleteShelves] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setPreview(null)
    setLoadError(null)
    setError(null)
    setRevertOpenFiles(false)
    setDeleteShelves(false)
    if (!target) {
      return
    }
    let cancelled = false
    void window.api.perforce
      .previewCopyRemoval({ repoId: target.repoId, name: target.copyName })
      .then((result) => {
        if (cancelled) {
          return
        }
        if (result.ok) {
          setPreview(result.value)
        } else {
          setLoadError(result.error)
        }
      })
    return () => {
      cancelled = true
    }
  }, [target])

  const blocked =
    !preview ||
    (preview.blockers.openFiles && !revertOpenFiles) ||
    (preview.blockers.shelves && !deleteShelves)

  const confirm = async (): Promise<void> => {
    if (!target || blocked) {
      return
    }
    setPending(true)
    setError(null)
    const result = await window.api.perforce.removeCopy({
      repoId: target.repoId,
      name: target.copyName,
      revertOpenFiles,
      deleteShelves
    })
    setPending(false)
    if (result.ok) {
      onDeleted(result.value)
      onClose()
    } else {
      setError(result.error)
    }
  }

  const summary = preview
    ? summarizeCopyRemoval(preview, { revertOpenFiles, deleteShelves }, target?.sourcePath ?? '')
    : null
  const shelved = preview?.pendingChanges.filter((change) => change.shelvedFiles > 0) ?? []

  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Delete Perforce copy “{target?.copyName}”?</DialogTitle>
          <DialogDescription>
            This deletes the copy on this computer and its client on the Perforce server. It cannot
            be undone.
          </DialogDescription>
        </DialogHeader>

        {!preview && !loadError ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" />
            Checking the copy for checked-out files, changelists and shelves…
          </div>
        ) : null}
        {loadError ? <p className="text-sm text-destructive">{loadError}</p> : null}

        {preview && summary ? (
          <div className="flex max-h-[55vh] min-w-0 flex-col gap-3 overflow-x-hidden overflow-y-auto scrollbar-sleek text-sm">
            {!preview.clientExists ? (
              <p className="text-muted-foreground">
                The client {preview.client} is no longer on the server; only files on this computer
                are left to delete.
              </p>
            ) : null}
            {preview.openFiles.count > 0 ? (
              <OptInWarning
                id="perforce-copy-revert"
                checked={revertOpenFiles}
                onChange={setRevertOpenFiles}
                label="Revert them and lose their changes"
              >
                {preview.openFiles.count} file(s) are checked out in this copy. Submit or shelve
                anything you want to keep first.
                <FileSample files={preview.openFiles.sample} total={preview.openFiles.count} />
              </OptInWarning>
            ) : null}
            {shelved.length > 0 ? (
              <OptInWarning
                id="perforce-copy-shelves"
                checked={deleteShelves}
                onChange={setDeleteShelves}
                label="Delete the shelved files too"
              >
                {shelved
                  .map((change) => `Changelist ${change.change} has ${change.shelvedFiles}`)
                  .join('; ')}{' '}
                shelved file(s). Anyone who has not unshelved them yet loses them.
              </OptInWarning>
            ) : null}
            {preview.processesHoldingFolder.length > 0 ? (
              <p className="flex gap-2 text-muted-foreground">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                Close these programs first; Windows will not delete a folder they have open:{' '}
                {preview.processesHoldingFolder.join(', ')}.
              </p>
            ) : null}
            <SummaryList title="Deleted" items={summary.deletes} />
            <SummaryList title="Kept" items={summary.keeps} />
          </div>
        ) : null}

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            className="w-32"
            onClick={() => void confirm()}
            disabled={blocked || pending}
          >
            {pending ? <LoaderCircle className="size-4 animate-spin" /> : 'Delete copy'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function OptInWarning({
  id,
  checked,
  onChange,
  label,
  children
}: {
  id: string
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-2 rounded-md border border-destructive/40 p-3">
      <div className="flex gap-2">
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
      <div className="flex items-center gap-2 pl-6">
        <Checkbox id={id} checked={checked} onCheckedChange={(value) => onChange(value === true)} />
        <Label htmlFor={id}>{label}</Label>
      </div>
    </div>
  )
}

function FileSample({ files, total }: { files: string[]; total: number }) {
  return (
    <ul className="mt-1 list-disc pl-5 font-mono text-xs text-muted-foreground">
      {files.map((file) => (
        <li key={file} className="truncate">
          {file}
        </li>
      ))}
      {total > files.length ? <li>and {total - files.length} more</li> : null}
    </ul>
  )
}

function SummaryList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <div className="mb-1 font-medium">{title}</div>
      <ul className="list-disc space-y-0.5 pl-5 text-muted-foreground">
        {items.map((item) => (
          <li key={item} className="break-words">
            {item}
          </li>
        ))}
      </ul>
    </div>
  )
}
