import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, open, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createFakeCopyHost } from './__fixtures__/fake-copy-host'
import { FakePerforceServer } from './__fixtures__/fake-perforce-server'
import { createWorkspaceCopy } from './workspace-copy-create'
import { removeWorkspaceCopy } from './workspace-copy-remove'

let base: string
let ws: string
let server: FakePerforceServer

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), 'p4copy-lock-'))
  ws = join(base, 'ws')
  server = new FakePerforceServer()
  server.addStream('//s/main', { 'a.txt': 1 })
  server.addSyncedClient('src', ws, '//s/main')
  await mkdir(ws, { recursive: true })
  await writeFile(join(ws, 'p4config.txt'), 'P4PORT=srv:1666\nP4CLIENT=src\n')
})

afterEach(async () => {
  await rm(base, { recursive: true, force: true })
})

// Windows will not move a folder while a file in it is open, as it is for a moment after Orca stops
// the copy's terminals and agent sessions.
describe.runIf(process.platform === 'win32')('removeWorkspaceCopy with the copy held open', () => {
  it('waits for a just-stopped program to let go of the copy', async () => {
    const host = createFakeCopyHost(server, base)
    await createWorkspaceCopy(host, ws, { name: 'one' })
    const held = await open(join(base, 'ws.wt', 'one', 'a.txt'), 'r')
    const release = setTimeout(() => void held.close(), 500)
    try {
      const removed = await removeWorkspaceCopy(host, ws, 'one', {}, { awaitFolderDeletion: true })
      expect(removed).toMatchObject({ clientDeleted: true, folderDeleted: true })
      expect(existsSync(join(base, 'ws.wt', 'one'))).toBe(false)
    } finally {
      clearTimeout(release)
      await held.close().catch(() => {})
    }
  })

  it('refuses without touching Perforce while the copy stays held', async () => {
    const host = createFakeCopyHost(server, base)
    await createWorkspaceCopy(host, ws, { name: 'one' })
    const held = await open(join(base, 'ws.wt', 'one', 'a.txt'), 'r')
    try {
      await expect(removeWorkspaceCopy(host, ws, 'one')).rejects.toThrow(/Nothing was changed/)
      expect(server.client('src_wt_one')).toBeDefined()
      expect(existsSync(join(base, 'ws.wt', 'one', 'a.txt'))).toBe(true)
    } finally {
      await held.close()
    }
  }, 20_000)
})
