import { useCallback, useState } from 'react'
import { translate } from '@/i18n/i18n'
import { startTaskInExistingWorkspace } from '@/lib/plugin-task-existing-workspace-start'
import type { TuiAgent } from '../../../../shared/agent-launch/catalog/tui-agent'
import { NewWorkspaceComposerExistingWorkspaceField } from './NewWorkspaceComposerExistingWorkspaceField'
import type { NewWorkspaceComposerCardProps } from './new-workspace-composer-card-props'
import type { usePluginTaskLaunch } from './use-plugin-task-launch'

type ExistingWorkspaceCardProps = Pick<
  NewWorkspaceComposerCardProps,
  'existingWorkspaceField' | 'startsInExistingWorkspace'
> & { primaryActionLabel?: string }

/** Integration-only: a plugin task's prompt can start in one of the project's existing workspaces
 *  instead of a new one. */
export function usePluginTaskExistingWorkspace(args: {
  initialAgentDraft?: string
  quickAgent: TuiAgent | null
  cardProps: Pick<
    NewWorkspaceComposerCardProps,
    'repoId' | 'selectedRepoExecutionHostId' | 'projectOptions' | 'selectedProjectId'
  >
  pluginTask: ReturnType<typeof usePluginTaskLaunch>
  onStarted: () => void
}): {
  /** True when the create was a start in an existing workspace, so no workspace is created. */
  startInExisting: () => boolean
  cardProps: ExistingWorkspaceCardProps
} {
  const { quickAgent, cardProps, pluginTask, onStarted } = args
  const { repoId } = cardProps
  const isFolderWorkspaceTarget =
    cardProps.projectOptions?.find((option) => option.id === cardProps.selectedProjectId)?.kind ===
    'project-group'
  // Why keyed by project: picking another project must fall back to creating a workspace.
  const [existingWorkspace, setExistingWorkspace] = useState<{
    repoId: string
    worktreeId: string
  } | null>(null)
  const offersExistingWorkspace = args.initialAgentDraft !== undefined && !isFolderWorkspaceTarget
  const existingWorktreeId =
    offersExistingWorkspace && quickAgent !== null && existingWorkspace?.repoId === repoId
      ? existingWorkspace.worktreeId
      : null
  const selectExistingWorkspace = useCallback(
    (worktreeId: string | null) => setExistingWorkspace(worktreeId ? { repoId, worktreeId } : null),
    [repoId]
  )
  const { submitOptions } = pluginTask
  const startInExisting = useCallback((): boolean => {
    if (!existingWorktreeId) {
      return false
    }
    const { agentDraft, sessionOptions, linkedPluginTask } = submitOptions
    const started = startTaskInExistingWorkspace({
      agent: quickAgent,
      worktreeId: existingWorktreeId,
      prompt: agentDraft ?? '',
      ...(linkedPluginTask ? { link: linkedPluginTask } : {}),
      ...(sessionOptions ? { sessionOptions } : {})
    })
    if (started) {
      onStarted()
    }
    return true
  }, [existingWorktreeId, onStarted, quickAgent, submitOptions])
  const startLabel = existingWorktreeId
    ? translate('auto.components.NewWorkspaceComposerCard.startInWorkspace', 'Start in workspace')
    : null
  return {
    startInExisting,
    cardProps: {
      ...(startLabel ? { primaryActionLabel: startLabel } : {}),
      existingWorkspaceField: offersExistingWorkspace ? (
        <NewWorkspaceComposerExistingWorkspaceField
          repoId={repoId}
          executionHostId={cardProps.selectedRepoExecutionHostId}
          value={existingWorktreeId}
          onChange={selectExistingWorkspace}
          unavailableReason={
            pluginTask.cardProps(isFolderWorkspaceTarget).agentDraftUnavailableReason ?? null
          }
        />
      ) : undefined,
      startsInExistingWorkspace: existingWorktreeId !== null
    }
  }
}
