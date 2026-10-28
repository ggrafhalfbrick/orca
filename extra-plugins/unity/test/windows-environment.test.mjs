import assert from 'node:assert/strict'
import { test } from 'node:test'
import { applyRegistryEnvironment, readRegistryEnvironment } from '../src/windows-environment.mjs'

test('builds the signed-in environment the way Windows does', () => {
  const env = applyRegistryEnvironment(
    { PATH: 'C:\\orca\\only', SystemRoot: 'C:\\Windows', USERPROFILE: 'C:\\Users\\dev' },
    [
      { scope: 'user', name: 'Path', expand: true, value: '%USERPROFILE%\\.local\\bin' },
      { scope: 'user', name: 'TEMP', expand: true, value: '%USERPROFILE%\\Temp' },
      { scope: 'user', name: 'WWISEROOT', expand: false, value: 'C:\\Wwise' },
      { scope: 'user', name: 'TOOLS', expand: true, value: '%WWISEROOT%\\Tools;%MISSING%' },
      { scope: 'machine', name: 'Path', expand: true, value: '%SYSTEMROOT%\\system32;' },
      { scope: 'machine', name: 'USERNAME', expand: false, value: 'SYSTEM' },
      { scope: 'machine', name: 'TEMP', expand: true, value: '%SystemRoot%\\TEMP' },
      { scope: 'volatile', name: 'USERNAME', expand: false, value: 'dev' }
    ]
  )
  assert.equal(env.PATH, undefined)
  assert.equal(env.Path, 'C:\\Windows\\system32;C:\\Users\\dev\\.local\\bin')
  assert.equal(env.USERNAME, 'dev')
  assert.equal(env.TEMP, 'C:\\Users\\dev\\Temp')
  assert.equal(env.TOOLS, 'C:\\Wwise\\Tools;%MISSING%')
})

test('reads nothing when the registry cannot be read', async () => {
  const entry = { scope: 'user', name: 'WWISEROOT', expand: false, value: 'C:\\Wwise' }
  const runWith = (error, stdout) => (_file, _args, _options, done) => done(error, stdout)
  assert.deepEqual(
    await readRegistryEnvironment({}, runWith(null, `\uFEFF${JSON.stringify([entry])}`)),
    [entry]
  )
  assert.deepEqual(await readRegistryEnvironment({}, runWith(null, 'not json')), [])
  assert.deepEqual(await readRegistryEnvironment({}, runWith(new Error('timeout'), '')), [])
})
