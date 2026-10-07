import { useMemo } from 'react'
import { useAppStore } from '@/store'
import { getRuntimeEnvironmentIdForWorktree } from '@/lib/worktree-runtime-owner'
import { settingsForRepoOwner } from '@/store/slices/worktrees/listing/worktree-owner-settings'
import { findRepoForHost } from '@/store/slices/repo-host-identity'
import type { ExecutionHostId } from '../../../shared/execution-host'
import { isFolderRepo, isPerforceRepo } from '../../../shared/repo-kind'
import { getRepoIdFromWorktreeId } from '../../../shared/worktree/id'
import type { RuntimeGitContext } from '../runtime/runtime-git-client-context'
import { isKnownPerforceWorkspace } from './perforce-workspace-detection'
import type { GlobalSettings } from '../../../shared/global-settings-types'
import type {
  PerforceProjectTarget,
  PerforceWorkspaceTarget
} from '../runtime/runtime-perforce-client'

/** What a Perforce request carries from Settings: Perforce's own, and the agent choices descriptions use. */
type PerforceTargetSettings = Partial<
  Pick<GlobalSettings, 'perforce' | 'agentCmdOverrides' | 'defaultTuiAgent'>
>

function buildTarget(
  worktreeId: string,
  worktreePath: string,
  connectionId: string | null | undefined,
  environmentId: string | null,
  settings: PerforceTargetSettings
): PerforceWorkspaceTarget {
  return {
    settings: { ...settings, activeRuntimeEnvironmentId: environmentId },
    worktreeId,
    worktreePath,
    ...(connectionId ? { connectionId } : {})
  }
}

/** The Perforce target of workspace `worktreeId`, routed to the host that owns it (read now). */
export function perforceTargetForWorktree(
  worktreeId: string,
  worktreePath: string,
  connectionId: string | null | undefined
): PerforceWorkspaceTarget {
  const state = useAppStore.getState()
  return buildTarget(
    worktreeId,
    worktreePath,
    connectionId,
    getRuntimeEnvironmentIdForWorktree(state, worktreeId),
    {
      perforce: state.settings?.perforce,
      agentCmdOverrides: state.settings?.agentCmdOverrides,
      defaultTuiAgent: state.settings?.defaultTuiAgent
    }
  )
}

/** Same as `perforceTargetForWorktree`, kept stable across renders while its inputs are. */
export function usePerforceWorkspaceTarget(
  worktreeId: string | null | undefined,
  worktreePath: string | null | undefined,
  connectionId: string | null | undefined
): PerforceWorkspaceTarget | null {
  const environmentId = useAppStore((s) => getRuntimeEnvironmentIdForWorktree(s, worktreeId))
  const perforce = useAppStore((s) => s.settings?.perforce)
  const agentCmdOverrides = useAppStore((s) => s.settings?.agentCmdOverrides)
  const defaultTuiAgent = useAppStore((s) => s.settings?.defaultTuiAgent)
  return useMemo(
    () =>
      worktreeId && worktreePath
        ? buildTarget(worktreeId, worktreePath, connectionId, environmentId, {
            perforce,
            agentCmdOverrides,
            defaultTuiAgent
          })
        : null,
    [
      worktreeId,
      worktreePath,
      connectionId,
      environmentId,
      perforce,
      agentCmdOverrides,
      defaultTuiAgent
    ]
  )
}

/** The Perforce folder project `repoId` (on `hostId` when ids repeat across hosts), routed to its owner. */
export function perforceProjectTarget(
  repoId: string,
  hostId?: ExecutionHostId | null
): PerforceProjectTarget {
  return { settings: settingsForRepoOwner(useAppStore.getState(), repoId, hostId), repoId }
}

/**
 * The Perforce target for a file operation in `context`'s workspace, routed like `context`; null when
 * that workspace belongs to no Perforce project and was not detected as one this session.
 */
export function perforceTargetForFileContext(
  context: RuntimeGitContext
): PerforceWorkspaceTarget | null {
  const { worktreeId } = context
  if (!worktreeId) {
    return null
  }
  const state = useAppStore.getState()
  const target = buildTarget(
    worktreeId,
    context.worktreePath,
    context.connectionId,
    context.settings?.activeRuntimeEnvironmentId ?? null,
    {
      perforce: state.settings?.perforce,
      agentCmdOverrides: state.settings?.agentCmdOverrides,
      defaultTuiAgent: state.settings?.defaultTuiAgent
    }
  )
  const worktree = state.getKnownWorktreeById(worktreeId)
  const repo = findRepoForHost(
    state.repos,
    worktree?.repoId ?? getRepoIdFromWorktreeId(worktreeId),
    { hostId: worktree?.hostId, settings: state.settings }
  )
  const perforceProject = Boolean(repo && isFolderRepo(repo) && isPerforceRepo(repo))
  return perforceProject || isKnownPerforceWorkspace(target) ? target : null
}
