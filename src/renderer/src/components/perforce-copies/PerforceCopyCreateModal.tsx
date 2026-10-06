import { useEffect, useState } from 'react'
import { LoaderCircle, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { useAppStore } from '@/store'
import {
  COPY_NAME_PATTERN,
  suggestCopyName
} from '../../../../shared/perforce/workspace-copy/workspace-copy-name-rules'
import type {
  WorkspaceCopyReadiness,
  WorkspaceCopyStreamChoice
} from '../../../../shared/perforce/workspace-copy/workspace-copy-types'
import { runPerforceCopyCreate } from './perforce-copy-create-flow'

type StreamKind = WorkspaceCopyStreamChoice['kind']

const CLONING_TEXT: Record<NonNullable<WorkspaceCopyReadiness['blockCloning']>, string> = {
  verified: 'Block cloning verified on this drive: copies share disk space until files change.',
  unknown: 'Block cloning could not be confirmed on this drive.',
  'not-cloning': 'This drive does not block-clone; every copy would use the full workspace size.'
}

function gb(bytes: number): string {
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`
}

/** "New Perforce copy…": the one-click copy with a chosen name and stream, after a readiness check. */
export default function PerforceCopyCreateModal() {
  const modalData = useAppStore((s) => s.modalData)
  const closeModal = useAppStore((s) => s.closeModal)
  const repos = useAppStore((s) => s.repos)
  const repo = repos.find((candidate) => candidate.id === modalData.repoId) ?? null
  const [readiness, setReadiness] = useState<WorkspaceCopyReadiness | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [streamKind, setStreamKind] = useState<StreamKind>('same-stream')
  const [otherStream, setOtherStream] = useState('')

  useEffect(() => {
    if (!repo) {
      return
    }
    let cancelled = false
    void Promise.all([
      window.api.perforce.copyReadiness({ repoId: repo.id }),
      window.api.perforce.listCopies({ repoId: repo.id })
    ]).then(([ready, listed]) => {
      if (cancelled) {
        return
      }
      if (!ready.ok) {
        setLoadError(ready.error)
        return
      }
      setReadiness(ready.value)
      setName(suggestCopyName(listed.ok ? listed.value.copies.map((copy) => copy.name) : []))
    })
    return () => {
      cancelled = true
    }
  }, [repo])

  const nameValid = COPY_NAME_PATTERN.test(name)
  const streamValid = streamKind !== 'stream' || /^\/\/[^\s@#*%]+$/.test(otherStream.trim())
  const canCreate = Boolean(repo && readiness?.ready && nameValid && streamValid)
  const sourceStream = readiness?.source?.stream ?? ''

  const create = (): void => {
    if (!repo || !canCreate) {
      return
    }
    const stream: WorkspaceCopyStreamChoice =
      streamKind === 'stream'
        ? { kind: 'stream', stream: otherStream.trim() }
        : { kind: streamKind }
    closeModal()
    void runPerforceCopyCreate(repo, { name, stream })
  }

  return (
    <Dialog open onOpenChange={(open) => !open && closeModal()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New Perforce copy</DialogTitle>
          <DialogDescription>
            A copy-on-write copy of {readiness?.source?.root ?? repo?.path} beside it, with its own
            Perforce client. Files you have open are not carried over.
          </DialogDescription>
        </DialogHeader>

        {!readiness && !loadError ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" />
            Checking the drive and Perforce…
          </div>
        ) : null}
        {loadError ? <p className="text-sm text-destructive">{loadError}</p> : null}

        {readiness ? (
          <div className="flex flex-col gap-4 text-sm">
            <ul className="list-disc space-y-0.5 pl-5 text-muted-foreground">
              {readiness.source ? (
                <li className="break-words">
                  Client {readiness.source.client} on {readiness.source.stream}
                </li>
              ) : null}
              {readiness.copiesDir ? (
                <li className="break-words">Copies go in {readiness.copiesDir}</li>
              ) : null}
              {readiness.fileSystemFreeBytes !== null ? (
                <li>{gb(readiness.fileSystemFreeBytes)} free on the drive</li>
              ) : null}
              {readiness.blockCloning ? <li>{CLONING_TEXT[readiness.blockCloning]}</li> : null}
            </ul>
            {readiness.problems.map((problem) => (
              <p key={problem} className="text-destructive">
                {problem}
              </p>
            ))}
            {readiness.warnings.map((warning) => (
              <p key={warning} className="flex gap-2 text-muted-foreground">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                {warning}
              </p>
            ))}
            {readiness.ready ? (
              <>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="perforce-copy-name">Name</Label>
                  <Input
                    id="perforce-copy-name"
                    value={name}
                    autoFocus
                    onChange={(event) => setName(event.target.value)}
                    onKeyDown={(event) => event.key === 'Enter' && create()}
                  />
                  {!nameValid ? (
                    <p className="text-xs text-destructive">Use 1-24 letters, digits or hyphens.</p>
                  ) : null}
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Stream</Label>
                  <Select
                    value={streamKind}
                    onValueChange={(value: StreamKind) => setStreamKind(value)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="same-stream">Same stream ({sourceStream})</SelectItem>
                      <SelectItem value="child">A new stream of its own (sparse child)</SelectItem>
                      <SelectItem value="stream">Another existing stream…</SelectItem>
                    </SelectContent>
                  </Select>
                  {streamKind === 'stream' ? (
                    <Input
                      placeholder="//Depot/Stream"
                      value={otherStream}
                      onChange={(event) => setOtherStream(event.target.value)}
                    />
                  ) : null}
                </div>
              </>
            ) : null}
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="ghost" onClick={closeModal}>
            Cancel
          </Button>
          <Button onClick={create} disabled={!canCreate}>
            Create copy
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
