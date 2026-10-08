import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { open } from 'node:fs/promises'
import { join } from 'node:path'

const PS_TIMEOUT_MS = 5_000
const PS_MAX_OUTPUT_BYTES = 16 * 1024 * 1024

/**
 * Windows: a running editor holds `Temp/UnityLockfile` open without sharing, so opening it
 * fails with EBUSY. A leftover file from a crash opens fine.
 */
export async function isLockfileHeld(projectPath, openFile = open) {
  try {
    const handle = await openFile(join(projectPath, 'Temp', 'UnityLockfile'), 'r+')
    await handle.close()
    return false
  } catch (error) {
    return error?.code === 'EBUSY'
  }
}

function normalizeProjectPath(path, platform) {
  const trimmed = path.replace(/[\\/]+$/, '')
  // Why: macOS volumes are case-insensitive by default; Linux paths are not.
  return platform === 'darwin' ? trimmed.toLowerCase() : trimmed
}

/** Whether any process command line is a Unity Editor started on `projectPath`. */
export function commandLinesOpenProject(commandLines, projectPath, platform) {
  const target = normalizeProjectPath(projectPath, platform)
  return commandLines.some((line) => {
    if (!/unity/i.test(line)) {
      return false
    }
    const match = /\s-projectpath\s+"?(.+?)"?(?=\s+-|$)/i.exec(line)
    return match !== null && normalizeProjectPath(match[1].trim(), platform) === target
  })
}

function listCommandLines() {
  const ps = ['/bin/ps', '/usr/bin/ps'].find((candidate) => existsSync(candidate))
  if (!ps) {
    return Promise.resolve([])
  }
  return new Promise((resolve) => {
    execFile(
      ps,
      ['-A', '-o', 'args='],
      { timeout: PS_TIMEOUT_MS, maxBuffer: PS_MAX_OUTPUT_BYTES },
      (error, stdout) => resolve(error ? [] : stdout.split('\n'))
    )
  })
}

/** Best effort: a wrong "not open" only lets Unity show its own "already open" dialog. */
export async function isProjectOpenInEditor(
  projectPath,
  { platform = process.platform, openFile = open, listProcesses = listCommandLines } = {}
) {
  if (platform === 'win32') {
    return isLockfileHeld(projectPath, openFile)
  }
  return commandLinesOpenProject(await listProcesses(), projectPath, platform)
}
