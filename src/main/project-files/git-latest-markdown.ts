import { getRepoExecutionHostId } from '../../shared/execution-host'
import {
  PLUGIN_PROJECT_FILE_MAX_BYTES,
  PLUGIN_PROJECT_MARKDOWN_LIST_LIMIT,
  type ProjectMarkdownFile,
  type ProjectMarkdownRead
} from '../../shared/plugins/plugin-host-api-projects'
import { isGitRepoKind } from '../../shared/repo-kind'
import type { Repo } from '../../shared/repo-types'
import { gitReadOptionsForWorktree } from '../git/git-runtime-options'
import { gitFetch } from '../git/remote'
import { gitExecFileAsync } from '../git/runner'
import {
  ExecutionHostNotDispatchableError,
  resolveGitRouteForHost
} from '../providers/execution-host-provider-dispatch'
import { SSH_GIT_PROVIDER_UNAVAILABLE_MESSAGE } from '../providers/ssh-git-dispatch'
import {
  isInProjectFolder,
  isListedMarkdownPath,
  type ProjectLatestMarkdownReader
} from './project-latest-markdown'

const FETCH_INTERVAL_MS = 60_000
const LS_TREE_MAX_BUFFER = 32 * 1024 * 1024
const OBJECT_ID_PATTERN = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/

type GitAccess = {
  fetch(signal?: AbortSignal): Promise<void>
  run(args: string[], signal?: AbortSignal): Promise<string>
}

/** Git for the project's own host: this machine (WSL included) or its SSH relay. */
function gitAccessFor(repo: Repo): GitAccess {
  const route = resolveGitRouteForHost(getRepoExecutionHostId(repo))
  if (route.kind === 'runtime') {
    throw new ExecutionHostNotDispatchableError(route.hostId)
  }
  if (route.kind === 'ssh') {
    const provider = route.provider
    if (!provider) {
      throw new Error(SSH_GIT_PROVIDER_UNAVAILABLE_MESSAGE)
    }
    return {
      fetch: () => provider.fetchRemote(repo.path),
      run: async (args, signal) => (await provider.exec(args, repo.path, { signal })).stdout
    }
  }
  return {
    fetch: (signal) => gitFetch(repo.path, undefined, { signal }),
    run: async (args, signal) =>
      (
        await gitExecFileAsync(args, {
          ...gitReadOptionsForWorktree(repo.path, { signal }),
          maxBuffer: LS_TREE_MAX_BUFFER
        })
      ).stdout
  }
}

const lastFetchAt = new Map<string, number>()

/** Fetches at most once a minute per project; returns why it could not, if it could not. */
async function fetchRecently(repo: Repo, git: GitAccess, signal?: AbortSignal): Promise<string> {
  const key = `${getRepoExecutionHostId(repo)}|${repo.id}`
  const last = lastFetchAt.get(key)
  if (last !== undefined && Date.now() - last < FETCH_INTERVAL_MS) {
    return ''
  }
  try {
    await git.fetch(signal)
    lastFetchAt.set(key, Date.now())
    return ''
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
}

/** The branch's upstream, else the remote's default branch. */
async function resolveUpstreamRef(git: GitAccess, signal?: AbortSignal): Promise<string> {
  const attempts = [
    ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'],
    ['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD']
  ]
  for (const args of attempts) {
    const ref = await git.run(args, signal).then(
      (stdout) => stdout.trim(),
      () => ''
    )
    if (ref) {
      return ref
    }
  }
  throw new Error("This project's branch has no upstream to read the latest version from.")
}

/** Parses `ls-tree -r -z --long` output into markdown files under `folder`. */
export function parseLsTreeMarkdown(
  stdout: string,
  folder: string
): { files: ProjectMarkdownFile[]; truncated: boolean } {
  const files: ProjectMarkdownFile[] = []
  for (const entry of stdout.split('\0')) {
    const tab = entry.indexOf('\t')
    const [, type, objectId] = entry.slice(0, tab).split(/\s+/)
    const path = entry.slice(tab + 1)
    if (
      tab > 0 &&
      type === 'blob' &&
      OBJECT_ID_PATTERN.test(objectId ?? '') &&
      isInProjectFolder(path, folder) &&
      isListedMarkdownPath(path)
    ) {
      if (files.length === PLUGIN_PROJECT_MARKDOWN_LIST_LIMIT) {
        return { files, truncated: true }
      }
      files.push({ path, version: objectId })
    }
  }
  return { files, truncated: false }
}

/** Git: fetch, then read the upstream branch's blobs; a file's version is its blob id. */
export const gitLatestMarkdownReader: ProjectLatestMarkdownReader = {
  sourceControl: 'git',
  handles: (repo) => isGitRepoKind(repo),
  async list(repo, folder, signal) {
    const git = gitAccessFor(repo)
    const fetchError = await fetchRecently(repo, git, signal)
    const ref = await resolveUpstreamRef(git, signal)
    const revision = (await git.run(['rev-parse', '--verify', `${ref}^{commit}`], signal)).trim()
    const stdout = await git.run(
      ['ls-tree', '-r', '-z', '--long', '--full-tree', revision, ...(folder ? ['--', folder] : [])],
      signal
    )
    return {
      revision,
      ...parseLsTreeMarkdown(stdout, folder),
      ...(fetchError
        ? {
            notice: `Could not fetch, so this is ${ref} as last fetched: ${fetchError}`.slice(
              0,
              1024
            )
          }
        : {})
    }
  },
  async read(repo, files, signal) {
    const git = gitAccessFor(repo)
    const results: ProjectMarkdownRead[] = []
    for (const file of files) {
      if (!file.version || !OBJECT_ID_PATTERN.test(file.version)) {
        results.push({ path: file.path, error: 'needs the version from the latest listing' })
        continue
      }
      try {
        const content = await git.run(['cat-file', 'blob', file.version], signal)
        results.push(
          Buffer.byteLength(content) > PLUGIN_PROJECT_FILE_MAX_BYTES
            ? { path: file.path, error: 'file is larger than 512 KB' }
            : { path: file.path, content }
        )
      } catch (error) {
        results.push({
          path: file.path,
          error: (error instanceof Error ? error.message : String(error)).slice(0, 1024)
        })
      }
    }
    return results
  }
}
