import { create } from 'zustand'
import { useAppStore } from '@/store'
import { isPerforceRepo } from '../../../../shared/repo-kind'
import type { WorkspaceCopyStreamChoice } from '../../../../shared/perforce/workspace-copy/workspace-copy-types'

/** A Perforce project's create choice: the stream to branch from, and whether a copy can be made here. */
export type PerforceCopyComposerChoice = { stream: WorkspaceCopyStreamChoice; ready: boolean }

type PerforceCopyComposerChoiceState = {
  /** Per Perforce project for this session; set once the composer shows that project. */
  byRepo: Record<string, PerforceCopyComposerChoice>
  setChoice: (repoId: string, patch: Partial<PerforceCopyComposerChoice>) => void
}

export const usePerforceCopyComposerChoiceStore = create<PerforceCopyComposerChoiceState>()(
  (set) => ({
    byRepo: {},
    setChoice: (repoId, patch) =>
      set((state) => {
        const current: PerforceCopyComposerChoice | undefined = state.byRepo[repoId]
        return {
          byRepo: {
            ...state.byRepo,
            [repoId]: { ...(current ?? { stream: { kind: 'child' }, ready: true }), ...patch }
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
  repoId: string
): { stream: WorkspaceCopyStreamChoice } | undefined {
  const repo = useAppStore.getState().repos.find((candidate) => candidate.id === repoId)
  if (!repo || !isPerforceRepo(repo)) {
    return undefined
  }
  // Why a default: a create submitted before the readiness check answers is still a copy.
  const choice = usePerforceCopyComposerChoiceStore.getState().byRepo[repoId]
  if (!choice) {
    return { stream: { kind: 'child' } }
  }
  return choice.ready ? { stream: choice.stream } : undefined
}
