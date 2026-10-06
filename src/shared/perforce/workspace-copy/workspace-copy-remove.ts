import { randomBytes } from 'node:crypto'
import { rename, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { WorkspaceCopyError } from './workspace-copy-errors'
import type { WorkspaceCopyHost } from './workspace-copy-host'
import { withSourceLock } from './workspace-copy-lock'
import { assertCopyName } from './workspace-copy-names'
import { p4OrThrow } from './workspace-copy-p4'
import { processesUnder } from './workspace-copy-processes'
import { planWorkspaceCopyRemoval, type RemovalPlan } from './workspace-copy-removal-preview'
import { resolveCopySource } from './workspace-copy-source'
import type {
  WorkspaceCopyRemovalOptions,
  WorkspaceCopyRemovalPreview,
  WorkspaceCopyRemovalResult
} from './workspace-copy-types'

export const REMOVING_PREFIX = '.removing-'

/** Why removal would refuse with these options, or null; callers check it before tearing anything down. */
export function copyRemovalRefusal(
  plan: WorkspaceCopyRemovalPreview,
  options: WorkspaceCopyRemovalOptions
): string | null {
  if (plan.blockers.openFiles && !options.revertOpenFiles) {
    return `${plan.openFiles.count} file(s) are open in ${plan.client}. Shelve or revert them first, or choose to revert them (their edits in the copy are lost).`
  }
  if (plan.blockers.shelves && !options.deleteShelves) {
    const shelved = plan.pendingChanges.filter((c) => c.shelvedFiles > 0).map((c) => c.change)
    return `Changelist(s) ${shelved.join(', ')} in ${plan.client} hold shelved files. Unshelve what you need, then choose to delete the shelves.`
  }
  return null
}

/**
 * Moves the folder aside first: Windows refuses to rename a folder a program has files open in, so a
 * held copy is refused before Perforce is touched, and a Perforce failure can put the folder back.
 */
async function moveFolderAside(host: WorkspaceCopyHost, plan: RemovalPlan): Promise<string | null> {
  if (!plan.folderExists) {
    return null
  }
  const aside = join(
    plan.names.copiesDir,
    `${REMOVING_PREFIX}${plan.name}-${randomBytes(4).toString('hex')}`
  )
  try {
    await rename(plan.copyRoot, aside)
    return aside
  } catch (error) {
    const holders = await processesUnder(host, plan.copyRoot)
    const named = holders.length > 0 ? ` Still open in: ${holders.join(', ')}.` : ''
    const code = error instanceof Error && 'code' in error ? String(error.code) : ''
    throw new WorkspaceCopyError(
      'refused',
      `Windows would not move ${plan.copyRoot} (${code || 'in use'}); a program has files open in it.${named} Close it and try again. Nothing was changed.`
    )
  }
}

async function cleanUpPerforce(
  host: WorkspaceCopyHost,
  plan: RemovalPlan,
  options: WorkspaceCopyRemovalOptions
): Promise<{ deletedChanges: number[]; deletedShelves: number[] }> {
  const { client } = plan
  const cwd = plan.source.root
  const deletedChanges: number[] = []
  const deletedShelves: number[] = []
  if (plan.openFiles.count > 0) {
    // -k keeps the files on disk; they go with the folder.
    await p4OrThrow(host, ['-c', client, 'revert', '-k', `//${client}/...`], cwd)
  }
  for (const change of plan.pendingChanges) {
    if (change.shelvedFiles > 0) {
      if (!options.deleteShelves) {
        continue
      }
      await p4OrThrow(host, ['-c', client, 'shelve', '-d', '-c', String(change.change)], cwd)
      deletedShelves.push(change.change)
    }
    await p4OrThrow(host, ['-c', client, 'change', '-d', String(change.change)], cwd)
    deletedChanges.push(change.change)
  }
  await p4OrThrow(host, ['client', '-d', client], cwd)
  return { deletedChanges, deletedShelves }
}

/**
 * Removes a copy: reverts (with `revertOpenFiles`) and deletes its pending changelists and shelves
 * (with `deleteShelves`), deletes its client, its folder, its marker, and its own stream when nothing
 * was submitted to it.
 */
export async function removeWorkspaceCopy(
  host: WorkspaceCopyHost,
  dir: string,
  name: string,
  options: WorkspaceCopyRemovalOptions = {},
  completion: { awaitFolderDeletion?: boolean } = {}
): Promise<WorkspaceCopyRemovalResult> {
  assertCopyName(name)
  const source = await resolveCopySource(host, dir)
  return withSourceLock(source.root, async () => {
    // Re-read now: the confirmation may be minutes old.
    const plan = await planWorkspaceCopyRemoval(host, source, name)
    const refusal = copyRemovalRefusal(plan, options)
    if (refusal) {
      throw new WorkspaceCopyError('refused', refusal)
    }
    const aside = await moveFolderAside(host, plan)
    let perforce: { deletedChanges: number[]; deletedShelves: number[] } = {
      deletedChanges: [],
      deletedShelves: []
    }
    if (plan.clientExists) {
      try {
        perforce = await cleanUpPerforce(host, plan, options)
      } catch (error) {
        const restored = aside
          ? await rename(aside, plan.copyRoot).then(
              () => true,
              () => false
            )
          : true
        const where = restored ? 'The folder was left in place.' : `The folder is at ${aside}.`
        const message = error instanceof Error ? error.message : String(error)
        throw new WorkspaceCopyError('perforce', `${message} ${where}`)
      }
    }
    await rm(plan.markerPath, { force: true })
    const { streamDeleted, note } = await disposeChildStream(host, plan)
    if (aside) {
      const deletion = host.removeTree(aside)
      if (completion.awaitFolderDeletion) {
        await deletion
      } else {
        // Leftovers are retried by the next listing.
        deletion.catch(() => {})
      }
    }
    return {
      name,
      client: plan.client,
      clientDeleted: plan.clientExists,
      folderDeleted: aside !== null,
      revertedFiles: plan.openFiles.count,
      deletedChanges: perforce.deletedChanges,
      deletedShelves: perforce.deletedShelves,
      streamDeleted,
      note
    }
  })
}

async function disposeChildStream(
  host: WorkspaceCopyHost,
  plan: RemovalPlan
): Promise<{ streamDeleted: boolean; note: string | null }> {
  const child = plan.childStream
  if (!child) {
    return { streamDeleted: false, note: null }
  }
  if (child.submittedChanges === 0) {
    await p4OrThrow(host, ['stream', '-d', child.stream], plan.source.root)
    return { streamDeleted: true, note: null }
  }
  return {
    streamDeleted: false,
    note: `Kept ${child.stream} because it has submitted changes. To bring them into ${child.parent ?? 'its parent'}, run p4 copy -S ${child.stream} from a workspace on that stream, review and submit; delete the stream afterwards.`
  }
}
