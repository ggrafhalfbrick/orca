import { describe, expect, it } from 'vitest'
import { buildLocalWorktreeCreateArgs } from './worktree-create-payload'

describe('worktree create payload', () => {
  it('sends the Perforce copy choice only when the composer set one', () => {
    const base = { repoId: 'repo-1', name: 'ws', setupDecision: 'inherit' as const }
    const attempt = { name: 'ws' }
    expect(buildLocalWorktreeCreateArgs(base, attempt).perforceCopy).toBeUndefined()
    const withCopy = buildLocalWorktreeCreateArgs(
      { ...base, options: { perforceCopy: { stream: { kind: 'same-stream' } } } },
      attempt
    )
    expect(withCopy.perforceCopy).toEqual({ stream: { kind: 'same-stream' } })
  })
})
