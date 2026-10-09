import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as P4Command from './p4-command'

const mocks = vi.hoisted(() => ({ runP4: vi.fn() }))
vi.mock('./p4-command', async (importOriginal) => ({
  ...(await importOriginal<typeof P4Command>()),
  runP4: mocks.runP4
}))

import {
  listLatestMarkdownFiles,
  printDepotFiles,
  splitP4PrintOutput
} from './perforce-latest-files'

type Reply = { code?: number; stdout?: string; stderr?: string }
function replyTo(byCommand: Record<string, Reply>): void {
  mocks.runP4.mockImplementation(async (args: string[]) => {
    const command = args.find((arg) => !arg.startsWith('-')) ?? ''
    const reply = byCommand[command] ?? {}
    return { code: reply.code ?? 0, stdout: reply.stdout ?? '', stderr: reply.stderr ?? '' }
  })
}

beforeEach(() => {
  mocks.runP4.mockReset()
})

describe('listLatestMarkdownFiles', () => {
  const fstatRecord = (fields: Record<string, string | number>): string =>
    Object.entries(fields)
      .map(([key, value]) => `... ${key} ${value}\n`)
      .join('')

  it('lists live head revisions where the client view puts them, components included', async () => {
    replyTo({
      fstat: {
        stdout: [
          fstatRecord({
            depotFile: '//depot/main/docs/a.md',
            clientFile: '/ws/docs/a.md',
            headRev: 3,
            headChange: 120,
            headAction: 'edit'
          }),
          fstatRecord({
            depotFile: '//depot/main/docs/old.md',
            clientFile: '/ws/docs/old.md',
            headRev: 2,
            headChange: 90,
            headAction: 'delete'
          }),
          // Opened for add, never submitted: no head revision on the server.
          fstatRecord({ depotFile: '//depot/main/docs/new.md', clientFile: '/ws/docs/new.md' }),
          // A stream component maps another depot under the same folder; the view's later line wins.
          fstatRecord({
            depotFile: '//notes/component/b.markdown',
            clientFile: '/ws/docs/sub/b.markdown',
            headRev: 1,
            headChange: 130,
            headAction: 'add'
          })
        ].join('\n')
      }
    })

    await expect(listLatestMarkdownFiles('/ws', 'docs')).resolves.toEqual({
      files: [
        { path: 'docs/a.md', depotFile: '//depot/main/docs/a.md', rev: 3, change: 120 },
        {
          path: 'docs/sub/b.markdown',
          depotFile: '//notes/component/b.markdown',
          rev: 1,
          change: 130
        }
      ],
      truncated: false
    })
    expect(mocks.runP4).toHaveBeenCalledWith(
      [
        '-ztag',
        'fstat',
        '-T',
        'depotFile,clientFile,headRev,headChange,headAction',
        'docs/....md',
        'docs/....mdx',
        'docs/....markdown'
      ],
      { cwd: '/ws' }
    )
  })

  it('places files relative to a Windows workspace folder', async () => {
    replyTo({
      fstat: {
        stdout: fstatRecord({
          depotFile: '//notes/vault/plan.md',
          clientFile: 'D:\\ws\\agents\\vault\\plan.md',
          headRev: 4,
          headChange: 7,
          headAction: 'edit'
        })
      }
    })

    await expect(listLatestMarkdownFiles('D:\\ws', 'agents/vault')).resolves.toMatchObject({
      files: [{ path: 'agents/vault/plan.md', depotFile: '//notes/vault/plan.md' }]
    })
  })

  it('treats no markdown as an empty list and a folder outside the view as an error', async () => {
    replyTo({
      fstat: { stderr: 'docs/....md - no such file(s).\ndocs/....mdx - no such file(s).\n' }
    })
    await expect(listLatestMarkdownFiles('/ws', 'docs')).resolves.toMatchObject({ files: [] })

    replyTo({ fstat: { code: 1, stderr: 'docs/....md - file(s) not in client view.\n' } })
    await expect(listLatestMarkdownFiles('/ws', 'docs')).rejects.toThrow(/not in client view/)
  })
})

describe('splitP4PrintOutput', () => {
  const expected = new Set(['//depot/a.md', '//depot/b.md'])

  it('splits on the files asked for, even when a file has no trailing newline', () => {
    const output = [
      '//depot/a.md#3 - edit change 120 (text)',
      '# A',
      'last line//depot/b.md#1 - add change 130 (text)',
      '# B',
      '//depot/other.md#9 - edit change 1 (text)',
      ''
    ].join('\n')

    expect(splitP4PrintOutput(output, expected)).toEqual([
      { depotFile: '//depot/a.md', rev: 3, content: '# A\nlast line' },
      {
        depotFile: '//depot/b.md',
        rev: 1,
        content: '# B\n//depot/other.md#9 - edit change 1 (text)'
      }
    ])
  })
})

describe('printDepotFiles', () => {
  it('prints the revisions asked for and reports ones that did not come back', async () => {
    replyTo({ print: { stdout: '//depot/a.md#3 - edit change 120 (text)\n# A\n' } })

    await expect(
      printDepotFiles('/ws', [
        { depotFile: '//depot/a.md', rev: 3 },
        { depotFile: '//depot/b.md', rev: 2 }
      ])
    ).resolves.toEqual([
      { depotFile: '//depot/a.md', rev: 3, content: '# A' },
      { depotFile: '//depot/b.md', rev: 2, error: 'p4 print did not return this revision' }
    ])
    expect(mocks.runP4.mock.calls.flatMap(([args]) => args)).toEqual(
      expect.arrayContaining(['//depot/a.md#3', '//depot/b.md#2'])
    )
  })
})
