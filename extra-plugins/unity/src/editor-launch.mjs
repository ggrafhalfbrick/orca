import { spawn } from 'node:child_process'
import { win32 } from 'node:path'

/**
 * Environment for the editor: the plugin worker's own, minus what makes Electron apps run as
 * plain Node (Unity starts Hub and other Electron helpers). Orca builds before the desktop-session
 * allowlist omit the Windows folder variables, so those are restored from the profile.
 */
export function editorEnvironment(env, platform = process.platform) {
  const result = { ...env }
  delete result.ELECTRON_RUN_AS_NODE
  delete result.NODE_OPTIONS
  if (platform !== 'win32') {
    return result
  }
  // Why: Windows variable names are case-insensitive; a second casing would shadow the real one.
  const present = new Set(Object.keys(result).map((key) => key.toUpperCase()))
  const profile = result.USERPROFILE
  const drive = result.SYSTEMDRIVE ?? 'C:'
  const defaults = {
    APPDATA: profile && win32.join(profile, 'AppData', 'Roaming'),
    LOCALAPPDATA: profile && win32.join(profile, 'AppData', 'Local'),
    PROGRAMDATA: `${drive}\\ProgramData`,
    PROGRAMFILES: `${drive}\\Program Files`
  }
  for (const [key, value] of Object.entries(defaults)) {
    if (value && !present.has(key)) {
      result[key] = value
    }
  }
  return result
}

/** Linux GUI apps need a display; plugin workers of older Orca builds do not pass one. */
export function missingDisplayError(env, platform = process.platform) {
  if (platform !== 'linux' || env.DISPLAY || env.WAYLAND_DISPLAY) {
    return null
  }
  return 'Orca did not give its plugins a display to open Unity on. Update Orca, or open the project from Unity Hub.'
}

/** Starts the editor detached so it outlives the plugin worker; resolves once it has started. */
export function launchEditor(
  executable,
  projectPath,
  { env = process.env, platform = process.platform, spawnProcess = spawn } = {}
) {
  return new Promise((resolve, reject) => {
    const child = spawnProcess(executable, ['-projectPath', projectPath], {
      detached: true,
      stdio: 'ignore',
      env: editorEnvironment(env, platform)
    })
    child.once('error', reject)
    child.once('spawn', () => {
      child.unref()
      resolve()
    })
  })
}
