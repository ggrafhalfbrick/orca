import { describe, expect, it } from 'vitest'
import {
  structuredAgentPermissionModeReport,
  type StructuredAgentPermissionMode
} from './structured-agent-permission-modes'

// Any provider's catalog: the helper knows no agent's vocabulary.
const CATALOG: readonly StructuredAgentPermissionMode[] = [
  { id: 'ask', label: 'Ask', description: 'Ask before each action' },
  { id: 'edits', label: 'Accept edits' },
  { id: 'unrestricted', label: 'Unrestricted', needsLaunchGrant: true }
]

describe('structured agent permission modes', () => {
  it('offers a mode needing a launch grant only where the launch gave it', () => {
    const granted = structuredAgentPermissionModeReport(CATALOG, {
      current: 'unrestricted',
      launchGranted: true,
      confirmed: true
    })
    const ungranted = structuredAgentPermissionModeReport(CATALOG, {
      current: 'ask',
      launchGranted: false,
      confirmed: false
    })

    expect(granted.modes.map((mode) => mode.id)).toEqual(['ask', 'edits', 'unrestricted'])
    expect(ungranted).toEqual({
      current: 'ask',
      modes: [
        { id: 'ask', label: 'Ask', description: 'Ask before each action' },
        { id: 'edits', label: 'Accept edits' }
      ],
      confirmed: false
    })
  })

  it('keeps the provider-side grant marker off the wire', () => {
    const { modes } = structuredAgentPermissionModeReport(CATALOG, {
      current: 'ask',
      launchGranted: true,
      confirmed: false
    })

    expect(modes.find((mode) => mode.id === 'unrestricted')).toEqual({
      id: 'unrestricted',
      label: 'Unrestricted'
    })
  })
})
