import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { isExtraBundledPluginIdentity } from '../../shared/plugins/plugin-extra-bundles'
import {
  bootstrapBundledPlugins,
  bundledInstallIsIntact,
  type PluginBundledBootstrapResult
} from './plugin-bundled-bootstrap'
import { getUserPluginsDir } from './plugin-discovery'
import { installBundledPlugin, readPluginLockfile } from './plugin-install'
import { inspectPluginInstallTree } from './plugin-install-staging'

type BundledBootstrapRequest = Parameters<typeof bootstrapBundledPlugins>[0]

/** Packaged builds ship `extra-plugins` beside the official launch bundle; dev reads the source. */
export function resolveExtraBundledPluginRoot(options: {
  isPackaged: boolean
  resourcesPath: string
  appPath: string
}): string {
  return options.isPackaged
    ? join(options.resourcesPath, 'plugins', 'extra')
    : join(options.appPath, 'extra-plugins')
}

/**
 * Installs every extra plugin folder under `root` as a bundled plugin. No release index pins
 * these: the hash of the shipped bytes is the version, so a changed plugin reinstalls on its own.
 */
export async function bootstrapExtraBundledPlugins(
  options: BundledBootstrapRequest
): Promise<PluginBundledBootstrapResult> {
  const result: PluginBundledBootstrapResult = { installed: [], unchanged: [], errors: [] }
  const folders = await readdir(options.root, { withFileTypes: true }).catch(() => [])
  const pluginsDir = getUserPluginsDir(options.userDataPath)
  const lock = await readPluginLockfile(pluginsDir)
  for (const folder of folders.filter((entry) => entry.isDirectory())) {
    const sourcePath = join(options.root, folder.name)
    const inspection = await inspectPluginInstallTree({
      rootDir: sourcePath,
      hostVersion: options.hostVersion
    })
    if (!inspection.ok || !isExtraBundledPluginIdentity(inspection.pluginKey)) {
      result.errors.push({
        pluginKey: inspection.ok ? inspection.pluginKey : folder.name,
        error: inspection.ok ? 'not an extra plugin identity' : inspection.error
      })
      continue
    }
    const { pluginKey, contentHash } = inspection
    const locked = lock.plugins[pluginKey]
    if (
      locked?.source.kind === 'bundled' &&
      locked.contentHash === contentHash &&
      (await bundledInstallIsIntact(pluginsDir, pluginKey, contentHash))
    ) {
      result.unchanged.push(pluginKey)
      continue
    }
    const installed = await installBundledPlugin({
      pluginsDir,
      sourcePath,
      hostVersion: options.hostVersion,
      expectedPluginKey: pluginKey,
      blockedPluginReason: options.blockedPluginReason
    })
    if (installed.ok) {
      result.installed.push(pluginKey)
    } else {
      result.errors.push({ pluginKey, error: installed.error })
    }
  }
  return result
}

/** The official launch bundle, then the extra plugins; one failing never blocks the other. */
export async function bootstrapLaunchAndExtraPlugins(
  request: BundledBootstrapRequest,
  extraRoot: string
): Promise<PluginBundledBootstrapResult> {
  const launch = await bootstrapBundledPlugins(request).catch(
    (error: unknown): PluginBundledBootstrapResult => ({
      installed: [],
      unchanged: [],
      errors: [
        {
          pluginKey: 'launch bundle',
          error: error instanceof Error ? error.message : String(error)
        }
      ]
    })
  )
  const results = [launch, await bootstrapExtraBundledPlugins({ ...request, root: extraRoot })]
  return {
    installed: results.flatMap((result) => result.installed),
    unchanged: results.flatMap((result) => result.unchanged),
    errors: results.flatMap((result) => result.errors)
  }
}
