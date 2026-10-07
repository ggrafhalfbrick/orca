import type { ReactNode } from 'react'
import { LoaderCircle, RefreshCw, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { translate } from '@/i18n/i18n'
import type { WorkspaceCopyHolder } from '../../../../shared/perforce/workspace-copy/workspace-copy-types'

/** A warning that blocks the delete until the user ticks its box. */
export function OptInWarning({
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

export function FileSample({ files, total }: { files: string[]; total: number }) {
  return (
    <ul className="mt-1 list-disc pl-5 font-mono text-xs text-muted-foreground">
      {files.map((file) => (
        <li key={file} className="truncate">
          {file}
        </li>
      ))}
      {total > files.length ? (
        <li>
          {translate('perforce.copies.andMore', 'and {{more}} more', {
            more: total - files.length
          })}
        </li>
      ) : null}
    </ul>
  )
}

/**
 * Programs with the copy open: the user closes them and checks again, or opts in to ending them.
 * Like the checked-out files, the delete waits for one or the other.
 */
export function HoldersWarning({
  holders,
  checked,
  onChange,
  onCheckAgain,
  checking
}: {
  holders: WorkspaceCopyHolder[]
  checked: boolean
  onChange: (checked: boolean) => void
  onCheckAgain: () => void
  checking: boolean
}) {
  return (
    <OptInWarning
      id="perforce-copy-holders"
      checked={checked}
      onChange={onChange}
      label={translate(
        'perforce.copies.endHoldersOptIn',
        'End these programs (anything unsaved in them is lost)'
      )}
    >
      {translate(
        'perforce.copies.holdersWarning',
        'These programs have this copy open, and Windows will not delete a folder in use. Close them yourself and check again, or end them here.'
      )}
      <ul className="mt-2 flex flex-col gap-1.5">
        {holders.map((holder) => (
          <li key={holder.pid} className="min-w-0">
            <div className="font-medium">
              {translate('perforce.copies.programPid', '{{name}} (pid {{pid}})', {
                name: holder.name,
                pid: holder.pid
              })}
            </div>
            <div className="line-clamp-2 break-all font-mono text-xs text-muted-foreground">
              {holder.commandLine}
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-2">
        <Button variant="outline" size="xs" onClick={onCheckAgain} disabled={checking}>
          {checking ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}
          {translate('perforce.copies.checkAgain', 'Check again')}
        </Button>
      </div>
    </OptInWarning>
  )
}

export function SummaryList({ title, items }: { title: string; items: string[] }) {
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
