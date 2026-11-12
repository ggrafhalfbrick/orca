import { useTranslate } from '@/i18n/use-translate'
import type { NewWorkspaceComposerCardProps } from './new-workspace-composer-card-props'

type ExistingWorkspaceProps = Pick<
  NewWorkspaceComposerCardProps,
  'startsInExistingWorkspace' | 'quickAgent' | 'showCreateMultiple' | 'primaryActionLabel'
>

/**
 * Integration-only (AGENTS.md): how the composer card changes when a plugin task starts its agent
 * in an existing workspace. Kept out of NewWorkspaceComposerCard so upstream's file stays within
 * max-lines.
 */
export function useComposerExistingWorkspace(
  props: ExistingWorkspaceProps,
  sparseEditing: boolean
): {
  startsInExisting: boolean
  sparseEditingActive: boolean
  footerOverrides: Pick<ExistingWorkspaceProps, 'showCreateMultiple' | 'primaryActionLabel'>
} {
  const t = useTranslate()
  const startsInExisting = Boolean(props.startsInExistingWorkspace) && props.quickAgent !== null
  return {
    startsInExisting,
    // Why: Advanced is left out for an existing workspace, so its preset editor must not hold the form.
    sparseEditingActive: sparseEditing && !startsInExisting,
    footerOverrides: {
      showCreateMultiple: props.showCreateMultiple && !startsInExisting,
      primaryActionLabel: startsInExisting
        ? t('auto.components.NewWorkspaceComposerCard.startInWorkspace', 'Start in workspace')
        : props.primaryActionLabel
    }
  }
}
