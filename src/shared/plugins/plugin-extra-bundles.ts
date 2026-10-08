import { splitQualifiedPluginKey } from './plugin-marketplace'

/**
 * Publishers whose plugins this build ships from `extra-plugins/`. Unlike Orca's official launch
 * bundle they have no pinned release hash: the bytes ship inside the app, so the startup bootstrap
 * hashes what it finds. Users still enable the plugin system and approve each one.
 */
export const EXTRA_BUNDLED_PLUGIN_PUBLISHERS: readonly string[] = ['earlgeorg']

export function isExtraBundledPluginIdentity(pluginKey: string): boolean {
  const identity = splitQualifiedPluginKey(pluginKey)
  return identity !== null && EXTRA_BUNDLED_PLUGIN_PUBLISHERS.includes(identity.publisher)
}
