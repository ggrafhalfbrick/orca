import {
  agentPickerLaunchInputs,
  type AgentPickerDraft,
  type AgentPickerEntry
} from '../../../../shared/agent-launch/picker/agent-launch-picker'

/** Integration-only: NewWorkspaceComposerModal's quick-create launch inputs, moved out so the
 *  modal stays under max-lines with the existing-workspace start. */
export function quickPickerLaunchInputs(
  pickerDraft: AgentPickerDraft | undefined,
  entry: AgentPickerEntry | undefined
): ReturnType<typeof agentPickerLaunchInputs> | undefined {
  let launchInputs = pickerDraft ? agentPickerLaunchInputs(pickerDraft, entry) : undefined
  if (
    launchInputs &&
    pickerDraft?.surface === 'terminal' &&
    pickerDraft.arguments === undefined &&
    entry &&
    !entry.defaultsPending
  ) {
    launchInputs = agentPickerLaunchInputs(
      { ...pickerDraft, arguments: entry.arguments ?? null },
      entry
    )
  }
  return launchInputs
}
