import assert from 'node:assert/strict'
import { test } from 'node:test'
import { commandLinesOpenProject, isProjectOpenInEditor } from '../src/editor-running.mjs'

function failingOpen(code) {
  return async () => {
    throw Object.assign(new Error(code), { code })
  }
}

test('Windows: a held lockfile means the project is open', async () => {
  const check = (openFile) => isProjectOpenInEditor('D:\\game', { platform: 'win32', openFile })
  assert.equal(await check(failingOpen('EBUSY')), true)
  assert.equal(await check(failingOpen('ENOENT')), false)
  assert.equal(await check(async () => ({ close: async () => {} })), false)
})

test('macOS and Linux: matches the editor process started on the project', () => {
  const lines = [
    '/Applications/Unity/Hub/Editor/6000.0.23f1/Unity.app/Contents/MacOS/Unity -projectpath /Users/dev/My Game -useHub -hubIPC',
    '/usr/bin/zsh'
  ]
  assert.equal(commandLinesOpenProject(lines, '/Users/dev/My Game', 'darwin'), true)
  assert.equal(commandLinesOpenProject(lines, '/users/dev/my game/', 'darwin'), true)
  assert.equal(commandLinesOpenProject(lines, '/Users/dev/My', 'darwin'), false)
  assert.equal(
    commandLinesOpenProject(
      ['/home/dev/Unity/Hub/Editor/2022.3.1f1/Editor/Unity -projectPath /home/dev/game'],
      '/home/dev/Game',
      'linux'
    ),
    false
  )
})

test('macOS and Linux: asks the process list', async () => {
  const open = await isProjectOpenInEditor('/home/dev/game', {
    platform: 'linux',
    listProcesses: async () => [
      '/opt/Unity/Editor/Unity -batchMode -projectPath /home/dev/game -logFile x'
    ]
  })
  assert.equal(open, true)
})
