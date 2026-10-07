import { create } from 'zustand'
import { useAppStore } from '@/store'
import { findRepoForHost } from '@/store/slices/repo-host-identity'
import type { ExecutionHostId } from '../../../../shared/execution-host'
import { isPerforceRepo } from '../../../../shared/repo-kind'
import type { WorkspaceCopyStreamChoice } from '../../../../shared/perforce/workspace-copy/workspace-copy-types'

/** A Perforce project's create choice: the stream to branch from, and whether a copy can be made here. */
export type PerforceCopyComposerChoice = { stream: WorkspaceCopyStreamChoice; ready: boolean }

type PerforceCopyComposerChoiceState = {
  /** Per Perforce project on its host, for this session; set once the composer shows that project. */
  byRepo: Record<string, PerforceCopyComposerChoice>
  setChoice: (key: string, patch: Partial<PerforceCopyComposerChoice>) => void
}

/** Keys a project's choice by its host too: one project id can be registered on several hosts. */
export function perforceCopyChoiceKey(repoId: string, hostId: string | null | undefined): string {
  return `${hostId ?? ''}|${repoId}`
}

export const usePerforceCopyComposerChoiceStore = create<PerforceCopyComposerChoiceState>()(
  (set) => ({
    byRepo: {},
    setChoice: (key, patch) =>
      set((state) => {
        const current: PerforceCopyComposerChoice | undefined = state.byRepo[key]
        return {
          byRepo: {
            ...state.byRepo,
            [key]: { ...(current ?? { stream: { kind: 'child' }, ready: true }), ...patch }
          }
        }
      })
  })
)

/**
 * The copy to make for a create in `repoId`: a Perforce project's workspaces are copies, as Git
 * projects' are worktrees. Undefined for other projects, and when the drive cannot hold a copy (the
 * workspace then shares the project folder, which the composer says).
 */
export function readPerforceCopyComposerChoice(
  repoId: string,
  hostId?: ExecutionHostId | null
): { stream: WorkspaceCopyStreamChoice } | undefined {
  const state = useAppStore.getState()
  const repo = findRepoForHost(state.repos, repoId, { hostId, settings: state.settings })
  if (!repo || !isPerforceRepo(repo)) {
    return undefined
  }
  // Why a default: a create submitted before the readiness check answers is still a copy.
  const choice =
    usePerforceCopyComposerChoiceStore.getState().byRepo[perforceCopyChoiceKey(repoId, hostId)]
  if (!choice) {
    return { stream: { kind: 'child' } }
  }
  return choice.ready ? { stream: choice.stream } : undefined
}
