import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { test } from 'node:test'
import { editorEnvironment, launchEditor, missingDisplayError } from '../src/editor-launch.mjs'

test('drops the worker-only variables that make Electron apps run as Node', () => {
  const env = editorEnvironment(
    { PATH: '/bin', ELECTRON_RUN_AS_NODE: '1', NODE_OPTIONS: '-r x' },
    'linux'
  )
  assert.deepEqual(env, { PATH: '/bin' })
})

test('restores Windows folder variables the worker omits', () => {
  const env = editorEnvironment(
    { USERPROFILE: 'C:\\Users\\dev', SYSTEMDRIVE: 'C:', ProgramFiles: 'D:\\PF' },
    'win32'
  )
  assert.equal(env.APPDATA, 'C:\\Users\\dev\\AppData\\Roaming')
  assert.equal(env.LOCALAPPDATA, 'C:\\Users\\dev\\AppData\\Local')
  assert.equal(env.PROGRAMDATA, 'C:\\ProgramData')
  assert.equal(env.ALLUSERSPROFILE, 'C:\\ProgramData')
  assert.equal(env.ProgramFiles, 'D:\\PF')
  assert.equal(env.PROGRAMFILES, undefined)
  assert.equal(env.COMMONPROGRAMFILES, 'D:\\PF\\Common Files')
  assert.equal(env.PUBLIC, 'C:\\Users\\Public')
  assert.equal(env.OS, 'Windows_NT')
})

test('derives ALLUSERSPROFILE from PROGRAMDATA in any casing and keeps an existing one', () => {
  assert.equal(
    editorEnvironment({ SystemDrive: 'C:', ProgramData: 'E:\\Data' }, 'win32').ALLUSERSPROFILE,
    'E:\\Data'
  )
  const env = editorEnvironment(
    { SYSTEMDRIVE: 'C:', AllUsersProfile: 'F:\\All', PROGRAMDATA: 'E:\\Data' },
    'win32'
  )
  assert.equal(env.AllUsersProfile, 'F:\\All')
  assert.equal(env.ALLUSERSPROFILE, undefined)
})

test('requires a display on Linux only', () => {
  assert.match(missingDisplayError({}, 'linux'), /display/)
  assert.equal(missingDisplayError({ WAYLAND_DISPLAY: 'wayland-0' }, 'linux'), null)
  assert.equal(missingDisplayError({}, 'win32'), null)
})

function fakeChild() {
  const child = new EventEmitter()
  child.unref = () => {
    child.unrefed = true
  }
  return child
}

test('starts the editor detached on the project and lets it outlive the worker', async () => {
  const child = fakeChild()
  let call
  const started = launchEditor('/opt/Unity', '/work/game', {
    env: { PATH: '/bin', ELECTRON_RUN_AS_NODE: '1' },
    platform: 'linux',
    spawnProcess: (...args) => {
      call = args
      queueMicrotask(() => child.emit('spawn'))
      return child
    }
  })
  await started
  assert.deepEqual(call[0], '/opt/Unity')
  assert.deepEqual(call[1], ['-projectPath', '/work/game'])
  assert.equal(call[2].detached, true)
  assert.equal(call[2].stdio, 'ignore')
  assert.deepEqual(call[2].env, { PATH: '/bin' })
  assert.equal(child.unrefed, true)
})

test('gives the editor the variables from the Windows registry, as Unity Hub has them', async () => {
  const child = fakeChild()
  let call
  await launchEditor('C:\\Unity.exe', 'C:\\work\\game', {
    env: { PATH: 'C:\\Windows', SYSTEMDRIVE: 'C:', ELECTRON_RUN_AS_NODE: '1' },
    platform: 'win32',
    readRegistry: async () => [
      { scope: 'user', name: 'WWISEROOT', expand: false, value: 'C:\\Wwise' }
    ],
    spawnProcess: (...args) => {
      call = args
      queueMicrotask(() => child.emit('spawn'))
      return child
    }
  })
  assert.equal(call[2].env.WWISEROOT, 'C:\\Wwise')
  assert.equal(call[2].env.ALLUSERSPROFILE, 'C:\\ProgramData')
  assert.equal(call[2].env.ELECTRON_RUN_AS_NODE, undefined)
})

test('reports a failed start', async () => {
  const child = fakeChild()
  const started = launchEditor('/missing/Unity', '/work/game', {
    env: {},
    platform: 'linux',
    spawnProcess: () => {
      queueMicrotask(() => child.emit('error', new Error('spawn ENOENT')))
      return child
    }
  })
  await assert.rejects(started, /ENOENT/)
})
