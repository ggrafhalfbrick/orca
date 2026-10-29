import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  resolveDeletableInWorkspace,
  resolveReadableInWorkspace
} from './perforce-workspace-real-path'

let base: string
let workspace: string
let outside: string

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), 'orca-p4-real-path-'))
  workspace = join(base, 'ws')
  outside = join(base, 'outside')
  await mkdir(join(workspace, 'src'), { recursive: true })
  await mkdir(outside)
  await writeFile(join(outside, 'notes.txt'), 'private')
  await writeFile(join(workspace, 'src', 'a.txt'), 'mine')
  // Why a junction: Windows creates one without elevation; other platforms make a plain link.
  await symlink(outside, join(workspace, 'link'), 'junction')
})

afterEach(async () => {
  await rm(base, { recursive: true, force: true })
})

describe('workspace paths resolved through links', () => {
  it('allows files whose real folder is inside the workspace', async () => {
    expect(await resolveDeletableInWorkspace(workspace, 'src/a.txt')).toMatch(/a\.txt$/)
    expect(await resolveReadableInWorkspace(workspace, 'src/a.txt')).toMatch(/a\.txt$/)
  })

  it('refuses to delete or read through a linked folder that leaves the workspace', async () => {
    await expect(resolveDeletableInWorkspace(workspace, 'link/notes.txt')).rejects.toThrow(
      'escapes the workspace'
    )
    expect(await resolveReadableInWorkspace(workspace, 'link/notes.txt')).toBeNull()
  })

  it('treats a missing folder as nothing to delete', async () => {
    expect(await resolveDeletableInWorkspace(workspace, 'gone/a.txt')).toBeNull()
  })
})
