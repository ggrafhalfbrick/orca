import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

export const PROJECT_VERSION_FILE = join('ProjectSettings', 'ProjectVersion.txt')

/** Editor version a project was last saved with, e.g. `6000.0.23f1`. */
export function parseProjectEditorVersion(text) {
  const match = /^m_EditorVersion:\s*(\S+)\s*$/m.exec(text)
  return match ? match[1] : null
}

export async function readProjectEditorVersion(projectPath, read = readFile) {
  let text
  try {
    text = await read(join(projectPath, PROJECT_VERSION_FILE), 'utf8')
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw new Error(
        'This worktree has no ProjectSettings/ProjectVersion.txt, so it is not a Unity project.'
      )
    }
    throw error
  }
  const version = parseProjectEditorVersion(text)
  if (!version) {
    throw new Error('ProjectSettings/ProjectVersion.txt does not name a Unity Editor version.')
  }
  return version
}
