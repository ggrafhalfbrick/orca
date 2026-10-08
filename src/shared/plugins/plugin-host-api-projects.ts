import { z } from 'zod'

/**
 * Schemas for the `projects:read` host methods: a plugin lists the user's Orca projects and reads
 * markdown under a folder of one, either as the files on disk or as the latest version on the
 * project's server (Git: the fetched upstream; other kinds register their own readers).
 */

export const PLUGIN_PROJECT_LIST_LIMIT = 500
export const PLUGIN_PROJECT_MARKDOWN_LIST_LIMIT = 20_000
export const PLUGIN_PROJECT_READ_BATCH_LIMIT = 100
export const PLUGIN_PROJECT_FILE_MAX_BYTES = 512 * 1024

/** Forward slashes, no leading slash, drive letter, `.`/`..` segment or NUL; '' is the project root. */
export function isSafeProjectRelativePath(value: string): boolean {
  if (value === '') {
    return true
  }
  if (
    value.includes('\\') ||
    value.includes('\0') ||
    value.startsWith('/') ||
    /^[A-Za-z]:/.test(value)
  ) {
    return false
  }
  return value.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..')
}

const projectIdSchema = z.string().min(1).max(512)
const projectRelativePathSchema = z
  .string()
  .max(4096)
  .refine(isSafeProjectRelativePath, 'must be a project-relative path with forward slashes')
const projectFileVersionSchema = z.string().min(1).max(256)

/** `disk`: the project's files as they are now. `latest`: the newest version on its server. */
export const projectFileSourceSchema = z.enum(['disk', 'latest'])
export type ProjectFileSource = z.infer<typeof projectFileSourceSchema>

export const projectsListParams = z.object({}).strict().optional()
export const pluginProjectSchema = z
  .object({
    id: projectIdSchema,
    name: z.string().max(512),
    /** `git`, `none` for a plain folder, or another kind a latest-version reader adds. */
    sourceControl: z.string().min(1).max(32),
    host: z.enum(['local', 'ssh', 'server'])
  })
  .strict()
export type PluginProject = z.infer<typeof pluginProjectSchema>
export const projectsListResult = z
  .object({ projects: z.array(pluginProjectSchema).max(PLUGIN_PROJECT_LIST_LIMIT) })
  .strict()

export const projectsListMarkdownParams = z
  .object({
    projectId: projectIdSchema,
    /** Folder inside the project; '' lists the whole project. */
    folder: projectRelativePathSchema.default(''),
    source: projectFileSourceSchema
  })
  .strict()
export const projectMarkdownFileSchema = z
  .object({
    /** Relative to the project root. */
    path: projectRelativePathSchema,
    /** Changes whenever the content does (e.g. a Git blob id); null on disk. */
    version: projectFileVersionSchema.nullable()
  })
  .strict()
export type ProjectMarkdownFile = z.infer<typeof projectMarkdownFileSchema>
export const projectsListMarkdownResult = z
  .object({
    /** The revision (e.g. commit) a `latest` listing reflects; null for files on disk. */
    revision: z.string().max(256).nullable(),
    files: z.array(projectMarkdownFileSchema).max(PLUGIN_PROJECT_MARKDOWN_LIST_LIMIT),
    truncated: z.boolean(),
    /** Set when the listing is not what was asked for, e.g. the server was unreachable. */
    notice: z.string().max(1024).optional()
  })
  .strict()
export type ProjectMarkdownListing = z.infer<typeof projectsListMarkdownResult>

export const projectsReadMarkdownParams = z
  .object({
    projectId: projectIdSchema,
    source: projectFileSourceSchema,
    /** `latest` reads need each file's `version` from the listing; `disk` reads ignore it. */
    files: z.array(projectMarkdownFileSchema).min(1).max(PLUGIN_PROJECT_READ_BATCH_LIMIT)
  })
  .strict()
export const projectMarkdownReadSchema = z.union([
  z.object({ path: projectRelativePathSchema, content: z.string() }).strict(),
  z.object({ path: projectRelativePathSchema, error: z.string().max(1024) }).strict()
])
export type ProjectMarkdownRead = z.infer<typeof projectMarkdownReadSchema>
export const projectsReadMarkdownResult = z
  .object({ files: z.array(projectMarkdownReadSchema).max(PLUGIN_PROJECT_READ_BATCH_LIMIT) })
  .strict()
