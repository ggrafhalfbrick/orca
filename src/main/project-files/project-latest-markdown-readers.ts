import { gitLatestMarkdownReader } from './git-latest-markdown'
import { perforceLatestMarkdownReader } from './perforce-latest-markdown'
import type { ProjectLatestMarkdownReader } from './project-latest-markdown'

/** One reader per kind of source control; the first that handles a project reads it. */
export const PROJECT_LATEST_MARKDOWN_READERS: readonly ProjectLatestMarkdownReader[] = [
  gitLatestMarkdownReader,
  perforceLatestMarkdownReader
]
