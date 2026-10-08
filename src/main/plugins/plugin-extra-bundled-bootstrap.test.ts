import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import {
  bootstrapExtraBundledPlugins,
  bootstrapLaunchAndExtraPlugins,
  resolveExtraBundledPluginRoot
} from './plugin-extra-bundled-bootstrap'
import { readPluginLockfile } from './plugin-install'

const roots: string[] = []

async function tempRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix))
  roots.push(root)
  return root
}

async function writePlugin(root: string, publisher: string, version = '1.0.0'): Promise<void> {
  const pluginRoot = join(root, 'roadmap')
  await mkdir(pluginRoot, { recursive: true })
  await writeFile(
    join(pluginRoot, 'orca-plugin.json'),
    JSON.stringify({
      manifestVersion: 1,
      id: 'roadmap',
      publisher,
      name: 'Roadmap',
      version,
      engines: { orca: '>=1.0.0' },
      pluginApi: 1,
      capabilities: []
    })
  )
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('extra bundled plugin bootstrap', () => {
  it('reads the source tree in dev and the packaged copy in builds', () => {
    const location = { resourcesPath: join('app', 'Resources'), appPath: join('repo') }
    expect(resolveExtraBundledPluginRoot({ ...location, isPackaged: false })).toBe(
      join('repo', 'extra-plugins')
    )
    expect(resolveExtraBundledPluginRoot({ ...location, isPackaged: true })).toBe(
      join('app', 'Resources', 'plugins', 'extra')
    )
  })

  it('installs a extra plugin once, then again only when its bytes change', async () => {
    const root = await tempRoot('orca-extra-plugins-')
    const userDataPath = await tempRoot('orca-extra-user-data-')
    await writePlugin(root, 'earlgeorg')
    const request = { root, userDataPath, hostVersion: '1.4.0' }

    await expect(bootstrapExtraBundledPlugins(request)).resolves.toEqual({
      installed: ['earlgeorg.roadmap'],
      unchanged: [],
      errors: []
    })
    await expect(bootstrapExtraBundledPlugins(request)).resolves.toMatchObject({
      installed: [],
      unchanged: ['earlgeorg.roadmap']
    })
    await writePlugin(root, 'earlgeorg', '1.1.0')
    await expect(bootstrapExtraBundledPlugins(request)).resolves.toMatchObject({
      installed: ['earlgeorg.roadmap']
    })
    const lock = await readPluginLockfile(join(userDataPath, 'plugins'))
    expect(lock.plugins['earlgeorg.roadmap']?.source).toEqual({
      kind: 'bundled',
      bundleId: 'earlgeorg.roadmap'
    })
  })

  it('refuses folders that are not extra plugins and tolerates a missing root', async () => {
    const root = await tempRoot('orca-extra-plugins-')
    const userDataPath = await tempRoot('orca-extra-user-data-')
    await writePlugin(root, 'community')

    await expect(
      bootstrapExtraBundledPlugins({ root, userDataPath, hostVersion: '1.4.0' })
    ).resolves.toEqual({
      installed: [],
      unchanged: [],
      errors: [{ pluginKey: 'community.roadmap', error: 'not an extra plugin identity' }]
    })
    await expect(
      bootstrapExtraBundledPlugins({
        root: join(root, 'missing'),
        userDataPath,
        hostVersion: '1.4.0'
      })
    ).resolves.toEqual({ installed: [], unchanged: [], errors: [] })
  })

  it('still installs extra plugins when the launch bundle cannot be read', async () => {
    const extraRoot = await tempRoot('orca-extra-plugins-')
    const userDataPath = await tempRoot('orca-extra-user-data-')
    await writePlugin(extraRoot, 'earlgeorg')

    const result = await bootstrapLaunchAndExtraPlugins(
      { root: join(extraRoot, 'no-launch-bundle'), userDataPath, hostVersion: '1.4.0' },
      extraRoot
    )

    expect(result.installed).toEqual(['earlgeorg.roadmap'])
    expect(result.errors).toEqual([{ pluginKey: 'launch bundle', error: expect.any(String) }])
  })

  it('installs the plugins this build ships', async () => {
    const repoRoot = fileURLToPath(new URL('../../../', import.meta.url))
    const { version } = JSON.parse(await readFile(join(repoRoot, 'package.json'), 'utf8'))
    const userDataPath = await tempRoot('orca-extra-user-data-')

    const result = await bootstrapExtraBundledPlugins({
      root: join(repoRoot, 'extra-plugins'),
      userDataPath,
      hostVersion: version
    })

    expect(result.errors).toEqual([])
    expect(result.installed.sort()).toEqual(['earlgeorg.markdown-vault', 'earlgeorg.unity'])
  })
})
