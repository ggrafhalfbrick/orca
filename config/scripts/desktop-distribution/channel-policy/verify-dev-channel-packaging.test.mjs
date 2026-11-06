import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const CONFIG_PATH = resolve(import.meta.dirname, '../../../electron-builder.config.cjs')

/** The config reads process.env at require time, so each identity needs a fresh load. */
function loadConfigWithEnv(env) {
  const saved = { ...process.env }
  for (const key of Object.keys(process.env)) {
    if (key.startsWith('ORCA_')) {
      delete process.env[key]
    }
  }
  Object.assign(process.env, env)
  try {
    delete require.cache[require.resolve(CONFIG_PATH)]
    return require(CONFIG_PATH)
  } finally {
    process.env = saved
    delete require.cache[require.resolve(CONFIG_PATH)]
  }
}

afterEach(() => {
  delete require.cache[require.resolve(CONFIG_PATH)]
})

describe('electron-builder dev-channel identity', () => {
  // Integration-only (AGENTS.md): fork releases are unsigned, so each must accept the next one.
  it('drops the publisherName on a fork release build', () => {
    const config = loadConfigWithEnv({ ORCA_UPDATE_RELEASE_REPO: 'example/orca' })

    expect(config.win.signtoolOptions?.publisherName).toBeUndefined()
    expect(config.win.verifyUpdateCodeSignature).toBe(false)
  })
})
