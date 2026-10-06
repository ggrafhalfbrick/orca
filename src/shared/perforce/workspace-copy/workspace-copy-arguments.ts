import { requireRelativePath } from '../perforce-arguments'
import { COPY_NAME_PATTERN } from './workspace-copy-name-rules'
import type {
  WorkspaceCopyCreateOptions,
  WorkspaceCopyRemovalOptions,
  WorkspaceCopyStreamChoice
} from './workspace-copy-types'

// Validation for copy requests arriving over IPC or the SSH relay; the engine trusts its arguments.

export function requireCopyName(value: unknown): string {
  if (typeof value !== 'string' || !COPY_NAME_PATTERN.test(value)) {
    throw new Error('Copy names are 1-24 letters, digits or hyphens.')
  }
  return value
}

function requireStreamChoice(value: unknown): WorkspaceCopyStreamChoice {
  if (value === undefined) {
    return { kind: 'same-stream' }
  }
  if (typeof value !== 'object' || value === null || !('kind' in value)) {
    throw new Error('Invalid stream choice')
  }
  if (value.kind === 'same-stream' || value.kind === 'child') {
    return { kind: value.kind }
  }
  const stream = 'stream' in value ? value.stream : undefined
  if (value.kind === 'stream' && typeof stream === 'string' && /^\/\/[^\s@#*%]+$/.test(stream)) {
    return { kind: 'stream', stream }
  }
  throw new Error('Invalid stream choice')
}

function optionalBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

export function requireCreateOptions(value: unknown): WorkspaceCopyCreateOptions {
  if (typeof value !== 'object' || value === null) {
    throw new Error('Invalid copy options')
  }
  const raw: Record<string, unknown> = { ...value }
  const folders = Array.isArray(raw.extraExcludedFolders) ? raw.extraExcludedFolders : []
  const minFree = raw.minFreeBytes
  return {
    name: requireCopyName(raw.name),
    stream: requireStreamChoice(raw.stream),
    skipPackageCache: optionalBoolean(raw.skipPackageCache),
    extraExcludedFolders: folders.map(requireRelativePath),
    ...(typeof minFree === 'number' && Number.isFinite(minFree) && minFree >= 0
      ? { minFreeBytes: minFree }
      : {})
  }
}

export function requireRemovalOptions(value: unknown): WorkspaceCopyRemovalOptions {
  if (typeof value !== 'object' || value === null) {
    return {}
  }
  const raw: Record<string, unknown> = { ...value }
  return {
    revertOpenFiles: optionalBoolean(raw.revertOpenFiles),
    deleteShelves: optionalBoolean(raw.deleteShelves)
  }
}
