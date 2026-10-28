import { spawn } from 'node:child_process'
import { win32 } from 'node:path'
import { applyRegistryEnvironment, readRegistryEnvironment } from './windows-environment.mjs'

/**
 * Environment for the editor: the plugin worker's own, minus what makes Electron apps run as
 * plain Node (Unity starts Hub and other Electron helpers). On Windows the worker's allowlist
 * drops the user's own variables, which the project's tools rely on, so the registry entries
 * (`readRegistryEnvironment`) are laid over it as Unity Hub would see them. Folder variables
 * Unity needs that are still missing (its Package Manager throws without ALLUSERSPROFILE) are
 * restored from the profile and system drive.
 */
export function editorEnvironment(env, platform = process.platform, registryEntries = []) {
  const result = { ...env }
  delete result.ELECTRON_RUN_AS_NODE
  delete result.NODE_OPTIONS
  if (platform !== 'win32') {
    return result
  }
  applyRegistryEnvironment(result, registryEntries)
  // Why: Windows variable names are case-insensitive; a second casing would shadow the real one.
  const values = new Map(Object.entries(result).map(([key, value]) => [key.toUpperCase(), value]))
  const profile = values.get('USERPROFILE')
  const drive = values.get('SYSTEMDRIVE') ?? 'C:'
  const programData = values.get('PROGRAMDATA') ?? `${drive}\\ProgramData`
  const programFiles = values.get('PROGRAMFILES') ?? `${drive}\\Program Files`
  const defaults = {
    APPDATA: profile && win32.join(profile, 'AppData', 'Roaming'),
    LOCALAPPDATA: profile && win32.join(profile, 'AppData', 'Local'),
    PROGRAMDATA: programData,
    ALLUSERSPROFILE: programData,
    PROGRAMFILES: programFiles,
    COMMONPROGRAMFILES: win32.join(programFiles, 'Common Files'),
    PUBLIC: `${drive}\\Users\\Public`,
    OS: 'Windows_NT'
  }
  for (const [key, value] of Object.entries(defaults)) {
    if (value && !values.has(key)) {
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
export async function launchEditor(
  executable,
  projectPath,
  {
    env = process.env,
    platform = process.platform,
    spawnProcess = spawn,
    readRegistry = readRegistryEnvironment
  } = {}
) {
  const registryEntries = platform === 'win32' ? await readRegistry(env) : []
  const editorEnv = editorEnvironment(env, platform, registryEntries)
  return new Promise((resolve, reject) => {
    const child = spawnProcess(executable, ['-projectPath', projectPath], {
      detached: true,
      stdio: 'ignore',
      env: editorEnv
    })
    child.once('error', reject)
    child.once('spawn', () => {
      child.unref()
      resolve()
    })
  })
}
