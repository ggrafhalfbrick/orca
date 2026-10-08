/** A note file with `fields` as frontmatter. */
export function noteText(fields, body = '# Note\n\nBody text.\n') {
  const lines = Object.entries(fields).map(([key, value]) => `${key}: ${value}`)
  return `---\n${lines.join('\n')}\n---\n\n${body}`
}

/**
 * An Orca host over in-memory projects and files. `files` maps path to { text, version };
 * every call is recorded so tests can count server round trips.
 */
export function fakeHost({ settings = {}, projects, files = new Map(), storage = new Map() }) {
  const calls = []
  const host = async (method, params = {}) => {
    calls.push({ method, params })
    switch (method) {
      case 'settings.get':
        return { settings }
      case 'projects.list':
        return { projects }
      case 'projects.listMarkdown': {
        const inFolder = [...files.keys()].filter(
          (path) => !params.folder || path.startsWith(`${params.folder}/`)
        )
        return {
          revision: params.source === 'latest' ? 'r1' : null,
          files: inFolder.map((path) => ({
            path,
            version: params.source === 'latest' ? files.get(path).version : null
          })),
          truncated: false
        }
      }
      case 'projects.readMarkdown':
        return {
          files: params.files.map(({ path }) =>
            files.has(path) ? { path, content: files.get(path).text } : { path, error: 'gone' }
          )
        }
      case 'storage.get':
        return { value: storage.get(params.key) ?? null }
      case 'storage.set':
        storage.set(params.key, structuredClone(params.value))
        return { ok: true }
      case 'storage.delete':
        storage.delete(params.key)
        return { ok: true }
      default:
        throw new Error(`unexpected host call ${method}`)
    }
  }
  return { host, calls, files, storage, settings }
}

export const PROJECTS = [
  { id: 'vault', name: 'Notes', sourceControl: 'git', host: 'local' },
  { id: 'work', name: 'Game', sourceControl: 'perforce', host: 'local' }
]
