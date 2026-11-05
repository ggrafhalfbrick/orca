import React, { useCallback, useState } from 'react'
import { translate } from '@/i18n/i18n'
import { startTaskInExistingWorkspace } from '@/lib/plugin-task-existing-workspace-start'
import type { TuiAgent } from '../../../../shared/agent-launch/catalog/tui-agent'
import { NewWorkspaceComposerExistingWorkspaceField } from './NewWorkspaceComposerExistingWorkspaceField'
import type { NewWorkspaceComposerCardProps } from './new-workspace-composer-card-props'
import type { usePluginTaskLaunch } from './use-plugin-task-launch'

type PluginTaskLaunchState = ReturnType<typeof usePluginTaskLaunch>

/** Integration-only: a plugin task's prompt can start in one of the project's existing workspaces
 *  instead of a new one. */
export function usePluginTaskExistingWorkspace(args: {
  hasAgentDraft: boolean
  quickAgent: TuiAgent | null
  isFolderWorkspaceTarget: boolean
  repoId: string
  executionHostId?: ExecutionHostId | null
  pluginTask: PluginTaskLaunchState
  onStarted: () => void
}): {
  primaryActionLabel: (newWorkspaceLabel: string) => string
  /** True when the create was a start in an existing workspace, so no workspace is created. */
  startInExisting: () => boolean
  cardProps: Pick<
    NewWorkspaceComposerCardProps,
    'existingWorkspaceField' | 'startsInExistingWorkspace'
  >
} {
  const { hasAgentDraft, quickAgent, isFolderWorkspaceTarget, repoId, pluginTask, onStarted } = args
  // Why keyed by project: picking another project must fall back to creating a workspace.
  const [existingWorkspace, setExistingWorkspace] = useState<{
    repoId: string
    worktreeId: string
  } | null>(null)
  const offersExistingWorkspace = hasAgentDraft && !isFolderWorkspaceTarget
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
  return {
    primaryActionLabel: (newWorkspaceLabel) =>
      existingWorktreeId
        ? translate(
            'auto.components.NewWorkspaceComposerCard.startInWorkspace',
            'Start in workspace'
          )
        : newWorkspaceLabel,
    startInExisting,
    cardProps: {
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
