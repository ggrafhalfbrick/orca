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
  it('maps the folder through the client view and lists live head revisions there', async () => {
    replyTo({
      where: { stdout: '... depotFile //depot/main/docs/...\n... clientFile //ws/docs/...\n' },
      files: {
        stdout: [
          '... depotFile //depot/main/docs/a.md\n... rev 3\n... change 120\n... action edit\n',
          '... depotFile //depot/main/docs/old.md\n... rev 2\n... change 90\n... action delete\n',
          '... depotFile //depot/main/docs/sub/b.markdown\n... rev 1\n... change 130\n... action add\n'
        ].join('\n')
      }
    })

    await expect(listLatestMarkdownFiles('/ws', 'docs')).resolves.toEqual({
      depotRoot: '//depot/main/docs',
      files: [
        { depotFile: '//depot/main/docs/a.md', rev: 3, change: 120 },
        { depotFile: '//depot/main/docs/sub/b.markdown', rev: 1, change: 130 }
      ],
      truncated: false
    })
    expect(mocks.runP4).toHaveBeenCalledWith(['-ztag', 'where', 'docs/...'], { cwd: '/ws' })
    expect(mocks.runP4).toHaveBeenCalledWith(
      [
        '-ztag',
        'files',
        '-e',
        '//depot/main/docs/....md',
        '//depot/main/docs/....mdx',
        '//depot/main/docs/....markdown'
      ],
      { cwd: '/ws' }
    )
  })

  it('treats no markdown as an empty list and an unmapped folder as an error', async () => {
    replyTo({
      where: { stdout: '... depotFile //depot/main/docs/...\n' },
      files: { code: 1, stderr: '//depot/main/docs/....md - no such file(s).\n' }
    })
    await expect(listLatestMarkdownFiles('/ws', 'docs')).resolves.toMatchObject({ files: [] })

    replyTo({ where: { code: 1, stderr: 'docs/... - file(s) not in client view.\n' } })
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
