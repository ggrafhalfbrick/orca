import assert from 'node:assert/strict'
import { join } from 'node:path'
import { test } from 'node:test'
import { parseProjectEditorVersion, readProjectEditorVersion } from '../src/project-version.mjs'

test('reads the editor version, not the revision line', () => {
  const text =
    'm_EditorVersion: 6000.0.23f1\r\nm_EditorVersionWithRevision: 6000.0.23f1 (1c4764c07fb4)\r\n'
  assert.equal(parseProjectEditorVersion(text), '6000.0.23f1')
  assert.equal(parseProjectEditorVersion('m_EditorVersionWithRevision: 1 (x)\n'), null)
})

test('reads ProjectSettings/ProjectVersion.txt under the project', async () => {
  let readPath = ''
  const version = await readProjectEditorVersion('/work/game', async (path) => {
    readPath = path
    return 'm_EditorVersion: 2022.3.10f1\n'
  })
  assert.equal(version, '2022.3.10f1')
  assert.equal(readPath, join('/work/game', 'ProjectSettings', 'ProjectVersion.txt'))
})

test('explains a missing or empty version file', async () => {
  const missing = Object.assign(new Error('nope'), { code: 'ENOENT' })
  await assert.rejects(
    readProjectEditorVersion('/work/game', async () => {
      throw missing
    }),
    /not a Unity project/
  )
  await assert.rejects(
    readProjectEditorVersion('/work/game', async () => 'm_Other: 1\n'),
    /does not name a Unity Editor version/
  )
})
