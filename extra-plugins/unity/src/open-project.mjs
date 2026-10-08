import { readProjectEditorVersion } from './project-version.mjs'
import { findInstalledEditor, listInstalledEditorVersions } from './editor-install.mjs'
import { isProjectOpenInEditor } from './editor-running.mjs'
import { launchEditor, missingDisplayError } from './editor-launch.mjs'

const defaultDeps = {
  readVersion: readProjectEditorVersion,
  isOpen: isProjectOpenInEditor,
  findEditor: findInstalledEditor,
  listVersions: listInstalledEditorVersions,
  launch: launchEditor,
  env: process.env,
  platform: process.platform
}

/**
 * Opens a worktree's Unity project in the editor version it was saved with, unless an editor
 * already has it open. Returns `{ message }`, which Orca shows as a toast; throws with a
 * user-facing message when it cannot.
 */
export async function openUnityProject(worktree, deps = defaultDeps) {
  if (!worktree?.path) {
    throw new Error(
      'Run "Open in Unity" on a worktree: use the Unity icon beside its name or right-click it.'
    )
  }
  if (worktree.host !== 'local') {
    throw new Error('Unity can only open projects that are on this computer.')
  }
  const projectPath = worktree.path
  const name = worktree.displayName || projectPath
  const version = await deps.readVersion(projectPath)
  if (await deps.isOpen(projectPath, { platform: deps.platform })) {
    return { message: `Unity already has ${name} open.` }
  }
  const executable = await deps.findEditor(version)
  if (!executable) {
    const installed = await deps.listVersions()
    const hint = installed.length > 0 ? ` Installed: ${installed.slice(0, 5).join(', ')}.` : ''
    throw new Error(
      `Unity ${version} is not installed. Install it from Unity Hub, then try again.${hint}`
    )
  }
  const displayError = missingDisplayError(deps.env, deps.platform)
  if (displayError) {
    throw new Error(displayError)
  }
  await deps.launch(executable, projectPath, { env: deps.env, platform: deps.platform })
  return { message: `Opening ${name} in Unity ${version}…` }
}
