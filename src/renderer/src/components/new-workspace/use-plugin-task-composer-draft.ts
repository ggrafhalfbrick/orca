import { useCallback, useMemo, useState } from 'react'
import { translate } from '@/i18n/i18n'
import {
  describePluginTaskSessionOptions,
  sessionOptionsForAgent,
  type PluginTaskSessionOptions
} from '@/lib/plugin-task-session-options'
import type { QuickSubmitOptions } from '@/hooks/composer-state/quick-creation-request'
import type { LinkedPluginTask } from '../../../../shared/plugins/tasks/plugin-task-link'
import type { TuiAgent } from '../../../../shared/tui-agent'

type PluginTaskComposerDraftInput = {
  initialAgentDraft?: string
  initialAgentSessionOptions?: PluginTaskSessionOptions
  linkedPluginTask?: LinkedPluginTask
  quickAgent: TuiAgent | null
  isFolderWorkspaceTarget: boolean
  repoId: string
}

/** Agent prompt, session options and existing-workspace pick a plugin task prefills into the composer. */
export function usePluginTaskComposerDraft({
  initialAgentDraft,
  initialAgentSessionOptions,
  linkedPluginTask,
  quickAgent,
  isFolderWorkspaceTarget,
  repoId
}: PluginTaskComposerDraftInput) {
  const [agentDraft, setAgentDraft] = useState<string | null>(initialAgentDraft ?? null)
  // Why keyed by project: picking another project must fall back to creating a workspace.
  const [existingWorkspace, setExistingWorkspace] = useState<{
    repoId: string
    worktreeId: string
  } | null>(null)
  const launchSessionOptions = useMemo(
    () => sessionOptionsForAgent(initialAgentSessionOptions, quickAgent),
    [initialAgentSessionOptions, quickAgent]
  )
  const offersExistingWorkspace = initialAgentDraft !== undefined && !isFolderWorkspaceTarget
  const existingWorktreeId =
    offersExistingWorkspace && quickAgent !== null && existingWorkspace?.repoId === repoId
      ? existingWorkspace.worktreeId
      : null
  const agentDraftUnavailableReason = isFolderWorkspaceTarget
    ? translate(
        'auto.components.NewWorkspaceComposerModal.agentDraftFolderGroup',
        'Folder workspaces do not take an agent prompt, so this one will not be sent.'
      )
    : quickAgent === null
      ? translate(
          'auto.components.NewWorkspaceComposerModal.agentDraftNoAgent',
          'Pick an agent to send this prompt.'
        )
      : null
  const selectExistingWorkspace = useCallback(
    (worktreeId: string | null) => setExistingWorkspace(worktreeId ? { repoId, worktreeId } : null),
    [repoId]
  )
  const submitOptions = useMemo<QuickSubmitOptions>(
    () => ({
      ...(agentDraft?.trim() ? { agentDraft } : {}),
      ...(launchSessionOptions ? { sessionOptions: launchSessionOptions } : {}),
      ...(linkedPluginTask ? { linkedPluginTask } : {})
    }),
    [agentDraft, launchSessionOptions, linkedPluginTask]
  )
  return {
    agentDraft,
    setAgentDraft,
    launchSessionOptions,
    offersExistingWorkspace,
    existingWorktreeId,
    selectExistingWorkspace,
    agentDraftUnavailableReason,
    agentSessionNote: describePluginTaskSessionOptions(initialAgentSessionOptions, quickAgent),
    submitOptions
  }
}
