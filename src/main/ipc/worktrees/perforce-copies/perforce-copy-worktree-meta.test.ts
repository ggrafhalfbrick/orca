import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Repo } from '../../../../shared/repo-types'
import type { WorkspaceCopyListResult } from '../../../../shared/perforce/workspace-copy/workspace-copy-types'
import type { WorktreeMeta } from '../../../../shared/worktree/meta-types'
import type { Store } from '../../../persistence'
import { copyWorktreePath, syncCopyWorktrees } from './perforce-copy-worktree-meta'

const ROOT = join('D:', 'ws')
const COPIES = `${ROOT}.wt`
// oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the sync reads only these Repo fields.
const REPO = { id: 'repo-1', path: ROOT, kind: 'folder', displayName: 'ws' } as Repo

function memoryStore(initial: Record<string, Partial<WorktreeMeta>> = {}) {
  const meta: Record<string, Partial<WorktreeMeta>> = { ...initial }
  const store = {
    getWorktreeMeta: (id: string) => meta[id],
    getAllWorktreeMeta: () => meta,
    setWorktreeMeta: (id: string, patch: Partial<WorktreeMeta>) => {
      meta[id] = { ...meta[id], ...patch }
      return meta[id]
    },
    removeWorktreeMeta: (id: string) => {
      delete meta[id]
    }
  }
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: syncCopyWorktrees reads and writes worktree meta only.
  return { meta, store: store as unknown as Store }
}

function listing(
  copies: { name: string; folderExists: boolean; clientExists: boolean }[]
): WorkspaceCopyListResult {
  return {
    source: { client: 'ws_me', root: ROOT, stream: '//g/dev' },
    copiesDir: COPIES,
    serverChecked: true,
    copies: copies.map((copy) => ({
      ...copy,
      client: `ws_me_wt_${copy.name}`,
      copyRoot: join(COPIES, copy.name),
      stream: '//g/dev',
      mode: 'same-stream',
      markerExists: true,
      created: '2026-10-01T08:54:41.000Z',
      createdBy: null
    }))
  }
}

describe('syncCopyWorktrees', () => {
  it('adopts copies with a folder and a client as visible Orca workspaces', () => {
    const { meta, store } = memoryStore()
    const changed = syncCopyWorktrees(
      store,
      REPO,
      listing([
        { name: 'made-by-tool', folderExists: true, clientExists: true },
        { name: 'client-gone', folderExists: true, clientExists: false },
        { name: 'folder-gone', folderExists: false, clientExists: true }
      ])
    )
    expect(changed).toBe(true)
    const id = `repo-1::${join(COPIES, 'made-by-tool')}`
    expect(Object.keys(meta)).toEqual([id])
    expect(meta[id]).toMatchObject({
      displayName: 'made-by-tool',
      orcaCreationSource: 'desktop',
      perforceStream: '//g/dev'
    })
    expect(meta[id]?.createdAt).toBe(Date.parse('2026-10-01T08:54:41.000Z'))
  })

  it('maps a project below the client root to the same subfolder of the copy', () => {
    const repo = { ...REPO, path: join(ROOT, 'Game') }
    expect(copyWorktreePath(repo, ROOT, join(COPIES, 'copy-1'))).toBe(
      join(COPIES, 'copy-1', 'Game')
    )
    expect(copyWorktreePath(REPO, ROOT, join(COPIES, 'copy-1'))).toBe(join(COPIES, 'copy-1'))
  })

  it('reports no change when the sidebar already matches', () => {
    const id = `repo-1::${join(COPIES, 'copy-1')}`
    const { store } = memoryStore({ [id]: { displayName: 'copy-1', perforceStream: '//g/dev' } })
    expect(
      syncCopyWorktrees(
        store,
        REPO,
        listing([{ name: 'copy-1', folderExists: true, clientExists: true }])
      )
    ).toBe(false)
  })
})
