import { describe, expect, it } from 'vitest'
import type { AgentSessionOptionsResult } from './agent-session-wire'
import { AGENT_SESSION_PERMISSION_MODE_KEY } from './agent-session-permission-mode'
import { CODEX_SESSION_OPTION_CATALOG } from './agent-session-option-catalog-claude-codex'
import { buildNativeChatSessionOptionSnapshot } from './native-chat-session-option-snapshot'
import { createNativeChatSessionOptionRecord } from './native-chat-session-option-state'
import {
  applyStructuredAgentSessionOptions,
  canSetStructuredAgentSessionOption,
  commitStructuredAgentSessionOptionValues,
  createStructuredAgentSessionOptionState,
  structuredAgentSessionOptionSnapshot,
  structuredAgentSessionOptionView
} from './structured-agent-session-options'

function viewModel(...args: Parameters<typeof structuredAgentSessionOptionView>) {
  const model = structuredAgentSessionOptionSnapshot(
    structuredAgentSessionOptionView(...args)
  ).find((descriptor) => descriptor.id === 'model')
  return model?.kind.type === 'select' ? model.kind.currentValue : undefined
}

describe('structured agent session options', () => {
  it('projects native Codex selects while bridge Codex keeps its agent picker', () => {
    const state = applyStructuredAgentSessionOptions(
      createStructuredAgentSessionOptionState('codex'),
      CODEX_SESSION_OPTION_CATALOG,
      {
        models: [
          {
            id: 'account-model',
            label: 'Account Model',
            isDefault: true,
            defaultEffort: 'medium',
            efforts: [
              { value: 'medium', label: 'Medium' },
              { value: 'high', label: 'High' }
            ]
          }
        ],
        current: { model: 'account-model', effort: 'medium' }
      }
    )

    const structured = structuredAgentSessionOptionSnapshot(state)
    expect(structured.map((descriptor) => descriptor.id)).toEqual(['model', 'effort'])
    expect(structured[0]).toMatchObject({
      settable: true,
      kind: { type: 'select', currentValue: 'account-model' }
    })
    expect(structured[0]).not.toHaveProperty('action')
    expect(structured[1]).toMatchObject({
      settable: true,
      kind: { type: 'select', currentValue: 'medium' }
    })

    const bridgeRecord = createNativeChatSessionOptionRecord('codex')
    bridgeRecord.model = { value: 'gpt-5.6-sol', source: 'reported' }
    const bridge = buildNativeChatSessionOptionSnapshot({
      catalog: CODEX_SESSION_OPTION_CATALOG,
      models: CODEX_SESSION_OPTION_CATALOG.models,
      record: bridgeRecord,
      mode: 'live',
      modelLabel: 'Model',
      liveTransport: 'catalog'
    })
    // Same catalog, same `dispatched` vocabulary — only the transport separates them.
    expect(structured.every((descriptor) => descriptor.transport === 'agent-session')).toBe(true)
    expect(bridge.every((descriptor) => descriptor.transport === 'catalog')).toBe(true)
    expect(bridge[0]).toMatchObject({ action: { type: 'agent-picker' } })
    expect(bridge.find((descriptor) => descriptor.id === 'effort')).toMatchObject({
      action: { type: 'agent-picker' }
    })
  })

  it('uses provider-scoped models and retains the current unknown id', () => {
    const state = applyStructuredAgentSessionOptions(
      createStructuredAgentSessionOptionState('codex'),
      CODEX_SESSION_OPTION_CATALOG,
      {
        models: [
          {
            id: 'account-model',
            label: 'Account Model',
            isDefault: false,
            efforts: []
          }
        ],
        current: { model: 'persisted-unknown' }
      }
    )
    const model = structuredAgentSessionOptionSnapshot(state)[0]
    expect(
      model.kind.type === 'select' ? model.kind.choices.map((choice) => choice.value) : []
    ).toEqual(['account-model', 'persisted-unknown'])
    expect(model.kind.type === 'select' ? model.kind.currentValue : null).toBe('persisted-unknown')
  })

  it('projects live options as directly settable descriptors', () => {
    const state = applyStructuredAgentSessionOptions(
      createStructuredAgentSessionOptionState('codex'),
      CODEX_SESSION_OPTION_CATALOG,
      {
        models: [
          {
            id: 'account-model',
            label: 'Account Model',
            isDefault: true,
            defaultEffort: 'medium',
            efforts: [
              { value: 'medium', label: 'Medium' },
              { value: 'high', label: 'High' }
            ]
          }
        ],
        current: { model: 'account-model', effort: 'medium' }
      }
    )

    const snapshot = structuredAgentSessionOptionSnapshot(state)
    expect(snapshot.map((descriptor) => descriptor.id)).toEqual(['model', 'effort'])
    expect(snapshot.every((descriptor) => descriptor.settable)).toBe(true)
    expect(snapshot.every((descriptor) => descriptor.action === undefined)).toBe(true)
  })

  it('projects Fast mode only from positive session and model capability', () => {
    const supported = applyStructuredAgentSessionOptions(
      createStructuredAgentSessionOptionState('codex'),
      CODEX_SESSION_OPTION_CATALOG,
      {
        models: [
          {
            id: 'account-model',
            label: 'Account Model',
            isDefault: true,
            efforts: [],
            supportsFastMode: true
          }
        ],
        fastModeSupport: { supported: true },
        current: { model: 'account-model', fastMode: false, confirmed: ['fastMode'] }
      }
    )
    expect(structuredAgentSessionOptionSnapshot(supported)).toContainEqual(
      expect.objectContaining({
        id: 'fastMode',
        kind: { type: 'boolean', currentValue: false },
        valueSource: 'reported',
        settable: true
      })
    )

    const absent = applyStructuredAgentSessionOptions(supported, CODEX_SESSION_OPTION_CATALOG, {
      models: [
        {
          id: 'account-model',
          label: 'Account Model',
          isDefault: true,
          efforts: [],
          supportsFastMode: true
        }
      ],
      current: { model: 'account-model' }
    })
    expect(structuredAgentSessionOptionSnapshot(absent).map(({ id }) => id)).toEqual(['model'])
    expect(absent.record.valuesByModel['account-model']?.fastMode).toBeUndefined()
  })

  it('renders Fast off but marked unreported when support is known and no value is', () => {
    const state = applyStructuredAgentSessionOptions(
      createStructuredAgentSessionOptionState('codex'),
      CODEX_SESSION_OPTION_CATALOG,
      {
        models: [
          {
            id: 'account-model',
            label: 'Account Model',
            isDefault: true,
            efforts: [],
            supportsFastMode: true
          }
        ],
        fastModeSupport: { supported: true },
        current: { model: 'account-model' }
      }
    )

    // The switch has no third position, so the value resolves to the catalog's
    // own `false`. `unknown` is what stops any surface calling that a default:
    // `default` is unreachable in this lane (it is hardcoded `mode: 'live'`), and
    // nothing here has reported the tier the thread is actually routing.
    expect(structuredAgentSessionOptionSnapshot(state)).toContainEqual(
      expect.objectContaining({
        id: 'fastMode',
        kind: { type: 'boolean', currentValue: false },
        valueSource: 'unknown'
      })
    )
  })

  it('shows the launch seed until the record names a model, and held picks over both', () => {
    const seeded = createStructuredAgentSessionOptionState('codex', CODEX_SESSION_OPTION_CATALOG)
    const seed = { model: 'gpt-5.5' }
    expect(viewModel(seeded, seed, {})).toBe('gpt-5.5')
    // A model outside the static list still gets a labelled row.
    expect(viewModel(seeded, { model: 'gpt-next' }, {})).toBe('gpt-next')
    // Derived only: the record itself never takes the seed.
    expect(seeded.record.model).toBeUndefined()
    const live = applyStructuredAgentSessionOptions(seeded, CODEX_SESSION_OPTION_CATALOG, {
      models: [{ id: 'gpt-5.6-luna', label: 'GPT-5.6 Luna', isDefault: true, efforts: [] }],
      current: { model: 'gpt-5.6-luna', confirmed: ['model'] }
    })
    expect(viewModel(live, seed, {})).toBe('gpt-5.6-luna')
    expect(viewModel(live, seed, { model: 'gpt-5.5' })).toBe('gpt-5.5')
    expect(live.record.model?.value).toBe('gpt-5.6-luna')
  })
})

describe('structured agent session permission mode', () => {
  // Deliberately not Claude's vocabulary: the client knows no provider's modes.
  const SANDBOX_MODES = [
    { id: 'read-only', label: 'Read only', description: 'Look, never touch' },
    { id: 'workspace', label: 'Workspace', description: 'Edit inside the workspace' },
    { id: 'full', label: 'Full access' }
  ]
  const reported = (
    permissionMode?: AgentSessionOptionsResult['permissionMode']
  ): AgentSessionOptionsResult => ({
    models: [{ id: 'model-a', label: 'Model A', isDefault: true, efforts: [] }],
    ...(permissionMode ? { permissionMode } : {}),
    current: { model: 'model-a' }
  })
  const apply = (result: AgentSessionOptionsResult) =>
    applyStructuredAgentSessionOptions(
      createStructuredAgentSessionOptionState('codex'),
      CODEX_SESSION_OPTION_CATALOG,
      result
    )
  const permissionDescriptor = (state: ReturnType<typeof apply>) =>
    structuredAgentSessionOptionSnapshot(state).find(
      (descriptor) => descriptor.id === AGENT_SESSION_PERMISSION_MODE_KEY
    )

  it("renders any provider's modes in its own words", () => {
    const state = apply(reported({ current: 'workspace', modes: SANDBOX_MODES, confirmed: true }))

    expect(permissionDescriptor(state)).toMatchObject({
      category: 'mode',
      settable: true,
      valueSource: 'reported',
      kind: {
        type: 'select',
        currentValue: 'workspace',
        choices: [
          { value: 'read-only', label: 'Read only', description: 'Look, never touch' },
          { value: 'workspace', label: 'Workspace', description: 'Edit inside the workspace' },
          { value: 'full', label: 'Full access' }
        ]
      }
    })
    expect(
      canSetStructuredAgentSessionOption(state, AGENT_SESSION_PERMISSION_MODE_KEY, 'full')
    ).toBe(true)
    expect(
      canSetStructuredAgentSessionOption(state, AGENT_SESSION_PERMISSION_MODE_KEY, 'bypass')
    ).toBe(false)
  })

  it('drops a mode a newer host describes in a shape this client cannot render', () => {
    const malformed: unknown[] = [{ id: 'nameless' }, 'full', null, ...SANDBOX_MODES]
    const state = apply(
      // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: models a host whose report this client's types do not describe.
      reported({ current: 'full', modes: malformed as typeof SANDBOX_MODES, confirmed: false })
    )
    const descriptor = permissionDescriptor(state)

    expect(
      descriptor?.kind.type === 'select' && descriptor.kind.choices.map((choice) => choice.value)
    ).toEqual(['read-only', 'workspace', 'full'])
  })

  it('offers nothing from a host or provider that reports no modes', () => {
    expect(permissionDescriptor(apply(reported()))).toBeUndefined()
    expect(
      permissionDescriptor(apply(reported({ current: 'x', modes: [], confirmed: false })))
    ).toBeUndefined()
  })

  it('shows a committed pick before the next read confirms it', () => {
    const state = apply(reported({ current: 'read-only', modes: SANDBOX_MODES, confirmed: false }))

    const committed = commitStructuredAgentSessionOptionValues(state, {
      [AGENT_SESSION_PERMISSION_MODE_KEY]: 'workspace'
    })

    expect(permissionDescriptor(committed)).toMatchObject({
      valueSource: 'dispatched',
      kind: { currentValue: 'workspace' }
    })
  })
})
