import { app } from 'electron'
import { PluginBundledBootstrapCoordinator as LaunchBundleCoordinator } from './plugin-bundled-bootstrap-coordinator'
import {
  bootstrapLaunchAndExtraPlugins,
  resolveExtraBundledPluginRoot
} from './plugin-extra-bundled-bootstrap'

/** Integration-only (AGENTS.md): the launch bundle plus `extra-plugins/`. Startup imports this in
 *  place of the upstream coordinator so main-process-plugins stays under its line cap. */
export class PluginBundledBootstrapCoordinator extends LaunchBundleCoordinator {
  constructor(options: ConstructorParameters<typeof LaunchBundleCoordinator>[0]) {
    const extraRoot = resolveExtraBundledPluginRoot({
      isPackaged: app.isPackaged,
      resourcesPath: process.resourcesPath,
      appPath: app.getAppPath()
    })
    super({
      ...options,
      bootstrap: (request) => bootstrapLaunchAndExtraPlugins(request, extraRoot)
    })
  }
}
