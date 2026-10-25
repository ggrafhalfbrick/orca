import { createRequire } from 'node:module'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const electronBuilderConfig = require('../electron-builder.config.cjs')
const { FileMatcher } = require('app-builder-lib/out/fileMatcher')

describe('electron-builder extra plugins', () => {
  it('keeps extra-plugins sources out of app.asar', () => {
    const matcher = new FileMatcher('/app', '/dest', (value) => value, electronBuilderConfig.files)
    matcher.prependPattern('**/*')
    const isPacked = matcher.createFilter()
    expect(
      isPacked(join('/app', 'extra-plugins/unity/main.mjs'), { isDirectory: () => false })
    ).toBe(false)
  })

  it('ships extra plugins as resources on every platform', () => {
    for (const platform of ['mac', 'linux', 'win']) {
      expect(electronBuilderConfig[platform].extraResources).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ from: 'extra-plugins', to: 'plugins/extra' })
        ])
      )
    }
  })
})
