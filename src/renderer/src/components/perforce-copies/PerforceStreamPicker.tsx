import { useEffect, useState } from 'react'
import { Check, ChevronsUpDown, LoaderCircle } from 'lucide-react'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { COMBOBOX_FIELD_SHELL } from '../new-workspace/type-ahead-combobox-styles'
import type {
  PerforceStreamList,
  WorkspaceCopyStreamChoice
} from '../../../../shared/perforce/workspace-copy/workspace-copy-types'

/** A stream's last path segment; every stream in the picker shares the depot prefix. */
function streamName(stream: string): string {
  return stream.slice(stream.lastIndexOf('/') + 1) || stream
}

function choiceLabel(choice: WorkspaceCopyStreamChoice, sourceStream: string): string {
  if (choice.kind === 'child') {
    return 'A new stream of its own (sparse child)'
  }
  if (choice.kind === 'stream') {
    return streamName(choice.stream)
  }
  return sourceStream ? `Same stream (${streamName(sourceStream)})` : 'Same stream'
}

/** Searchable stream picker: the workspace's stream, a new child stream, or any stream in the depot. */
export function PerforceStreamPicker({
  repoId,
  value,
  onChange,
  labelId
}: {
  repoId: string
  value: WorkspaceCopyStreamChoice
  onChange: (choice: WorkspaceCopyStreamChoice) => void
  labelId: string
}) {
  const [open, setOpen] = useState(false)
  const [list, setList] = useState<PerforceStreamList | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setList(null)
    setError(null)
    void window.api.perforce.listCopyStreams({ repoId }).then((result) => {
      if (cancelled) {
        return
      }
      if (result.ok) {
        setList(result.value)
      } else {
        setError(result.error)
      }
    })
    return () => {
      cancelled = true
    }
  }, [repoId])

  const select = (choice: WorkspaceCopyStreamChoice): void => {
    onChange(choice)
    setOpen(false)
  }
  const sourceStream = list?.sourceStream ?? ''
  const selectedStream = value.kind === 'stream' ? value.stream : null

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-labelledby={labelId}
          className={cn(
            COMBOBOX_FIELD_SHELL,
            'cursor-pointer justify-between text-left text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50'
          )}
        >
          <span className="truncate">{choiceLabel(value, sourceStream)}</span>
          <ChevronsUpDown className="size-3.5 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="flex w-[var(--radix-popover-trigger-width)] min-w-[17rem] flex-col"
      >
        <Command>
          <CommandInput placeholder="Search streams…" />
          <CommandList>
            <CommandEmpty>No matching stream.</CommandEmpty>
            <CommandGroup>
              <CommandItem value="same stream" onSelect={() => select({ kind: 'same-stream' })}>
                <Check
                  className={cn(
                    'size-3.5',
                    value.kind === 'same-stream' ? 'opacity-100' : 'opacity-0'
                  )}
                />
                <span className="truncate">
                  {choiceLabel({ kind: 'same-stream' }, sourceStream)}
                </span>
              </CommandItem>
              <CommandItem
                value="new stream of its own sparse child"
                onSelect={() => select({ kind: 'child' })}
              >
                <Check
                  className={cn('size-3.5', value.kind === 'child' ? 'opacity-100' : 'opacity-0')}
                />
                <span className="truncate">{choiceLabel({ kind: 'child' }, sourceStream)}</span>
              </CommandItem>
            </CommandGroup>
            {!list && !error ? (
              <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
                <LoaderCircle className="size-3.5 animate-spin" />
                Loading streams…
              </div>
            ) : null}
            {error ? <p className="px-3 py-2 text-xs text-destructive">{error}</p> : null}
            {list && list.streams.length > 0 ? (
              <CommandGroup heading="Existing streams">
                {list.streams
                  .filter((entry) => entry.stream !== sourceStream)
                  .map((entry) => (
                    <CommandItem
                      key={entry.stream}
                      value={entry.stream}
                      onSelect={() => select({ kind: 'stream', stream: entry.stream })}
                    >
                      <Check
                        className={cn(
                          'size-3.5',
                          selectedStream === entry.stream ? 'opacity-100' : 'opacity-0'
                        )}
                      />
                      <span className="min-w-0 flex-1 truncate">{entry.name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{entry.type}</span>
                    </CommandItem>
                  ))}
              </CommandGroup>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
