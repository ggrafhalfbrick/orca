import { useEffect, useId, useState } from 'react'
import { LoaderCircle, TriangleAlert } from 'lucide-react'
import { SwitchIndicator } from '@/components/ui/switch'
import { useAppStore } from '@/store'
import { normalizePerforceSettings } from '../../../../shared/perforce/perforce-settings'
import type { WorkspaceCopyReadiness } from '../../../../shared/perforce/workspace-copy/workspace-copy-types'
import { isFolderRepo } from '../../../../shared/repo-kind'
import { usePerforceWorkspace } from '../right-sidebar/perforce/use-perforce-workspace'
import { usePerforceCopyComposerChoiceStore } from './perforce-copy-composer-choice'
import { PerforceStreamPicker } from './PerforceStreamPicker'

function gb(bytes: number): string {
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`
}

/** One line on whether a copy can be made here, from the readiness check's own results. */
function ReadinessLine({ readiness }: { readiness: WorkspaceCopyReadiness | null }) {
  if (!readiness) {
    return (
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <LoaderCircle className="size-3.5 animate-spin" />
        Checking the drive and Perforce…
      </p>
    )
  }
  if (readiness.problems.length > 0) {
    return <p className="text-xs text-destructive">{readiness.problems.join(' ')}</p>
  }
  const facts = [
    readiness.blockCloning === 'verified' ? 'Block cloning verified' : null,
    readiness.fileSystemFreeBytes !== null ? `${gb(readiness.fileSystemFreeBytes)} free` : null,
    readiness.copiesDir ? `copies go in ${readiness.copiesDir}` : null
  ].filter(Boolean)
  return (
    <div className="space-y-1 text-xs text-muted-foreground">
      <p className="break-words">{facts.join(' · ')}</p>
      {readiness.warnings.map((warning) => (
        <p key={warning} className="flex gap-1.5">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
          {warning}
        </p>
      ))}
    </div>
  )
}

/**
 * "Use worktree" for a folder project inside a Perforce stream workspace: the new workspace becomes a
 * Perforce copy with its own client, as Git projects get a worktree. Renders nothing elsewhere.
 */
export function PerforceCopyComposerOption({ repoId }: { repoId: string }) {
  const repo = useAppStore((s) => s.repos.find((candidate) => candidate.id === repoId) ?? null)
  const defaultOn = useAppStore(
    (s) => normalizePerforceSettings(s.settings?.perforce).copyUseWorktreeByDefault
  )
  const eligible = repo !== null && isFolderRepo(repo)
  const { isPerforce } = usePerforceWorkspace(
    eligible ? repo.path : null,
    repo?.connectionId,
    eligible
  )
  const choice = usePerforceCopyComposerChoiceStore((s) => s.byRepo[repoId])
  const setChoice = usePerforceCopyComposerChoiceStore((s) => s.setChoice)
  const [readiness, setReadiness] = useState<WorkspaceCopyReadiness | null>(null)
  const streamLabelId = useId()

  useEffect(() => {
    if (isPerforce && !choice) {
      setChoice(repoId, { enabled: defaultOn })
    }
  }, [isPerforce, choice, defaultOn, repoId, setChoice])

  const enabled = isPerforce && choice?.enabled === true
  useEffect(() => {
    if (!enabled) {
      return
    }
    let cancelled = false
    setReadiness(null)
    void window.api.perforce.copyReadiness({ repoId }).then((result) => {
      if (!cancelled) {
        setReadiness(
          result.ok
            ? result.value
            : {
                ready: false,
                problems: [result.error],
                warnings: [],
                source: null,
                copiesDir: null,
                windowsBuild: null,
                fileSystemFreeBytes: null,
                blockCloning: null
              }
        )
      }
    })
    return () => {
      cancelled = true
    }
  }, [enabled, repoId])

  if (!isPerforce || !choice) {
    return null
  }
  return (
    <div className="min-w-0 space-y-2">
      <button
        type="button"
        role="switch"
        aria-checked={choice.enabled}
        onClick={() => setChoice(repoId, { enabled: !choice.enabled })}
        className="group flex w-fit cursor-pointer items-center gap-2 rounded-md text-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <SwitchIndicator checked={choice.enabled} />
        <span className="font-medium text-muted-foreground transition-colors group-hover:text-foreground">
          Use worktree
        </span>
        <span className="text-muted-foreground/70">Perforce copy with its own client</span>
      </button>
      {choice.enabled ? (
        <div className="space-y-1.5">
          <span id={streamLabelId} className="block text-xs font-medium text-muted-foreground">
            Stream
          </span>
          <PerforceStreamPicker
            repoId={repoId}
            labelId={streamLabelId}
            value={choice.stream}
            onChange={(stream) => setChoice(repoId, { stream })}
          />
          <ReadinessLine readiness={readiness} />
        </div>
      ) : null}
    </div>
  )
}
