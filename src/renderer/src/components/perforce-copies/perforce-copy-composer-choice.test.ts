import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Repo } from '../../../../shared/repo-types'

const state: { repos: Repo[] } = { repos: [] }

vi.mock('@/store', () => ({ useAppStore: { getState: () => state } }))

import {
  readPerforceCopyComposerChoice,
  usePerforceCopyComposerChoiceStore
} from './perforce-copy-composer-choice'

function repo(id: string, patch: Partial<Repo>): Repo {
  return {
    id,
    path: `D:\\${id}`,
    displayName: id,
    badgeColor: '#888888',
    addedAt: 0,
    ...patch
  }
}

describe('readPerforceCopyComposerChoice', () => {
  beforeEach(() => {
    state.repos = [
      repo('git', {}),
      repo('folder', { kind: 'folder' }),
      repo('p4', { kind: 'folder', vcs: 'perforce' })
    ]
    usePerforceCopyComposerChoiceStore.setState({ byRepo: {} })
  })

  it('makes no copy outside a Perforce project', () => {
    expect(readPerforceCopyComposerChoice('git')).toBeUndefined()
    expect(readPerforceCopyComposerChoice('folder')).toBeUndefined()
    expect(readPerforceCopyComposerChoice('missing')).toBeUndefined()
  })

  it('gives a Perforce project a copy on a stream of its own by default', () => {
    expect(readPerforceCopyComposerChoice('p4')).toEqual({ stream: { kind: 'child' } })
  })

  it('uses the chosen base, and shares the folder when the drive cannot hold a copy', () => {
    const { setChoice } = usePerforceCopyComposerChoiceStore.getState()
    setChoice('p4', { stream: { kind: 'child', parent: '//TOTF2/dev' } })
    expect(readPerforceCopyComposerChoice('p4')).toEqual({
      stream: { kind: 'child', parent: '//TOTF2/dev' }
    })
    setChoice('p4', { ready: false })
    expect(readPerforceCopyComposerChoice('p4')).toBeUndefined()
  })
})
