import { parseNote } from './note-record.mjs'

const READ_BATCH = 100
const READ_PARALLEL = 3
// Why: the Tasks page lists again on every keystroke and filter change; the server needs asking less often.
const RELIST_MS = 30_000
const CACHE_VERSION = 1
// Why: plugin storage takes values up to 256 KB; stay well under it, non-ASCII included.
const CACHE_CHUNK_CHARS = 100_000

/** @typedef {(method: string, params?: Record<string, unknown>) => Promise<any>} HostCall */
/** @typedef {import('./note-record.mjs').ParsedNote} ParsedNote */
/** @typedef {{ projectId: string, folder: string, source: 'latest' | 'disk' }} VaultLocation */
/**
 * @typedef {{
 *   files: Map<string, { version: string | null, note: ParsedNote }>,
 *   listedAt: number,
 *   notice: string,
 *   truncated: boolean,
 *   unreadable: number
 * }} VaultState
 */

/** Short stable key for plugin storage (FNV-1a). */
function hashKey(text) {
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(36)
}

/**
 * Lists a vault folder through Orca and reads only notes whose version changed since last time.
 * @param {{ host: HostCall, log?: (message: string) => void, now?: () => number }} options
 */
export function createVaultReader({ host, log = () => {}, now = Date.now }) {
  /** @type {Map<string, VaultState>} */
  const vaults = new Map()
  /** @type {Map<string, Promise<VaultState>>} */
  const inFlight = new Map()

  /** @param {VaultLocation} vault */
  function vaultKey(vault) {
    return JSON.stringify([vault.projectId, vault.folder, vault.source])
  }

  /** @param {VaultLocation} vault @param {{ path: string, version: string | null }[]} files */
  async function readFiles(vault, files) {
    /** @type {{ path: string, content?: string, error?: string }[]} */
    const results = []
    const batches = []
    for (let index = 0; index < files.length; index += READ_BATCH) {
      batches.push(files.slice(index, index + READ_BATCH))
    }
    for (let index = 0; index < batches.length; index += READ_PARALLEL) {
      const round = await Promise.all(
        batches.slice(index, index + READ_PARALLEL).map((batch) =>
          host('projects.readMarkdown', {
            projectId: vault.projectId,
            source: vault.source,
            files: batch
          })
        )
      )
      for (const response of round) {
        results.push(...(response?.files ?? []))
      }
    }
    return results
  }

  /** @param {string} key */
  async function loadSaved(key) {
    const base = `vault-cache:${hashKey(key)}`
    try {
      const meta = (await host('storage.get', { key: `${base}:meta` }))?.value
      if (!meta || meta.v !== CACHE_VERSION || meta.key !== key || !Number.isInteger(meta.chunks)) {
        return null
      }
      /** @type {VaultState['files']} */
      const files = new Map()
      for (let chunk = 0; chunk < meta.chunks; chunk++) {
        const entries = (await host('storage.get', { key: `${base}:${chunk}` }))?.value
        for (const [path, version, note] of Array.isArray(entries) ? entries : []) {
          files.set(path, { version, note })
        }
      }
      return { files, listedAt: 0, notice: '', truncated: false, unreadable: 0 }
    } catch (error) {
      log(`could not load saved notes: ${error instanceof Error ? error.message : String(error)}`)
      return null
    }
  }

  /** @param {string} key @param {VaultState} state */
  async function save(key, state) {
    const base = `vault-cache:${hashKey(key)}`
    try {
      /** @type {unknown[][]} */
      const chunks = []
      let current = []
      let chars = 0
      for (const [path, { version, note }] of state.files) {
        const entry = [path, version, note]
        const size = JSON.stringify(entry).length
        if (current.length > 0 && chars + size > CACHE_CHUNK_CHARS) {
          chunks.push(current)
          current = []
          chars = 0
        }
        current.push(entry)
        chars += size
      }
      if (current.length > 0) {
        chunks.push(current)
      }
      const previous = (await host('storage.get', { key: `${base}:meta` }))?.value
      for (const [index, chunk] of chunks.entries()) {
        await host('storage.set', { key: `${base}:${index}`, value: chunk })
      }
      await host('storage.set', {
        key: `${base}:meta`,
        value: { v: CACHE_VERSION, key, chunks: chunks.length }
      })
      const stale = Number.isInteger(previous?.chunks) ? previous.chunks : 0
      for (let index = chunks.length; index < stale; index++) {
        await host('storage.delete', { key: `${base}:${index}` })
      }
    } catch (error) {
      log(`could not save notes: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /** @param {VaultLocation} vault @param {string} key */
  async function refresh(vault, key) {
    const state = vaults.get(key) ??
      (vault.source === 'latest' ? await loadSaved(key) : null) ?? {
        files: new Map(),
        listedAt: 0,
        notice: '',
        truncated: false,
        unreadable: 0
      }
    const listing = await host('projects.listMarkdown', {
      projectId: vault.projectId,
      folder: vault.folder,
      source: vault.source
    })
    const listed = new Map((listing?.files ?? []).map((file) => [file.path, file.version]))
    const changed = [...listed]
      .filter(([path, version]) => version === null || state.files.get(path)?.version !== version)
      .map(([path, version]) => ({ path, version }))
    let unreadable = 0
    for (const result of await readFiles(vault, changed)) {
      if (typeof result.content === 'string') {
        const { fields, heading } = parseNote(result.content)
        const version = listed.get(result.path) ?? null
        state.files.set(result.path, { version, note: { fields, heading } })
      } else {
        unreadable++
        state.files.delete(result.path)
      }
    }
    for (const path of state.files.keys()) {
      if (!listed.has(path)) {
        state.files.delete(path)
      }
    }
    state.listedAt = now()
    state.notice = listing?.notice ?? ''
    state.truncated = Boolean(listing?.truncated)
    state.unreadable = unreadable
    vaults.set(key, state)
    if (vault.source === 'latest' && changed.length > 0) {
      await save(key, state)
    }
    return state
  }

  return {
    /**
     * Every note's frontmatter, re-listed at most every 30 seconds; concurrent callers share one read.
     * @param {VaultLocation} vault
     */
    async readAll(vault) {
      const key = vaultKey(vault)
      const cached = vaults.get(key)
      if (cached && now() - cached.listedAt < RELIST_MS) {
        return cached
      }
      let pending = inFlight.get(key)
      if (!pending) {
        pending = refresh(vault, key).finally(() => inFlight.delete(key))
        inFlight.set(key, pending)
      }
      return pending
    },
    /**
     * The file's current text; `version` comes from the listing (null on disk).
     * @param {VaultLocation} vault
     * @param {string} path
     * @param {string | null} version
     */
    async readNote(vault, path, version) {
      const [file] = await readFiles(vault, [{ path, version }])
      if (typeof file?.content !== 'string') {
        throw new Error(file?.error ?? `could not read ${path}`)
      }
      return file.content
    }
  }
}
