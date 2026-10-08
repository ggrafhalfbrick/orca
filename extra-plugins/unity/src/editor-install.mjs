import { access, readdir, readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { posix, win32 } from 'node:path'

/**
 * Finds an installed Unity Editor the way Unity Hub lays them out, without asking Hub:
 * editors located by hand in Hub (editors-v2.json), then `<install folder>/<version>` under
 * Hub's custom install folder (secondaryInstallPath.json) and Hub's default one.
 */

/**
 * @typedef {{
 *   platform: NodeJS.Platform
 *   env: NodeJS.ProcessEnv
 *   home: string
 *   exists: (path: string) => Promise<boolean>
 *   readText: (path: string) => Promise<string | null>
 *   listDir: (path: string) => Promise<string[]>
 * }} InstallContext
 */

/** @returns {InstallContext} */
export function defaultInstallContext() {
  return {
    platform: process.platform,
    env: process.env,
    home: homedir(),
    exists: async (path) => {
      try {
        await access(path)
        return true
      } catch {
        return false
      }
    },
    readText: async (path) => {
      try {
        return await readFile(path, 'utf8')
      } catch {
        return null
      }
    },
    listDir: async (path) => {
      try {
        return (await readdir(path, { withFileTypes: true }))
          .filter((entry) => entry.isDirectory())
          .map((entry) => entry.name)
      } catch {
        return []
      }
    }
  }
}

function pathFor(platform) {
  return platform === 'win32' ? win32 : posix
}

/** @param {InstallContext} ctx */
export function hubConfigDir(ctx) {
  const { join } = pathFor(ctx.platform)
  if (ctx.platform === 'win32') {
    return join(ctx.env.APPDATA ?? join(ctx.home, 'AppData', 'Roaming'), 'UnityHub')
  }
  if (ctx.platform === 'darwin') {
    return join(ctx.home, 'Library', 'Application Support', 'UnityHub')
  }
  return join(ctx.env.XDG_CONFIG_HOME ?? join(ctx.home, '.config'), 'UnityHub')
}

/** @param {InstallContext} ctx */
export function defaultEditorInstallDir(ctx) {
  const { join } = pathFor(ctx.platform)
  if (ctx.platform === 'win32') {
    const programFiles = ctx.env.PROGRAMFILES ?? `${ctx.env.SYSTEMDRIVE ?? 'C:'}\\Program Files`
    return join(programFiles, 'Unity', 'Hub', 'Editor')
  }
  if (ctx.platform === 'darwin') {
    return '/Applications/Unity/Hub/Editor'
  }
  return join(ctx.home, 'Unity', 'Hub', 'Editor')
}

/** The editor binary inside one `<install folder>/<version>` folder. */
export function editorExecutableIn(versionDir, platform) {
  const { join } = pathFor(platform)
  if (platform === 'win32') {
    return join(versionDir, 'Editor', 'Unity.exe')
  }
  if (platform === 'darwin') {
    return join(versionDir, 'Unity.app', 'Contents', 'MacOS', 'Unity')
  }
  return join(versionDir, 'Editor', 'Unity')
}

/** Hub stores a located editor as the binary, the macOS app bundle, or its folder. */
export function editorExecutableFromLocation(location, platform) {
  const { join } = pathFor(platform)
  if (/[\\/]Unity(\.exe)?$/i.test(location)) {
    return location
  }
  if (/\.app$/i.test(location)) {
    return join(location, 'Contents', 'MacOS', 'Unity')
  }
  return platform === 'win32' ? join(location, 'Unity.exe') : join(location, 'Unity')
}

function parseJson(text) {
  try {
    return text === null ? null : JSON.parse(text)
  } catch {
    return null
  }
}

/** Editors located by hand in Hub, as `{ version, executable }`. */
async function readLocatedEditors(ctx) {
  const { join } = pathFor(ctx.platform)
  const parsed = parseJson(await ctx.readText(join(hubConfigDir(ctx), 'editors-v2.json')))
  const entries = Array.isArray(parsed?.data)
    ? parsed.data
    : parsed && typeof parsed === 'object'
      ? Object.values(parsed)
      : []
  return entries.flatMap((entry) => {
    if (typeof entry?.version !== 'string') {
      return []
    }
    const locations = Array.isArray(entry.location) ? entry.location : [entry.location]
    return locations
      .filter((location) => typeof location === 'string' && location.length > 0)
      .map((location) => ({
        version: entry.version,
        executable: editorExecutableFromLocation(location, ctx.platform)
      }))
  })
}

async function readInstallDirs(ctx) {
  const { join } = pathFor(ctx.platform)
  const custom = parseJson(await ctx.readText(join(hubConfigDir(ctx), 'secondaryInstallPath.json')))
  const dirs = typeof custom === 'string' && custom.trim() ? [custom.trim()] : []
  return [...new Set([...dirs, defaultEditorInstallDir(ctx)])]
}

/** @param {string} version @param {InstallContext} [ctx] */
export async function findInstalledEditor(version, ctx = defaultInstallContext()) {
  const { join } = pathFor(ctx.platform)
  for (const located of await readLocatedEditors(ctx)) {
    if (located.version === version && (await ctx.exists(located.executable))) {
      return located.executable
    }
  }
  for (const dir of await readInstallDirs(ctx)) {
    const executable = editorExecutableIn(join(dir, version), ctx.platform)
    if (await ctx.exists(executable)) {
      return executable
    }
  }
  return null
}

const VERSION_COLLATOR = new Intl.Collator(undefined, { numeric: true })

/** Installed editor versions, newest first, for telling the user what they have. */
export async function listInstalledEditorVersions(ctx = defaultInstallContext()) {
  const versions = new Set((await readLocatedEditors(ctx)).map((located) => located.version))
  for (const dir of await readInstallDirs(ctx)) {
    for (const name of await ctx.listDir(dir)) {
      versions.add(name)
    }
  }
  return [...versions].sort((a, b) => VERSION_COLLATOR.compare(b, a))
}
