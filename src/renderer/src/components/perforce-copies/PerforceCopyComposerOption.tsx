import { useEffect, useId, useState } from 'react'
import { LoaderCircle, TriangleAlert } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import type { WorkspaceCopyReadiness } from '../../../../shared/perforce/workspace-copy/workspace-copy-types'
import { isPerforceRepo } from '../../../../shared/repo-kind'
import { usePerforceCopyComposerChoiceStore } from './perforce-copy-composer-choice'
import { PerforceStreamPicker } from './PerforceStreamPicker'

function gb(bytes: number): string {
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`
}

/** One line on where the copy goes, from the readiness check's own results. */
function ReadinessLine({ readiness }: { readiness: WorkspaceCopyReadiness | null }) {
  if (!readiness) {
    return (
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <LoaderCircle className="size-3.5 animate-spin" />
        {translate('perforce.copies.checkingDrive', 'Checking the drive and Perforce…')}
      </p>
    )
  }
  if (readiness.problems.length > 0) {
    return (
      <p className="text-xs text-destructive">
        {readiness.problems.join(' ')}{' '}
        {translate(
          'perforce.copies.sharesFolderInstead',
          'This workspace will share the project folder instead of getting its own copy.'
        )}
      </p>
    )
  }
  const facts = [
    readiness.blockCloning === 'verified'
      ? translate('perforce.copies.blockCloningVerified', 'Block cloning verified')
      : null,
    readiness.fileSystemFreeBytes !== null
      ? translate('perforce.copies.freeOnDrive', '{{size}} free', {
          size: gb(readiness.fileSystemFreeBytes)
        })
      : null,
    readiness.copiesDir
      ? translate('perforce.copies.copiesGoIn', 'copies go in {{folder}}', {
          folder: readiness.copiesDir
        })
      : null
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
 * Create from, for a Perforce project: each new workspace is a Perforce copy on a stream of its own,
 * as each new Git workspace is a worktree on a branch of its own. Renders nothing for other projects.
 */
export function PerforceCopyComposerOption({ repoId }: { repoId: string }) {
  const isPerforce = useAppStore((s) => {
    const repo = s.repos.find((candidate) => candidate.id === repoId)
    return repo ? isPerforceRepo(repo) : false
  })
  const choice = usePerforceCopyComposerChoiceStore((s) => s.byRepo[repoId])
  const setChoice = usePerforceCopyComposerChoiceStore((s) => s.setChoice)
  const [readiness, setReadiness] = useState<WorkspaceCopyReadiness | null>(null)
  const labelId = useId()

  useEffect(() => {
    if (!isPerforce) {
      return
    }
    let cancelled = false
    setReadiness(null)
    void window.api.perforce.copyReadiness({ repoId }).then((result) => {
      if (cancelled) {
        return
      }
      const value: WorkspaceCopyReadiness = result.ok
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
      setReadiness(value)
      setChoice(repoId, { ready: value.ready })
    })
    return () => {
      cancelled = true
    }
  }, [isPerforce, repoId, setChoice])

  if (!isPerforce) {
    return null
  }
  return (
    <div className="min-w-0 space-y-1.5">
      <span id={labelId} className="block text-xs font-medium text-muted-foreground">
        {translate('perforce.copies.createFrom', 'Create from')}
      </span>
      <PerforceStreamPicker
        repoId={repoId}
        labelId={labelId}
        value={choice?.stream ?? { kind: 'child' }}
        onChange={(stream) => setChoice(repoId, { stream })}
      />
      <ReadinessLine readiness={readiness} />
    </div>
  )
}
