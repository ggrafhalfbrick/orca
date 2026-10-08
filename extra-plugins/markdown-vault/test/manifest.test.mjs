import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { DEFAULT_SETTINGS } from '../src/settings.mjs'

const manifest = JSON.parse(await readFile(new URL('../orca-plugin.json', import.meta.url), 'utf8'))
const settings = manifest.contributes.settings

test('declared settings follow the contributes.settings contract', () => {
  assert.ok(settings.length > 0 && settings.length <= 32)
  const keys = new Set()
  for (const entry of settings) {
    assert.match(entry.key, /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/)
    assert.ok(!keys.has(entry.key), `duplicate ${entry.key}`)
    keys.add(entry.key)
    assert.ok(entry.title.length >= 1 && entry.title.length <= 64, entry.key)
    assert.ok((entry.description ?? '').length <= 512, entry.key)
    assert.ok(['string', 'boolean', 'enum', 'project'].includes(entry.type), entry.key)
    if (entry.type === 'project') {
      assert.equal(entry.default, undefined, `${entry.key}: project settings take no default`)
    }
    if (entry.placeholder !== undefined || entry.multiline !== undefined) {
      assert.equal(entry.type, 'string', `${entry.key}: placeholder and multiline need a string`)
    }
    if (entry.type === 'enum') {
      assert.ok(
        entry.options.some((option) => option.value === entry.default),
        entry.key
      )
    }
  }
})

test('every setting the plugin reads is declared, with the default the plugin applies', () => {
  assert.deepEqual(settings.map((entry) => entry.key).sort(), Object.keys(DEFAULT_SETTINGS).sort())
  for (const entry of settings) {
    assert.equal(entry.default ?? '', DEFAULT_SETTINGS[entry.key], entry.key)
  }
})

test('capabilities cover what the worker calls', () => {
  const kinds = manifest.capabilities.map((capability) => capability.kind).sort()
  assert.deepEqual(kinds, ['projects:read', 'settings:own', 'storage', 'tasks:provide'])
  assert.equal(manifest.publisher, 'georg-graf')
  assert.equal(manifest.author.name, 'Georg Graf')
})
