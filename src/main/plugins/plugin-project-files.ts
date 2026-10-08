import { getRepoExecutionHostId } from '../../shared/execution-host'
import type { MarkdownDocument } from '../../shared/filesystem-entry-types'
import {
  PLUGIN_PROJECT_LIST_LIMIT,
  PLUGIN_PROJECT_MARKDOWN_LIST_LIMIT,
  type PluginProject,
  type ProjectFileSource,
  type ProjectMarkdownFile,
  type ProjectMarkdownListing,
  type ProjectMarkdownRead
} from '../../shared/plugins/plugin-host-api-projects'
import type { Repo } from '../../shared/repo-types'
import { getRepoMainWorktreeId } from '../../shared/worktree/id'
import {
  isInProjectFolder,
  type ProjectLatestMarkdownReader
} from '../project-files/project-latest-markdown'
import { PROJECT_LATEST_MARKDOWN_READERS } from '../project-files/project-latest-markdown-readers'

/** Runtime services the `projects:read` methods reuse; they route local, WSL and SSH files. */
export type PluginProjectFilesDelegate = {
  listRepos(): Repo[]
  listRuntimeMarkdownDocuments(worktreeSelector: string): Promise<MarkdownDocument[]>
  readMobileFile(
    worktreeSelector: string,
    relativePath: string
  ): Promise<{ content: string; truncated: boolean }>
}

export type PluginProjectFiles = {
  list(): Promise<PluginProject[]>
  listMarkdown(input: {
    projectId: string
    folder: string
    source: ProjectFileSource
  }): Promise<ProjectMarkdownListing>
  readMarkdown(input: {
    projectId: string
    source: ProjectFileSource
    files: ProjectMarkdownFile[]
  }): Promise<ProjectMarkdownRead[]>
}

function hostKind(repo: Repo): PluginProject['host'] {
  const hostId = getRepoExecutionHostId(repo)
  return hostId.startsWith('ssh:') ? 'ssh' : hostId.startsWith('runtime:') ? 'server' : 'local'
}

function errorMessage(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 1024)
}

export function createPluginProjectFiles(
  delegate: PluginProjectFilesDelegate,
  readers: readonly ProjectLatestMarkdownReader[] = PROJECT_LATEST_MARKDOWN_READERS
): PluginProjectFiles {
  const latestReader = (repo: Repo): ProjectLatestMarkdownReader | null =>
    readers.find((reader) => reader.handles(repo)) ?? null
  const findRepo = (projectId: string): Repo => {
    const repo = delegate.listRepos().find((candidate) => candidate.id === projectId)
    if (!repo) {
      throw new Error(`no Orca project with id ${projectId}`)
    }
    // Why: an Orca server runs its own Git and files; this client's routes would read the wrong host.
    if (hostKind(repo) === 'server') {
      throw new Error("Reading files of projects on an Orca server isn't supported yet.")
    }
    return repo
  }
  const diskSelector = (repo: Repo): string => `id:${getRepoMainWorktreeId(repo)}`

  return {
    list: async () =>
      delegate
        .listRepos()
        .slice(0, PLUGIN_PROJECT_LIST_LIMIT)
        .map((repo) => ({
          id: repo.id,
          name: (repo.displayName || repo.path).slice(0, 512),
          sourceControl: latestReader(repo)?.sourceControl ?? 'none',
          host: hostKind(repo)
        })),
    listMarkdown: async ({ projectId, folder, source }) => {
      const repo = findRepo(projectId)
      const reader = source === 'latest' ? latestReader(repo) : null
      if (reader) {
        return reader.list(repo, folder)
      }
      const documents = await delegate.listRuntimeMarkdownDocuments(diskSelector(repo))
      const paths = documents
        .map((document) => document.relativePath.replaceAll('\\', '/'))
        .filter((path) => isInProjectFolder(path, folder))
      return {
        revision: null,
        files: paths
          .slice(0, PLUGIN_PROJECT_MARKDOWN_LIST_LIMIT)
          .map((path) => ({ path, version: null })),
        truncated: documents.length >= PLUGIN_PROJECT_MARKDOWN_LIST_LIMIT,
        ...(source === 'latest'
          ? { notice: 'This project has no server to read from, so these are the files on disk.' }
          : {})
      }
    },
    readMarkdown: async ({ projectId, source, files }) => {
      const repo = findRepo(projectId)
      const reader = source === 'latest' ? latestReader(repo) : null
      if (reader) {
        return reader.read(repo, files)
      }
      const selector = diskSelector(repo)
      const results: ProjectMarkdownRead[] = []
      for (const file of files) {
        try {
          const read = await delegate.readMobileFile(selector, file.path)
          results.push(
            read.truncated
              ? { path: file.path, error: 'file is larger than 512 KB' }
              : { path: file.path, content: read.content }
          )
        } catch (error) {
          results.push({ path: file.path, error: errorMessage(error) })
        }
      }
      return results
    }
  }
}
