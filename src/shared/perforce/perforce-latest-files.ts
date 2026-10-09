import { relativePathInsideRoot } from '../cross-platform-path'
import { escapeP4FileArg, runP4 } from './p4-command'
import { parseTaggedOutput } from './p4-tagged-output'

/**
 * The newest submitted markdown under a workspace folder, read straight from the server: `p4 fstat`
 * on the folder's local path resolves each file through the client view to its depot file and head
 * revision, and `p4 print` reads chosen revisions without syncing anything. Runs wherever the
 * workspace lives (desktop or relay).
 */

export const PERFORCE_LATEST_FILE_LIMIT = 20_000
export const PERFORCE_PRINT_FILE_LIMIT = 100
const PRINT_FILE_MAX_BYTES = 512 * 1024
const PRINT_ARGS_MAX_CHARS = 20_000
// Why: each p4 print pays a server round trip per file; ~12 parallel batches keep 100 files at a few seconds.
const PRINT_MAX_PARALLEL = 12
const PRINT_MIN_FILES_PER_BATCH = 8
const MARKDOWN_EXTENSIONS = ['md', 'mdx', 'markdown']
const FSTAT_FIELDS = 'depotFile,clientFile,headRev,headChange,headAction'

export type PerforceLatestFile = {
  /** Where the client view puts the file, relative to the listing's `cwd`, with `/`. */
  path: string
  depotFile: string
  rev: number
  change: number
}
export type PerforceLatestFiles = { files: PerforceLatestFile[]; truncated: boolean }
type PrintableFile = Pick<PerforceLatestFile, 'depotFile' | 'rev'>
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

/**
 * Head revisions of markdown under `folder` (relative to `cwd`; '' for all of it). Each file is
 * placed where the view maps it, so a folder holding stream components or overriding view lines
 * lists files from every depot behind it, not just the first mapping `p4 where` names.
 */
export async function listLatestMarkdownFiles(
  cwd: string,
  folder: string
): Promise<PerforceLatestFiles> {
  const prefix = folder ? `${escapeP4FileArg(folder)}/` : ''
  const listed = await runP4(
    [
      '-ztag',
      'fstat',
      '-T',
      FSTAT_FIELDS,
      ...MARKDOWN_EXTENSIONS.map((extension) => `${prefix}....${extension}`)
    ],
    { cwd }
  )
  // Why: an extension with no files fails its own argument but not the others.
  const failure = firstLine(
    listed.stderr
      .split(/\r?\n/)
      .filter((line) => !/no such file/i.test(line))
      .join('\n')
  )
  if (!listed.stdout.trim() && failure) {
    throw new Error(failure)
  }
  const files: PerforceLatestFile[] = []
  for (const record of parseTaggedOutput(listed.stdout)) {
    const rev = Number(record.headRev)
    // Files only opened for add have no head revision; a deleted head is no file.
    if (!Number.isInteger(rev) || rev < 1 || /delete|purge|archive/.test(record.headAction ?? '')) {
      continue
    }
    const path = record.clientFile ? relativePathInsideRoot(cwd, record.clientFile) : null
    if (!record.depotFile || !path) {
      continue
    }
    if (files.length === PERFORCE_LATEST_FILE_LIMIT) {
      return { files, truncated: true }
    }
    files.push({ path, depotFile: record.depotFile, rev, change: Number(record.headChange) || 0 })
  }
  return { files, truncated: false }
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
function printBatches(files: readonly PrintableFile[]): PrintableFile[][] {
  const groups: PrintableFile[][] = Array.from(
    {
      length: Math.min(
        PRINT_MAX_PARALLEL,
        Math.max(1, Math.ceil(files.length / PRINT_MIN_FILES_PER_BATCH))
      )
    },
    () => []
  )
  files.forEach((file, index) => groups[index % groups.length].push(file))
  const batches: PrintableFile[][] = []
  for (const group of groups) {
    let batch: PrintableFile[] = []
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
  files: readonly PrintableFile[]
): Promise<PerforcePrintedFile[]> {
  const printed = new Map<string, { rev: number; content: string }>()
  await Promise.all(
    printBatches(files).map(async (batch) => {
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
