import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const manifest = JSON.parse(await readFile(new URL('../orca-plugin.json', import.meta.url), 'utf8'))

test('the Unity badge opens a worker command that runs on a worktree', () => {
  const [badge] = manifest.contributes.worktreeBadges
  const command = manifest.contributes.commands.find((entry) => entry.id === badge.commands[0])
  assert.equal(command?.context, 'worktree')
  assert.equal(command?.action, undefined)
  assert.deepEqual(badge.when, {
    pathExists: ['ProjectSettings/ProjectVersion.txt'],
    host: 'local'
  })
  assert.ok(manifest.capabilities.some((capability) => capability.kind === 'workspace:read'))
})

test('the badge icon is a small single-color SVG', async () => {
  const [badge] = manifest.contributes.worktreeBadges
  const svg = await readFile(new URL(`../${badge.icon}`, import.meta.url), 'utf8')
  assert.match(svg, /^<svg[\s>]/)
  assert.ok(svg.length < 32 * 1024)
  assert.doesNotMatch(svg, /<script|href=|url\(/i)
})
