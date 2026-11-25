import React from 'react'
import { NewWorkspaceComposerAgentDraftSection } from './NewWorkspaceComposerAgentDraftSection'
import type { NewWorkspaceComposerCardProps } from './new-workspace-composer-card-props'

// Why its own module: on integration, the existing-workspace picker beside the agent prompt would
// push NewWorkspaceComposerCard.tsx past max-lines.

/** The prefilled agent prompt, then the existing-workspace picker when a prompt is prefilled. */
export function NewWorkspaceComposerAgentDraftSlot(
  props: NewWorkspaceComposerCardProps
): React.JSX.Element {
  return (
    <>
      <NewWorkspaceComposerAgentDraftSection {...props} />
      {props.agentDraft != null ? props.existingWorkspaceField?.(props.quickAgent) : null}
    </>
  )
}
