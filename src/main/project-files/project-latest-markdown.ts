import type {
  ProjectMarkdownFile,
  ProjectMarkdownListing,
  ProjectMarkdownRead
} from '../../shared/plugins/plugin-host-api-projects'
import type { Repo } from '../../shared/repo-types'

/**
 * Reads a project's markdown at the newest version on its server, for one kind of source control.
 * Each kind (Git here; others register beside it) owns how it reaches the server on the project's
 * host; callers only pick the reader that handles the project.
 */
export type ProjectLatestMarkdownReader = {
  /** Reported to plugins as the project's `sourceControl`, e.g. `git`. */
  sourceControl: string
  handles(repo: Repo): boolean
  list(repo: Repo, folder: string, signal?: AbortSignal): Promise<ProjectMarkdownListing>
  read(
    repo: Repo,
    files: readonly ProjectMarkdownFile[],
    signal?: AbortSignal
  ): Promise<ProjectMarkdownRead[]>
}

const MARKDOWN_EXTENSION = /\.(?:md|mdx|markdown)$/i

/** Same rule as the on-disk listing: markdown, skipping dot-folders (but not .github) and node_modules. */
export function isListedMarkdownPath(path: string): boolean {
  const segments = path.split('/')
  const folders = segments.slice(0, -1)
  return (
    MARKDOWN_EXTENSION.test(path) &&
    folders.every(
      (segment) => segment === '.github' || (!segment.startsWith('.') && segment !== 'node_modules')
    )
  )
}

/** True when `path` is `folder` itself or inside it; '' is the project root. */
export function isInProjectFolder(path: string, folder: string): boolean {
  return folder === '' || path === folder || path.startsWith(`${folder}/`)
}
