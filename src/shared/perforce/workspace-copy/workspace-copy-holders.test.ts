import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createFakeCopyHost } from './__fixtures__/fake-copy-host'
import { FakePerforceServer } from './__fixtures__/fake-perforce-server'
import type { HostProcess } from './workspace-copy-host'
import { requireRemovalOptions } from './workspace-copy-arguments'
import { createWorkspaceCopy } from './workspace-copy-create'
import { previewWorkspaceCopyRemoval } from './workspace-copy-removal-preview'
import { removeWorkspaceCopy } from './workspace-copy-remove'

let base: string
let ws: string
let copyRoot: string
let server: FakePerforceServer
let processes: HostProcess[]

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), 'p4copy-holders-'))
  ws = join(base, 'ws')
  copyRoot = join(base, 'ws.wt', 'one')
  server = new FakePerforceServer()
  server.addStream('//s/main', { 'a.txt': 1 })
  server.addSyncedClient('src', ws, '//s/main')
  await mkdir(ws, { recursive: true })
  await writeFile(join(ws, 'p4config.txt'), 'P4PORT=srv:1666\nP4CLIENT=src\n')
  processes = []
})

afterEach(async () => {
  await rm(base, { recursive: true, force: true })
})

async function copyWithHolders() {
  const host = createFakeCopyHost(server, base, { processes })
  await createWorkspaceCopy(host, ws, { name: 'one' })
  processes.push(
    {
      pid: 10,
      name: 'glider.exe',
      commandLine: `glider.exe --workspace ${join(copyRoot, 'Game')}`,
      startedAt: 1000
    },
    {
      pid: 11,
      name: 'Unity.exe',
      // Unity's workers spell the path with forward slashes.
      commandLine: `Unity.exe -projectPath "${copyRoot.replaceAll('\\', '/')}/Game"`,
      startedAt: 2000
    },
    { pid: 12, name: 'other.exe', commandLine: `other.exe ${copyRoot}0`, startedAt: 3000 }
  )
  return host
}

describe('programs holding a copy', () => {
  it('lists them and refuses the delete until the user agrees to end them', async () => {
    const host = await copyWithHolders()
    const preview = await previewWorkspaceCopyRemoval(host, ws, 'one')
    expect(preview.holders?.map((holder) => holder.pid)).toEqual([10, 11])
    expect(preview.blockers.holders).toBe(true)
    expect(preview.processesHoldingFolder).toEqual(['glider.exe (pid 10)', 'Unity.exe (pid 11)'])

    await expect(removeWorkspaceCopy(host, ws, 'one')).rejects.toThrow(/still have .* open/)
    expect(server.client('src_wt_one')).toBeDefined()
    expect(host.endedPids).toEqual([])

    const removed = await removeWorkspaceCopy(
      host,
      ws,
      'one',
      {
        endHolders: [
          { pid: 10, startedAt: 1000 },
          { pid: 11, startedAt: 2000 }
        ]
      },
      { awaitFolderDeletion: true }
    )
    expect(host.endedPids).toEqual([10, 11])
    expect(removed.clientDeleted).toBe(true)
    expect(existsSync(copyRoot)).toBe(false)
    expect(processes.map((p) => p.pid)).toEqual([12])
  })

  it('ends only the programs the user was shown', async () => {
    const host = await copyWithHolders()
    // Unity's pid now belongs to a process that started later.
    await expect(
      removeWorkspaceCopy(host, ws, 'one', {
        endHolders: [
          { pid: 10, startedAt: 1000 },
          { pid: 11, startedAt: 1999 }
        ]
      })
    ).rejects.toThrow(/Unity\.exe \(pid 11\) still has .* open/)
    expect(host.endedPids).toEqual([])
    expect(server.client('src_wt_one')).toBeDefined()
  })

  it('reads the consent from IPC arguments and drops malformed entries', () => {
    expect(
      requireRemovalOptions({
        endHolders: [{ pid: 5, startedAt: 7 }, { pid: -1 }, 'x', { pid: 6 }]
      }).endHolders
    ).toEqual([
      { pid: 5, startedAt: 7 },
      { pid: 6, startedAt: null }
    ])
    expect(requireRemovalOptions({}).endHolders).toBeUndefined()
  })
})
