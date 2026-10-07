import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { normalizePerforceSettings } from '../../../shared/perforce/perforce-settings'
import type { RuntimeFileOperationArgs } from '../runtime/runtime-file-client-types'
import { getRelativePathInsideWorktree } from '../runtime/runtime-file-routing'
import { runPerforceOperation } from '../runtime/runtime-perforce-client'
import { perforceTargetForFileContext } from './perforce-workspace-target'

export const PERFORCE_EDIT_DECLINED_MESSAGE =
  'Save cancelled: the file is not opened for edit in Perforce.'

/**
 * Perforce leaves synced files read-only until they are opened for edit, so saving one would fail.
 * Before a write into a Perforce workspace, on whichever host it lives, this opens the file for edit
 * as Settings > Perforce says (asking first by default); declining cancels the save. Probe failures
 * fall through to the normal write, which reports the error.
 */
export async function checkoutPerforceFileBeforeWrite(
  context: RuntimeFileOperationArgs,
  filePath: string
): Promise<void> {
  const behavior = normalizePerforceSettings(
    useAppStore.getState().settings?.perforce
  ).saveReadOnlyBehavior
  const { worktreePath } = context
  if (behavior === 'never' || !worktreePath) {
    return
  }
  const target = perforceTargetForFileContext({
    settings: context.settings,
    worktreeId: context.worktreeId,
    worktreePath,
    ...(context.connectionId ? { connectionId: context.connectionId } : {})
  })
  const relativePath = getRelativePathInsideWorktree(worktreePath, filePath)
  if (!target || !relativePath) {
    return
  }
  const readOnly = await runPerforceOperation(target, 'isReadOnlyFile', {
    filePath: relativePath
  }).catch(() => false)
  if (!readOnly) {
    return
  }
  if (
    behavior === 'ask' &&
    !window.confirm(
      translate(
        'perforce.ui.saveNeedsOpenForEdit',
        '{{path}} is not opened for edit in Perforce. Open it for edit and save?',
        { path: relativePath }
      )
    )
  ) {
    throw new Error(PERFORCE_EDIT_DECLINED_MESSAGE)
  }
  // The write reports the failure if the file stayed read-only.
  await runPerforceOperation(target, 'checkoutIfReadOnly', { filePath: relativePath }).catch(
    () => undefined
  )
}
