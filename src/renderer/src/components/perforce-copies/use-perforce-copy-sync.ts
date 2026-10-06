import { useEffect } from 'react'
import { useAppStore } from '@/store'
import { isFolderRepo } from '../../../../shared/repo-kind'

const synced = new Set<string>()

/**
 * Once per session per Perforce folder project: lists its copies so ones made outside Orca (the
 * p4-worktree tool) join the sidebar and deleted ones leave it. Main notifies the sidebar on change.
 */
export function usePerforceCopySync(): void {
  const repos = useAppStore((s) => s.repos)
  useEffect(() => {
    for (const repo of repos) {
      const key = `${repo.id}|${repo.path}`
      if (!isFolderRepo(repo) || synced.has(key)) {
        continue
      }
      synced.add(key)
      void window.api.perforce
        .detect({ worktreePath: repo.path, connectionId: repo.connectionId ?? undefined })
        .then((detected) =>
          detected.isWorkspace ? window.api.perforce.syncCopies({ repoId: repo.id }) : null
        )
        // Why: a folder that is not a Perforce workspace, or an unreachable server, is not an error here.
        .catch(() => synced.delete(key))
    }
  }, [repos])
}
