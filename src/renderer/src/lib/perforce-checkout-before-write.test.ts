import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PerforceSaveBehavior } from '../../../shared/perforce/perforce-settings'
import {
  PERFORCE_EDIT_DECLINED_MESSAGE,
  checkoutPerforceFileBeforeWrite
} from './perforce-checkout-before-write'

type State = {
  behavior: PerforceSaveBehavior
  isPerforce: boolean
  readOnly: boolean
  calls: string[]
}

const state = vi.hoisted((): State => ({
  behavior: 'ask',
  isPerforce: true,
  readOnly: true,
  calls: []
}))

vi.mock('@/store', () => ({
  useAppStore: {
    getState: () => ({ settings: { perforce: { saveReadOnlyBehavior: state.behavior } } })
  }
}))
vi.mock('@/i18n/i18n', () => ({ translate: (_key: string, fallback: string) => fallback }))
vi.mock('./perforce-workspace-target', () => ({
  perforceTargetForFileContext: (context: { worktreePath: string }) =>
    state.isPerforce
      ? { settings: null, worktreeId: 'wt', worktreePath: context.worktreePath }
      : null
}))
vi.mock('../runtime/runtime-perforce-client', () => ({
  runPerforceOperation: async (
    _target: unknown,
    operation: string,
    params: { filePath: string }
  ) => {
    state.calls.push(`${operation}:${params.filePath}`)
    return operation === 'isReadOnlyFile' ? state.readOnly : undefined
  }
}))

const confirm = vi.fn()
const CONTEXT = { settings: null, worktreeId: 'wt', worktreePath: '/ws' }

beforeEach(() => {
  state.behavior = 'ask'
  state.isPerforce = true
  state.readOnly = true
  state.calls = []
  confirm.mockReset().mockReturnValue(true)
  vi.stubGlobal('window', { confirm })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('checkoutPerforceFileBeforeWrite', () => {
  it('asks, then opens a read-only Perforce file for edit before the write', async () => {
    await checkoutPerforceFileBeforeWrite(CONTEXT, '/ws/Assets/a.cs')
    expect(confirm).toHaveBeenCalledOnce()
    expect(state.calls).toEqual(['isReadOnlyFile:Assets/a.cs', 'checkoutIfReadOnly:Assets/a.cs'])
  })

  it('cancels the save when the user declines', async () => {
    confirm.mockReturnValue(false)
    await expect(checkoutPerforceFileBeforeWrite(CONTEXT, '/ws/a.cs')).rejects.toThrow(
      PERFORCE_EDIT_DECLINED_MESSAGE
    )
    expect(state.calls).toEqual(['isReadOnlyFile:a.cs'])
  })

  it('opens without asking when set to, and stays out of the way when set to never', async () => {
    state.behavior = 'auto'
    await checkoutPerforceFileBeforeWrite(CONTEXT, '/ws/a.cs')
    expect(confirm).not.toHaveBeenCalled()
    expect(state.calls).toContain('checkoutIfReadOnly:a.cs')
    state.calls = []
    state.behavior = 'never'
    await checkoutPerforceFileBeforeWrite(CONTEXT, '/ws/a.cs')
    expect(state.calls).toEqual([])
  })

  it('leaves writable files and non-Perforce workspaces alone', async () => {
    state.readOnly = false
    await checkoutPerforceFileBeforeWrite(CONTEXT, '/ws/a.cs')
    expect(state.calls).toEqual(['isReadOnlyFile:a.cs'])
    state.calls = []
    state.isPerforce = false
    await checkoutPerforceFileBeforeWrite(CONTEXT, '/ws/a.cs')
    expect(state.calls).toEqual([])
    expect(confirm).not.toHaveBeenCalled()
  })
})
