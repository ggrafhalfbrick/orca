import { formatP4Spec, parseP4Spec } from './p4-spec'
import { WorkspaceCopyError } from './workspace-copy-errors'
import type { WorkspaceCopyHost } from './workspace-copy-host'
import type { WorkspaceCopyNames } from './workspace-copy-names'
import { findClient, p4OrThrow, p4Tagged } from './workspace-copy-p4'
import type { CopySource } from './workspace-copy-source'

/**
 * The highest change in the have-list, required to be the whole state (a sync to it changes
 * nothing): a child stream is pinned there, so anything partial would disagree with its stream.
 */
export async function syncedChange(host: WorkspaceCopyHost, source: CopySource): Promise<number> {
  const records = await p4Tagged(
    host,
    ['-c', source.client, 'changes', '-m1', `//${source.client}/...#have`],
    source.root
  )
  const change = Number(records.find((record) => record.change)?.change)
  if (!Number.isInteger(change) || change <= 0) {
    throw new WorkspaceCopyError('refused', 'The workspace has no synced files.')
  }
  const preview = await p4Tagged(
    host,
    ['-c', source.client, 'sync', '-n', `//${source.client}/...@${change}`],
    source.root
  )
  const differ = preview.filter((record) => record.depotFile).length
  if (differ > 0) {
    throw new WorkspaceCopyError(
      'refused',
      `The workspace is not synced to a single changelist: ${differ} file(s) differ from change ${change}. Get latest, then retry.`
    )
  }
  return change
}

/** A sparsedev stream under the source's stream, pinned at `change`. Needs a 2024.1+ server. */
export async function createChildStream(
  host: WorkspaceCopyHost,
  source: CopySource,
  stream: string,
  change: number
): Promise<void> {
  const template = await p4OrThrow(
    host,
    ['stream', '-o', '-t', 'sparsedev', '-P', source.stream, stream],
    source.root
  )
  const spec = parseP4Spec(template)
  const paths = spec.get('Paths')
  if (!paths) {
    throw new WorkspaceCopyError(
      'perforce',
      'The sparse stream template has no Paths field; this server does not support sparse streams (2024.1 or later).'
    )
  }
  spec.set(
    'Paths',
    paths.map((path) => {
      if (/@\d+\s*$/.test(path)) {
        return path.replace(/@\d+\s*$/, `@${change}`)
      }
      return /^\s*share\s/.test(path) ? `${path.trimEnd()} @${change}` : path
    })
  )
  spec.set('Description', [
    `Orca workspace copy stream for ${source.client}, pinned at change ${change}.`
  ])
  spec.delete('Update')
  spec.delete('Access')
  await p4OrThrow(host, ['stream', '-i'], source.root, formatP4Spec(spec))
}

/** The copy's client: the source's options on `stream`, rooted at the copy. */
export async function createCopyClient(
  host: WorkspaceCopyHost,
  source: CopySource,
  names: WorkspaceCopyNames,
  stream: string
): Promise<void> {
  const spec = parseP4Spec(await p4OrThrow(host, ['client', '-o', source.client], source.root))
  // The View names the source client on its right-hand side; a stream client regenerates it on save.
  for (const field of ['Update', 'Access', 'View', 'AltRoots', 'StreamAtChange']) {
    spec.delete(field)
  }
  spec.set('Client', [names.client])
  spec.set('Root', [names.copyRoot])
  spec.set('Stream', [stream])
  spec.set('Description', [`Orca workspace copy of ${source.client}.`])
  await p4OrThrow(host, ['client', '-i'], source.root, formatP4Spec(spec))
  if (!(await findClient(host, names.client, source.root))) {
    throw new WorkspaceCopyError(
      'perforce',
      `p4 client -i reported success but ${names.client} does not exist.`
    )
  }
}
