import { escapeP4FileArg, runP4 } from './p4-command'
import { parseTaggedOutput } from './p4-tagged-output'

/**
 * The newest submitted markdown under a workspace folder, read straight from the server: `p4 where`
 * maps the folder through the client view, `p4 files -e` lists head revisions there, and `p4 print`
 * reads chosen revisions without syncing anything. Runs wherever the workspace lives (desktop or relay).
 */

export const PERFORCE_LATEST_FILE_LIMIT = 20_000
export const PERFORCE_PRINT_FILE_LIMIT = 100
const PRINT_FILE_MAX_BYTES = 512 * 1024
const PRINT_ARGS_MAX_CHARS = 20_000
// Why: each p4 print pays a server round trip per file; ~12 parallel batches keep 100 files at a few seconds.
const PRINT_MAX_PARALLEL = 12
const PRINT_MIN_FILES_PER_BATCH = 8
const MARKDOWN_EXTENSIONS = ['md', 'mdx', 'markdown']

export type PerforceLatestFile = { depotFile: string; rev: number; change: number }
export type PerforceLatestFiles = {
  /** Depot path of the folder, e.g. `//depot/main/docs`. */
  depotRoot: string
  files: PerforceLatestFile[]
  truncated: boolean
}
export type PerforcePrintedFile =
  | { depotFile: string; rev: number; content: string }
  | { depotFile: string; rev: number; error: string }

function firstLine(text: string): string {
  return (
    text
      .split(/\r?\n/)
      .find((line) => line.trim())
      ?.trim() ?? ''
  )
}

/** Head revisions of markdown under `folder` (relative to `cwd`; '' for all of it). */
export async function listLatestMarkdownFiles(
  cwd: string,
  folder: string
): Promise<PerforceLatestFiles> {
  const where = await runP4(['-ztag', 'where', folder ? `${escapeP4FileArg(folder)}/...` : '...'], {
    cwd
  })
  const mapping = parseTaggedOutput(where.stdout).find(
    (record) => record.depotFile && !Object.hasOwn(record, 'unmap')
  )
  if (!mapping) {
    throw new Error(
      firstLine(where.stderr) || `${folder || 'This folder'} is not in the Perforce workspace view.`
    )
  }
  const depotRoot = mapping.depotFile.replace(/\/\.\.\.$/, '')
  const listed = await runP4(
    [
      '-ztag',
      'files',
      '-e',
      ...MARKDOWN_EXTENSIONS.map((extension) => `${depotRoot}/....${extension}`)
    ],
    { cwd }
  )
  // Why: an extension with no files fails its own argument but not the others.
  if (listed.code !== 0 && !listed.stdout.trim() && !/no such file/i.test(listed.stderr)) {
    throw new Error(firstLine(listed.stderr) || 'p4 files failed')
  }
  const files: PerforceLatestFile[] = []
  for (const record of parseTaggedOutput(listed.stdout)) {
    const rev = Number(record.rev)
    if (!record.depotFile?.startsWith(`${depotRoot}/`) || !Number.isInteger(rev) || rev < 1) {
      continue
    }
    if (/delete|purge|archive/.test(record.action ?? '')) {
      continue
    }
    if (files.length === PERFORCE_LATEST_FILE_LIMIT) {
      return { depotRoot, files, truncated: true }
    }
    files.push({ depotFile: record.depotFile, rev, change: Number(record.change) || 0 })
  }
  return { depotRoot, files, truncated: false }
}

const PRINT_HEADER = /^(\/\/[^\r\n#]+)#(\d+) - (\S+) change (\d+) \(([^)\r\n]*)\)$/

/** Splits non `-q` `p4 print` output; only the depot files asked for count as headers. */
export function splitP4PrintOutput(
  output: string,
  expected: ReadonlySet<string>
): { depotFile: string; rev: number; content: string }[] {
  const files: { depotFile: string; rev: number; content: string }[] = []
  let current: { depotFile: string; rev: number } | null = null
  let lines: string[] = []
  const flush = (): void => {
    if (current) {
      files.push({ ...current, content: lines.join('\n') })
    }
  }
  const rows = output.split('\n')
  if (rows.at(-1) === '') {
    rows.pop()
  }
  for (const raw of rows) {
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw
    const header = findPrintHeader(line, expected)
    if (!header) {
      if (current) {
        lines.push(line)
      }
      continue
    }
    // Why: a file without a trailing newline leaves its last line glued to the next header.
    if (header.index > 0 && current) {
      lines.push(line.slice(0, header.index))
    }
    flush()
    current = { depotFile: header.depotFile, rev: header.rev }
    lines = []
  }
  flush()
  return files
}

function findPrintHeader(
  line: string,
  expected: ReadonlySet<string>
): { index: number; depotFile: string; rev: number } | null {
  if (!line.endsWith(')') || !line.includes(' change ')) {
    return null
  }
  for (let index = line.indexOf('//'); index >= 0; index = line.indexOf('//', index + 1)) {
    const match = PRINT_HEADER.exec(line.slice(index))
    if (match && expected.has(match[1])) {
      return { index, depotFile: match[1], rev: Number(match[2]) }
    }
  }
  return null
}

/** `file#rev` argument batches under the command-line limit, spread over a few parallel prints. */
function printBatches(files: readonly PerforceLatestFile[]): PerforceLatestFile[][] {
  const groups: PerforceLatestFile[][] = Array.from(
    {
      length: Math.min(
        PRINT_MAX_PARALLEL,
        Math.max(1, Math.ceil(files.length / PRINT_MIN_FILES_PER_BATCH))
      )
    },
    () => []
  )
  files.forEach((file, index) => groups[index % groups.length].push(file))
  const batches: PerforceLatestFile[][] = []
  for (const group of groups) {
    let batch: PerforceLatestFile[] = []
    let chars = 0
    for (const file of group) {
      const length = file.depotFile.length + String(file.rev).length + 2
      if (batch.length > 0 && chars + length > PRINT_ARGS_MAX_CHARS) {
        batches.push(batch)
        batch = []
        chars = 0
      }
      batch.push(file)
      chars += length
    }
    if (batch.length > 0) {
      batches.push(batch)
    }
  }
  return batches
}

/** Reads each file at its revision; a file that does not come back carries an error. */
export async function printDepotFiles(
  cwd: string,
  files: readonly Pick<PerforceLatestFile, 'depotFile' | 'rev'>[]
): Promise<PerforcePrintedFile[]> {
  const wanted = files.map((file) => ({ ...file, change: 0 }))
  const printed = new Map<string, { rev: number; content: string }>()
  await Promise.all(
    printBatches(wanted).map(async (batch) => {
      const result = await runP4(
        ['print', ...batch.map((file) => `${file.depotFile}#${file.rev}`)],
        {
          cwd
        }
      )
      if (result.code !== 0 && !result.stdout) {
        throw new Error(firstLine(result.stderr) || 'p4 print failed')
      }
      const expected = new Set(batch.map((file) => file.depotFile))
      for (const file of splitP4PrintOutput(result.stdout, expected)) {
        printed.set(file.depotFile, { rev: file.rev, content: file.content })
      }
    })
  )
  return files.map((file) => {
    const found = printed.get(file.depotFile)
    if (!found || found.rev !== file.rev) {
      return {
        depotFile: file.depotFile,
        rev: file.rev,
        error: 'p4 print did not return this revision'
      }
    }
    return Buffer.byteLength(found.content) > PRINT_FILE_MAX_BYTES
      ? { depotFile: file.depotFile, rev: file.rev, error: 'file is larger than 512 KB' }
      : { depotFile: file.depotFile, rev: file.rev, content: found.content }
  })
}
