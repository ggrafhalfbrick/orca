// Integration-only (AGENTS.md): upstream's dark build switches, plus the define that points a fork
// build's in-app updater at the fork's releases. electron.vite.config.ts sits at its max-lines
// limit, and its dark-build defines already reach both the main and renderer builds.
const darkBuildSwitches = require('./dark-build-switches.cjs')

/** Dark-build defines plus `ORCA_UPDATE_RELEASE_REPO`; null keeps the updater on stablyai/orca. */
function darkBuildDefines(env = process.env) {
  return {
    ...darkBuildSwitches.darkBuildDefines(env),
    ORCA_UPDATE_RELEASE_REPO: JSON.stringify(env.ORCA_UPDATE_RELEASE_REPO || null)
  }
}

module.exports = { ...darkBuildSwitches, darkBuildDefines }
