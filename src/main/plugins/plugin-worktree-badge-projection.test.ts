import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { parsePluginManifest } from '../../shared/plugins/plugin-manifest'
import type { ValidDiscoveredPlugin } from './plugin-discovery'
import { projectPluginWorktreeBadges } from './plugin-worktree-badge-projection'

let rootDir: string

beforeEach(async () => {
  rootDir = await mkdtemp(join(tmpdir(), 'orca-badge-projection-'))
})

afterEach(async () => {
  await rm(rootDir, { recursive: true, force: true })
})

function plugin(icons: string[]): ValidDiscoveredPlugin {
  const parsed = parsePluginManifest({
    manifestVersion: 1,
    id: 'engine',
    publisher: 'orca-samples',
    name: 'Engine',
    version: '1.0.0',
    engines: { orca: '>=1.0.0' },
    pluginApi: 1,
    main: 'main.mjs',
    contributes: {
      commands: [{ id: 'open-project', title: 'Open project', context: 'worktree' }],
      worktreeBadges: icons.map((icon, index) => ({
        id: `badge-${index}`,
        title: 'Engine project',
        icon,
        when: { pathExists: ['engine.project'], host: 'local' },
        commands: ['open-project']
      }))
    },
    capabilities: [{ kind: 'workspace:read' }]
  })
  if (!parsed.ok) {
    throw new Error(parsed.error)
  }
  return {
    pluginKey: 'orca-samples.engine',
    rootDir,
    manifest: parsed.manifest,
    consentFingerprint: 'fingerprint',
    contentHash: null,
    isDev: true
  }
}

describe('projectPluginWorktreeBadges', () => {
  it('inlines SVG icons and keeps Lucide names', async () => {
    const markup =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M0 0h16v16H0z"/></svg>'
    await mkdir(join(rootDir, 'icons'))
    await writeFile(join(rootDir, 'icons', 'engine.svg'), markup)

    const badges = await projectPluginWorktreeBadges(plugin(['icons/engine.svg', 'gamepad-2']))

    expect(badges).toEqual([
      {
        id: 'badge-0',
        title: 'Engine project',
        icon: { kind: 'svg', markup },
        when: { pathExists: ['engine.project'], host: 'local' },
        commands: ['open-project']
      },
      expect.objectContaining({ id: 'badge-1', icon: { kind: 'lucide', name: 'gamepad-2' } })
    ])
  })

  it('falls back to a generic icon when the SVG is missing or not an SVG', async () => {
    await writeFile(join(rootDir, 'fake.svg'), 'not an image')

    const badges = await projectPluginWorktreeBadges(plugin(['missing.svg', 'fake.svg']))

    expect(badges.map((badge) => badge.icon)).toEqual([
      { kind: 'lucide', name: 'puzzle' },
      { kind: 'lucide', name: 'puzzle' }
    ])
  })
})
