import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  defaultEditorInstallDir,
  editorExecutableFromLocation,
  findInstalledEditor,
  hubConfigDir,
  listInstalledEditorVersions
} from '../src/editor-install.mjs'

function context(platform, { files = {}, existing = [], dirs = {}, env = {}, home } = {}) {
  return {
    platform,
    env,
    home: home ?? (platform === 'win32' ? 'C:\\Users\\dev' : '/home/dev'),
    exists: async (path) => existing.includes(path),
    readText: async (path) => files[path] ?? null,
    listDir: async (path) => dirs[path] ?? []
  }
}

test('uses the Hub locations of each platform', () => {
  assert.equal(
    hubConfigDir(context('win32', { env: { APPDATA: 'D:\\Roaming' } })),
    'D:\\Roaming\\UnityHub'
  )
  assert.equal(hubConfigDir(context('win32')), 'C:\\Users\\dev\\AppData\\Roaming\\UnityHub')
  assert.equal(
    hubConfigDir(context('darwin', { home: '/Users/dev' })),
    '/Users/dev/Library/Application Support/UnityHub'
  )
  assert.equal(hubConfigDir(context('linux')), '/home/dev/.config/UnityHub')
  assert.equal(
    defaultEditorInstallDir(context('win32', { env: { PROGRAMFILES: 'E:\\Apps' } })),
    'E:\\Apps\\Unity\\Hub\\Editor'
  )
  assert.equal(
    defaultEditorInstallDir(context('win32', { env: { SYSTEMDRIVE: 'D:' } })),
    'D:\\Program Files\\Unity\\Hub\\Editor'
  )
  assert.equal(defaultEditorInstallDir(context('darwin')), '/Applications/Unity/Hub/Editor')
  assert.equal(defaultEditorInstallDir(context('linux')), '/home/dev/Unity/Hub/Editor')
})

test('finds a Hub-installed editor in the default install folder', async () => {
  const exe = 'C:\\Program Files\\Unity\\Hub\\Editor\\6000.0.23f1\\Editor\\Unity.exe'
  assert.equal(await findInstalledEditor('6000.0.23f1', context('win32', { existing: [exe] })), exe)
  assert.equal(await findInstalledEditor('2022.3.1f1', context('win32', { existing: [exe] })), null)
})

test('prefers Hub custom install folder and editors located by hand', async () => {
  const hub = 'C:\\Users\\dev\\AppData\\Roaming\\UnityHub'
  const custom = 'D:\\Editors\\2022.3.1f1\\Editor\\Unity.exe'
  const located = 'E:\\Unity 2021\\Editor\\Unity.exe'
  const ctx = context('win32', {
    files: {
      [`${hub}\\secondaryInstallPath.json`]: '"D:\\\\Editors"',
      [`${hub}\\editors-v2.json`]: JSON.stringify({
        schema_version: '2',
        data: [{ version: '2021.3.5f1', location: [located], manual: true }]
      })
    },
    existing: [custom, located]
  })
  assert.equal(await findInstalledEditor('2022.3.1f1', ctx), custom)
  assert.equal(await findInstalledEditor('2021.3.5f1', ctx), located)
})

test('accepts located editors given as an app bundle or folder', () => {
  assert.equal(
    editorExecutableFromLocation('/Volumes/Tools/Unity.app', 'darwin'),
    '/Volumes/Tools/Unity.app/Contents/MacOS/Unity'
  )
  assert.equal(editorExecutableFromLocation('E:\\U\\Editor', 'win32'), 'E:\\U\\Editor\\Unity.exe')
  assert.equal(editorExecutableFromLocation('/opt/u/Editor/Unity', 'linux'), '/opt/u/Editor/Unity')
})

test('ignores unreadable Hub settings', async () => {
  const hub = '/home/dev/.config/UnityHub'
  const exe = '/home/dev/Unity/Hub/Editor/6000.0.23f1/Editor/Unity'
  const ctx = context('linux', {
    files: { [`${hub}/editors-v2.json`]: '{not json', [`${hub}/secondaryInstallPath.json`]: '""' },
    existing: [exe]
  })
  assert.equal(await findInstalledEditor('6000.0.23f1', ctx), exe)
})

test('lists installed versions newest first', async () => {
  const ctx = context('darwin', {
    dirs: { '/Applications/Unity/Hub/Editor': ['2022.3.10f1', '6000.0.23f1', '2022.3.9f1'] }
  })
  assert.deepEqual(await listInstalledEditorVersions(ctx), [
    '6000.0.23f1',
    '2022.3.10f1',
    '2022.3.9f1'
  ])
})
