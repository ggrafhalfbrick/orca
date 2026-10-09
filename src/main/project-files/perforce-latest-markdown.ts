import { getRepoExecutionHostId } from '../../shared/execution-host'
import {
  isSafeProjectRelativePath,
  type ProjectMarkdownFile,
  type ProjectMarkdownRead
} from '../../shared/plugins/plugin-host-api-projects'
import { isPerforceRepo } from '../../shared/repo-kind'
import type { Repo } from '../../shared/repo-types'
import { perforceBackendForHost } from '../runtime/runtime-perforce-commands'
import { isListedMarkdownPath, type ProjectLatestMarkdownReader } from './project-latest-markdown'

/** Each project's last listing: listed path to depot file, since `printDepotFiles` takes depot paths. */
const lastListedDepotFiles = new Map<string, Map<string, string>>()

function listingKey(repo: Repo): string {
  return `${getRepoExecutionHostId(repo)}|${repo.id}`
}

/** Perforce: head revisions from the server, read with `p4 print`; a file's version is its revision. */
export const perforceLatestMarkdownReader: ProjectLatestMarkdownReader = {
  sourceControl: 'perforce',
  handles: (repo) => isPerforceRepo(repo),
  async list(repo, folder) {
    const backend = perforceBackendForHost(getRepoExecutionHostId(repo))
    const latest = await backend.latestMarkdownFiles(repo.path, folder)
    const depotFiles = new Map<string, string>()
    const files: ProjectMarkdownFile[] = []
    let newestChange = 0
    // Paths come from where the client view puts each file, so components under the folder count.
    for (const { path, ...file } of latest.files) {
      if (!isSafeProjectRelativePath(path) || !isListedMarkdownPath(path)) {
        continue
      }
      depotFiles.set(path, file.depotFile)
      files.push({ path, version: String(file.rev) })
      newestChange = Math.max(newestChange, file.change)
    }
    lastListedDepotFiles.set(listingKey(repo), depotFiles)
    return {
      revision: newestChange > 0 ? String(newestChange) : null,
      files,
      truncated: latest.truncated
    }
  },
  async read(repo, files) {
    const depotFiles = lastListedDepotFiles.get(listingKey(repo))
    const wanted = files.flatMap((file) => {
      const depotFile = depotFiles?.get(file.path)
      const rev = Number(file.version)
      return depotFile && Number.isInteger(rev) && rev > 0
        ? [{ path: file.path, depotFile, rev }]
        : []
    })
    const printed =
      wanted.length > 0
        ? await perforceBackendForHost(getRepoExecutionHostId(repo)).printDepotFiles(
            repo.path,
            wanted.map(({ depotFile, rev }) => ({ depotFile, rev }))
          )
        : []
    const byPath = new Map<string, ProjectMarkdownRead>()
    wanted.forEach((file, index) => {
      const result = printed[index]
      byPath.set(
        file.path,
        result && 'content' in result
          ? { path: file.path, content: result.content }
          : { path: file.path, error: result?.error ?? 'p4 print returned nothing' }
      )
    })
    return files.map(
      (file) =>
        byPath.get(file.path) ?? {
          path: file.path,
          error: 'needs the version from the latest listing'
        }
    )
  }
}
