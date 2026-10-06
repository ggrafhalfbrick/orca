import type { HostProcess, WorkspaceCopyHost } from './workspace-copy-host'
import { normalizePath, samePath } from './workspace-copy-source'
import { escapeRegex } from '../../string-utils'

const PROJECT_PATH_ARG = /-projectpath\s+(?:"([^"]+)"|(\S+))/i

async function processes(host: WorkspaceCopyHost): Promise<HostProcess[]> {
  try {
    return (await host.listProcesses?.()) ?? []
  } catch {
    // Why: the process table only adds warnings and names; never block a copy on it.
    return []
  }
}

/** Unity projects among `projects` that a running editor has open. */
export async function unityProjectsOpenInEditor(
  host: WorkspaceCopyHost,
  projects: readonly string[]
): Promise<string[]> {
  const open = (await processes(host))
    .filter((p) => p.name.toLowerCase() === 'unity.exe')
    .map((p) => PROJECT_PATH_ARG.exec(p.commandLine))
    .filter((match) => match !== null)
    .map((match) => normalizePath(match[1] ?? match[2]))
  return projects.filter((project) => open.some((path) => samePath(path, project)))
}

/** Processes whose command line names a path inside `root` (editors, shells, tools started there). */
export async function processesUnder(host: WorkspaceCopyHost, root: string): Promise<string[]> {
  const needle = normalizePath(root).toLowerCase()
  // Why the boundary: `D:\TOTF2.wt\copy-1` must not match `D:\TOTF2.wt\copy-10`.
  const mentions = new RegExp(`${escapeRegex(needle)}(?=$|[\\\\/"'\\s])`)
  return (await processes(host))
    .filter((p) => mentions.test(p.commandLine.toLowerCase()))
    .map((p) => `${p.name} (pid ${p.pid})`)
}
