import { describe, expect, it } from 'vitest'
import { parsePluginManifest } from './plugin-manifest'

function manifest(
  badge: Record<string, unknown>,
  overrides: Record<string, unknown> = {},
  badgeCount = 1
): Record<string, unknown> {
  return {
    manifestVersion: 1,
    id: 'engine',
    publisher: 'orca-samples',
    name: 'Engine',
    version: '1.0.0',
    engines: { orca: '>=1.0.0' },
    pluginApi: 1,
    main: 'main.mjs',
    contributes: {
      commands: [
        { id: 'open-project', title: 'Open project', context: 'worktree' },
        { id: 'refresh', title: 'Refresh' }
      ],
      worktreeBadges: Array.from({ length: badgeCount }, () => ({
        id: 'engine-project',
        title: 'Engine project',
        icon: 'icons/engine.svg',
        when: { pathExists: ['ProjectSettings/ProjectVersion.txt'] },
        commands: ['open-project'],
        ...badge
      }))
    },
    capabilities: [{ kind: 'workspace:read' }],
    ...overrides
  }
}

describe('worktree badge contributions', () => {
  it('accepts an SVG badge and defaults its host to any', () => {
    const result = parsePluginManifest(manifest({}))

    expect(result.ok).toBe(true)
    expect(result.ok && result.manifest.contributes.worktreeBadges[0]?.when.host).toBe('any')
  })

  it('accepts a Lucide icon name and a local-only host', () => {
    const result = parsePluginManifest(
      manifest({ icon: 'gamepad-2', when: { pathExists: ['project.godot'], host: 'local' } })
    )

    expect(result.ok).toBe(true)
  })

  it('rejects icons that are neither names nor portable SVG paths', () => {
    expect(parsePluginManifest(manifest({ icon: '../outside.svg' })).ok).toBe(false)
    expect(parsePluginManifest(manifest({ icon: 'icons/engine.png' })).ok).toBe(false)
  })

  it('rejects marker paths that leave the worktree', () => {
    expect(
      parsePluginManifest(manifest({ when: { pathExists: ['../ProjectVersion.txt'] } })).ok
    ).toBe(false)
  })

  it('requires badge commands to be worker commands with worktree context', () => {
    const unknown = parsePluginManifest(manifest({ commands: ['missing'] }))
    const global = parsePluginManifest(manifest({ commands: ['refresh'] }))

    expect(unknown).toMatchObject({ ok: false })
    expect(!unknown.ok && unknown.error).toContain('worktreeBadges.0.commands.0')
    expect(global).toMatchObject({ ok: false })
  })

  it('requires workspace:read because a badge command receives the folder path', () => {
    const result = parsePluginManifest(manifest({}, { capabilities: [] }))

    expect(result).toMatchObject({ ok: false })
    expect(!result.ok && result.error).toContain('workspace:read')
  })

  it('rejects duplicate badge ids', () => {
    const result = parsePluginManifest(manifest({}, {}, 2))

    expect(result).toMatchObject({ ok: false })
    expect(!result.ok && result.error).toContain('duplicate worktreeBadges id')
  })
})
