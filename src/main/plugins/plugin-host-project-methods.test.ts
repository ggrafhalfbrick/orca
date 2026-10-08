import { describe, expect, it, vi } from 'vitest'
import type { PluginCapabilityKind } from '../../shared/plugins/plugin-capabilities'
import { executePluginHostCall, type PluginHostServices } from './plugin-host-methods'

function services(projects: PluginHostServices['projects']): PluginHostServices {
  return {
    resolveActiveWorktreeContext: vi.fn().mockResolvedValue(null),
    listWorktreeTerminals: vi.fn().mockResolvedValue([]),
    sendTerminalText: vi.fn().mockResolvedValue({ accepted: true }),
    dispatchPluginNotification: vi.fn().mockResolvedValue({ delivered: true }),
    storage: { get: vi.fn(), set: vi.fn(), delete: vi.fn(), keys: vi.fn().mockReturnValue([]) },
    secrets: { get: vi.fn(), set: vi.fn(), delete: vi.fn() },
    settings: { getAll: vi.fn().mockReturnValue({}), set: vi.fn() },
    subscribeEvents: vi.fn().mockReturnValue([]),
    projects
  }
}

function projects(): PluginHostServices['projects'] {
  return {
    list: vi
      .fn()
      .mockResolvedValue([{ id: 'p', name: 'Notes', sourceControl: 'git', host: 'local' }]),
    listMarkdown: vi.fn().mockResolvedValue({
      revision: 'abc',
      files: [{ path: 'plans/a.md', version: 'f'.repeat(40) }],
      truncated: false
    }),
    readMarkdown: vi.fn().mockResolvedValue([{ path: 'plans/a.md', content: '# A' }])
  }
}

function call(method: string, params: unknown, granted: PluginCapabilityKind[], viaPanel = false) {
  const projectFiles = projects()
  const outcome = executePluginHostCall({
    pluginId: 'orca-samples.notes',
    method,
    params,
    viaPanel,
    grantedCapabilities: granted,
    services: services(projectFiles),
    audit: { record: vi.fn().mockResolvedValue(undefined) }
  })
  return { outcome, projectFiles }
}

describe('projects host methods', () => {
  it('need the projects:read capability and are not open to sandboxed panels', async () => {
    await expect(call('projects.list', {}, ['settings:own']).outcome).resolves.toMatchObject({
      ok: false,
      code: 'capability_denied'
    })
    await expect(call('projects.list', {}, ['projects:read'], true).outcome).resolves.toMatchObject(
      {
        ok: false,
        code: 'panel_forbidden'
      }
    )
  })

  it('lists projects and markdown, and reads files', async () => {
    await expect(call('projects.list', {}, ['projects:read']).outcome).resolves.toMatchObject({
      ok: true,
      value: { projects: [{ id: 'p', name: 'Notes' }] }
    })
    const listing = call(
      'projects.listMarkdown',
      { projectId: 'p', folder: 'plans', source: 'latest' },
      ['projects:read']
    )
    await expect(listing.outcome).resolves.toMatchObject({ ok: true, value: { revision: 'abc' } })
    expect(listing.projectFiles.listMarkdown).toHaveBeenCalledWith({
      projectId: 'p',
      folder: 'plans',
      source: 'latest'
    })
    await expect(
      call(
        'projects.readMarkdown',
        {
          projectId: 'p',
          source: 'latest',
          files: [{ path: 'plans/a.md', version: 'f'.repeat(40) }]
        },
        ['projects:read']
      ).outcome
    ).resolves.toMatchObject({
      ok: true,
      value: { files: [{ path: 'plans/a.md', content: '# A' }] }
    })
  })

  it.each(['../secrets', '/etc', 'C:/Users', 'plans\\a.md', 'plans/./a'])(
    'rejects the unsafe folder %j before reading anything',
    async (folder) => {
      const { outcome, projectFiles } = call(
        'projects.listMarkdown',
        { projectId: 'p', folder, source: 'disk' },
        ['projects:read']
      )
      await expect(outcome).resolves.toMatchObject({ ok: false, code: 'invalid_params' })
      expect(projectFiles.listMarkdown).not.toHaveBeenCalled()
    }
  )
})
