import { useEffect } from 'react'
import { useAppStore } from '@/store'
import { getRepoExecutionHostId } from '../../../../shared/execution-host'
import { isFolderRepo } from '../../../../shared/repo-kind'
import { runPerforceCopyOperation } from '../../runtime/runtime-perforce-client'
import { perforceProjectTarget } from '@/lib/perforce-workspace-target'

const synced = new Set<string>()

/**
 * Once per session per folder project: marks one inside a Perforce workspace as a Perforce project,
 * then lists its copies so ones made outside Orca in the same layout join the sidebar and deleted
 * ones leave it. The host that owns the project notifies the sidebar on change.
 */
export function usePerforceCopySync(): void {
  const repos = useAppStore((s) => s.repos)
  useEffect(() => {
    for (const repo of repos) {
      const hostId = getRepoExecutionHostId(repo)
      const key = `${hostId}|${repo.id}|${repo.path}`
      if (!isFolderRepo(repo) || synced.has(key)) {
        continue
      }
      synced.add(key)
      const target = perforceProjectTarget(repo.id, hostId)
      void runPerforceCopyOperation(target, 'detectProject', {})
        .then((detected) =>
          detected.ok && detected.value ? runPerforceCopyOperation(target, 'syncCopies', {}) : null
        )
        // Why: a folder that is not a Perforce workspace, or an unreachable server, is not an error here.
        .catch(() => synced.delete(key))
    }
  }, [repos])
}
