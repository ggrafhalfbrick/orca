import type {
  WorkspaceCopyRemovalOptions,
  WorkspaceCopyRemovalPreview
} from '../../../../shared/perforce/workspace-copy/workspace-copy-types'

export type CopyRemovalSummary = {
  /** What removal deletes, in the order it happens. */
  deletes: string[]
  /** What it leaves alone, so the user knows their own work is safe. */
  keeps: string[]
}

function quoted(description: string): string {
  const firstLine = description.split(/\r?\n/)[0]?.trim() ?? ''
  return firstLine ? ` “${firstLine.length > 60 ? `${firstLine.slice(0, 57)}…` : firstLine}”` : ''
}

/** The confirmation's account of what deleting this copy does with the options as chosen. */
export function summarizeCopyRemoval(
  preview: WorkspaceCopyRemovalPreview,
  options: WorkspaceCopyRemovalOptions,
  sourceRoot: string
): CopyRemovalSummary {
  const deletes: string[] = []
  const keeps: string[] = [
    `Your workspace ${sourceRoot}, its client and its checked-out files are not touched.`
  ]
  if (preview.folderExists) {
    deletes.push(`The folder ${preview.copyRoot} and everything in it.`)
  }
  if (preview.openFiles.count > 0 && options.revertOpenFiles) {
    deletes.push(
      `The changes in ${preview.openFiles.count} checked-out file(s): they are reverted, then deleted with the folder.`
    )
  }
  for (const change of preview.pendingChanges) {
    if (change.shelvedFiles === 0) {
      deletes.push(`Pending changelist ${change.change}${quoted(change.description)}.`)
    } else if (options.deleteShelves) {
      deletes.push(
        `Changelist ${change.change}${quoted(change.description)} and its ${change.shelvedFiles} shelved file(s).`
      )
    }
  }
  if (preview.clientExists) {
    deletes.push(`The Perforce client ${preview.client} on the server.`)
  }
  if (preview.childStream) {
    const { stream, submittedChanges, parent } = preview.childStream
    if (submittedChanges === 0) {
      deletes.push(`The copy's own stream ${stream} (nothing was submitted to it).`)
    } else {
      keeps.push(
        `The stream ${stream}: it has submitted work. Bring it into ${parent ?? 'its parent'} with p4 copy -S ${stream}, then delete the stream.`
      )
    }
  }
  deletes.push(`The copy's marker file ${preview.markerPath}.`)
  return { deletes, keeps }
}
