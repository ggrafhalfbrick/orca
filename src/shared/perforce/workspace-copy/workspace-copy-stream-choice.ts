import { WorkspaceCopyError } from './workspace-copy-errors'
import type { WorkspaceCopyHost } from './workspace-copy-host'
import type { WorkspaceCopyNames } from './workspace-copy-names'
import { findStream } from './workspace-copy-p4'
import type { CopySource } from './workspace-copy-source'
import { syncedChange } from './workspace-copy-specs'
import type { WorkspaceCopyMode, WorkspaceCopyStreamChoice } from './workspace-copy-types'

export type ResolvedStreamChoice = {
  stream: string
  mode: WorkspaceCopyMode
  /** Why this stream, in words for the user. */
  reason: string
  createStream: boolean
  pinnedChange: number | null
  /** The copy holds the source's files but sits on another stream: fetch only what differs. */
  align: boolean
}

/** Which stream the copy goes on, most specific first. */
export async function resolveStreamChoice(
  host: WorkspaceCopyHost,
  source: CopySource,
  names: WorkspaceCopyNames,
  choice: WorkspaceCopyStreamChoice
): Promise<ResolvedStreamChoice> {
  const same: ResolvedStreamChoice = {
    stream: source.stream,
    mode: 'same-stream',
    reason: "the workspace's own stream",
    createStream: false,
    pinnedChange: null,
    align: false
  }
  if (choice.kind === 'stream') {
    const stream = choice.stream.replace(/\/+$/, '')
    if (stream.toLowerCase() === source.stream.toLowerCase()) {
      return same
    }
    if (!(await findStream(host, stream, source.root))) {
      throw new WorkspaceCopyError('refused', `Stream ${stream} does not exist.`)
    }
    return {
      ...same,
      stream,
      mode: 'other-stream',
      reason: 'the stream you picked',
      align: true
    }
  }
  // An earlier copy of this name kept its own stream because it has submitted work; continue there.
  if (names.childStream && (await findStream(host, names.childStream, source.root))) {
    return {
      ...same,
      stream: names.childStream,
      mode: 'child',
      reason: `the earlier copy's own stream ${names.childStream}, so its submitted work continues`,
      align: true
    }
  }
  if (choice.kind === 'child' && names.childStream) {
    const pinnedChange = await syncedChange(host, source)
    return {
      ...same,
      stream: names.childStream,
      mode: 'child',
      reason: `a new stream of its own, pinned at change ${pinnedChange}`,
      createStream: true,
      pinnedChange
    }
  }
  return same
}
