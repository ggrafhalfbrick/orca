import { create } from 'zustand'
import type { WorkspaceCopyStreamChoice } from '../../../../shared/perforce/workspace-copy/workspace-copy-types'

export type PerforceCopyComposerChoice = { enabled: boolean; stream: WorkspaceCopyStreamChoice }

type PerforceCopyComposerChoiceState = {
  /** Per project for this session; set once the composer knows the project is a Perforce workspace. */
  byRepo: Record<string, PerforceCopyComposerChoice>
  setChoice: (repoId: string, patch: Partial<PerforceCopyComposerChoice>) => void
}

const SAME_STREAM: WorkspaceCopyStreamChoice = { kind: 'same-stream' }

export const usePerforceCopyComposerChoiceStore = create<PerforceCopyComposerChoiceState>()(
  (set) => ({
    byRepo: {},
    setChoice: (repoId, patch) =>
      set((state) => {
        const current: PerforceCopyComposerChoice | undefined = state.byRepo[repoId]
        return {
          byRepo: {
            ...state.byRepo,
            [repoId]: { ...(current ?? { enabled: false, stream: SAME_STREAM }), ...patch }
          }
        }
      })
  })
)

/** The copy to make for a create in `repoId`, or undefined when "Use worktree" is off or not offered. */
export function readPerforceCopyComposerChoice(
  repoId: string
): { stream: WorkspaceCopyStreamChoice } | undefined {
  const choice = usePerforceCopyComposerChoiceStore.getState().byRepo[repoId]
  return choice?.enabled ? { stream: choice.stream } : undefined
}
