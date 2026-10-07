import type { HostProcess, WorkspaceCopyHost } from './workspace-copy-host'
import { normalizePath, samePath } from './workspace-copy-source'
import type { WorkspaceCopyHolder, WorkspaceCopyHolderConsent } from './workspace-copy-types'
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

/**
 * Processes whose command line names a path inside `root` (editors, Unity, tools started there).
 * Only a walk of other processes' handles finds one that merely runs in the copy, and security
 * software treats that walk as an attack, so those are not found.
 */
export async function processesUnder(
  host: WorkspaceCopyHost,
  root: string
): Promise<WorkspaceCopyHolder[]> {
  const needle = normalizePath(root).toLowerCase().replaceAll('/', '\\')
  // Why the boundary: `D:\TOTF2.wt\copy-1` must not match `D:\TOTF2.wt\copy-10`.
  const mentions = new RegExp(`${escapeRegex(needle)}(?=$|[\\\\"'\\s])`)
  return (await processes(host))
    .filter(
      (p) =>
        p.pid !== process.pid && mentions.test(p.commandLine.toLowerCase().replaceAll('/', '\\'))
    )
    .map((p) => ({ ...p, startedAt: p.startedAt ?? null }))
}

export function processLabel(holder: Pick<WorkspaceCopyHolder, 'name' | 'pid'>): string {
  return `${holder.name} (pid ${holder.pid})`
}

export function isConsentedHolder(
  holder: WorkspaceCopyHolder,
  consents: readonly WorkspaceCopyHolderConsent[] | undefined
): boolean {
  return (consents ?? []).some(
    (consent) => consent.pid === holder.pid && consent.startedAt === holder.startedAt
  )
}

/** Ends the holders of `root` the user agreed to end; the host re-checks each is the same process. */
export async function endConsentedHolders(
  host: WorkspaceCopyHost,
  root: string,
  consents: readonly WorkspaceCopyHolderConsent[]
): Promise<void> {
  if (!host.endProcess) {
    return
  }
  for (const holder of await processesUnder(host, root)) {
    if (isConsentedHolder(holder, consents)) {
      await host.endProcess(holder)
    }
  }
}
