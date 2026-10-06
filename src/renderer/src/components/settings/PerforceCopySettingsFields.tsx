import {
  DEFAULT_PERFORCE_SETTINGS,
  type PerforceSettings
} from '../../../../shared/perforce/perforce-settings'
import { NumberField, SettingsRow, SettingsSwitchRow } from './SettingsFormControls'
import { TemplateField } from './perforce-settings-inputs'

/** Settings > Perforce > Workspace Copies: what a copy leaves out and the free-space floor. */
export function PerforceCopySettingsFields({
  perforce,
  update
}: {
  perforce: PerforceSettings
  update: (patch: Partial<PerforceSettings>) => void
}): React.JSX.Element {
  return (
    <div>
      <NumberField
        label="Minimum free space"
        description="Refuse to make a copy when the drive has less free space than this. A new copy takes about 1 GB, but opening it in Unity writes several GB more."
        value={perforce.copyMinFreeSpaceGb}
        defaultValue={DEFAULT_PERFORCE_SETTINGS.copyMinFreeSpaceGb}
        min={0}
        max={4096}
        integer
        suffix="GB"
        onChange={(copyMinFreeSpaceGb) => update({ copyMinFreeSpaceGb })}
      />
      <SettingsSwitchRow
        label="Leave out Unity's package cache"
        description="Skips each Unity project's Library/PackageCache; Unity refills it on first open. On a Dev Drive copying it is cheaper and opens faster, so this is off by default."
        checked={perforce.copySkipPackageCache}
        onChange={() => update({ copySkipPackageCache: !perforce.copySkipPackageCache })}
      />
      <SettingsRow
        alignTop
        label="Folders to leave out"
        description="Workspace-relative folders a copy does not take, one per line (for example tool state such as .jarvis). Files Perforce tracks in them come back from the depot."
        control={
          <TemplateField
            value={perforce.copyExcludedFolders}
            ariaLabel="Folders to leave out of copies"
            placeholder=".jarvis"
            onCommit={(copyExcludedFolders) => update({ copyExcludedFolders })}
          />
        }
      />
    </div>
  )
}
