import { useCallback, useMemo, useState } from 'react'
import { translate } from '@/i18n/i18n'
import type { UseComposerStateOptions, UseComposerStateResult } from '@/hooks/useComposerState'
import { startTaskInExistingWorkspace } from '@/lib/plugin-task-existing-workspace-start'
import { sessionOptionsForAgent } from '@/lib/plugin-task-session-options'
import { NewWorkspaceComposerExistingWorkspaceField } from './NewWorkspaceComposerExistingWorkspaceField'
import { usePluginTaskComposerState, type PluginTaskLaunch } from './use-plugin-task-launch'

/** Integration-only: the plugin-task composer, where a task's prompt can start in one of the
 *  project's existing workspaces instead of a new one. */
export function usePluginTaskWorkspaceComposerState(
  data: PluginTaskLaunch,
  options: UseComposerStateOptions
): ReturnType<typeof usePluginTaskComposerState> {
  const state = usePluginTaskComposerState(data, options)
  const { cardProps, submitQuick } = state
  const { repoId, agentDraft } = cardProps
  const isFolderWorkspaceTarget =
    cardProps.projectOptions?.find((option) => option.id === cardProps.selectedProjectId)?.kind ===
    'project-group'
  // Why keyed by project: picking another project must fall back to creating a workspace.
  const [existingWorkspace, setExistingWorkspace] = useState<{
    repoId: string
    worktreeId: string
  } | null>(null)
  const offersExistingWorkspace = data.initialAgentDraft !== undefined && !isFolderWorkspaceTarget
  const existingWorktreeId =
    offersExistingWorkspace && existingWorkspace?.repoId === repoId
      ? existingWorkspace.worktreeId
      : null
  const selectExistingWorkspace = useCallback(
    (worktreeId: string | null) => setExistingWorkspace(worktreeId ? { repoId, worktreeId } : null),
    [repoId]
  )
  const { onCreated } = options
  const { initialAgentSessionOptions, linkedPluginTask } = data
  const submitInExistingWorkspace = useCallback<UseComposerStateResult['submitQuick']>(
    async (agent, submitOptions) => {
      // Why: without an agent there is nothing to start, so the create path applies.
      if (!existingWorktreeId || agent === null) {
        return submitQuick(agent, submitOptions)
      }
      const sessionOptions = sessionOptionsForAgent(initialAgentSessionOptions, agent)
      const started = startTaskInExistingWorkspace({
        agent,
        worktreeId: existingWorktreeId,
        prompt: agentDraft?.trim() ? agentDraft : '',
        ...(linkedPluginTask ? { link: linkedPluginTask } : {}),
        ...(sessionOptions ? { sessionOptions } : {})
      })
      if (started) {
        onCreated?.()
      }
    },
    [
      existingWorktreeId,
      submitQuick,
      initialAgentSessionOptions,
      agentDraft,
      linkedPluginTask,
      onCreated
    ]
  )
  const executionHostId = cardProps.selectedRepoExecutionHostId
  const workspaceCardProps = useMemo(
    () => ({
      ...cardProps,
      existingWorkspaceField: offersExistingWorkspace
        ? (quickAgent: string | null) => (
            <NewWorkspaceComposerExistingWorkspaceField
              repoId={repoId}
              executionHostId={executionHostId}
              value={existingWorktreeId}
              onChange={selectExistingWorkspace}
              unavailableReason={
                quickAgent === null
                  ? translate(
                      'auto.components.NewWorkspaceComposerModal.agentDraftNoAgent',
                      'Pick an agent to send this prompt.'
                    )
                  : null
              }
            />
          )
        : undefined,
      startsInExistingWorkspace: existingWorktreeId !== null
    }),
    [
      cardProps,
      offersExistingWorkspace,
      repoId,
      executionHostId,
      existingWorktreeId,
      selectExistingWorkspace
    ]
  )
  return { ...state, cardProps: workspaceCardProps, submitQuick: submitInExistingWorkspace }
}
