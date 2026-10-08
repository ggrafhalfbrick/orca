import {
  buildNoteFilters,
  filterAndSortNotes,
  pickFilterFields,
  resolveSelection
} from './note-filters.mjs'
import { noteBodyMarkdown, toTaskItem } from './note-item.mjs'
import { parseNote, toNoteRecord } from './note-record.mjs'
import { configNotePath, resolveSettings } from './settings.mjs'
import { createVaultReader } from './vault-reader.mjs'

const LIST_ITEM_LIMIT = 500
const NOTICE_MAX = 512

/** @typedef {import('./vault-reader.mjs').HostCall} HostCall */

/**
 * The "notes" task source: markdown notes in a folder of an Orca project, configured by the
 * folder's own config note so every person sees the vault the same way.
 * @param {{ host: HostCall, log?: (message: string) => void, now?: () => number }} options
 */
export function createVaultSource({ host, log = () => {}, now = Date.now }) {
  const reader = createVaultReader({ host, log, now })

  async function loadUserSettings() {
    try {
      return (await host('settings.get'))?.settings ?? {}
    } catch {
      // Why: no settings yet (or not granted) means the defaults apply.
      return {}
    }
  }

  /** The vault's notes and settings, or the one line that tells the user what to set up. */
  async function loadVault() {
    const user = await loadUserSettings()
    const base = resolveSettings(user)
    if (!base.project) {
      return { setup: 'Pick the vault project in Settings > Plugins > Markdown Vault.' }
    }
    /** @type {{ id: string, name: string, sourceControl: string, host: string }[]} */
    const projects = (await host('projects.list'))?.projects ?? []
    const vaultProject = projects.find((project) => project.id === base.project)
    if (!vaultProject) {
      return {
        setup:
          'The vault project is no longer in Orca. Pick it again in Settings > Plugins > Markdown Vault.'
      }
    }
    /** @type {import('./vault-reader.mjs').VaultLocation} */
    const vault = { projectId: base.project, folder: base.folder, source: base.source }
    const state = await reader.readAll(vault)
    const configPath = configNotePath(base.folder)
    const settings = resolveSettings(user, state.files.get(configPath)?.note.fields ?? {})
    const records = [...state.files]
      .filter(([path]) => path !== configPath)
      .map(([path, { note }]) => toNoteRecord({ path, ...note }, settings))
    /** @type {import('./note-item.mjs').ItemContext} */
    const itemContext = {
      settings,
      vaultProjectId: vaultProject.id,
      vaultSourceControl: vaultProject.sourceControl
    }
    return { settings, vault, vaultProject, state, records, configPath, itemContext }
  }

  return {
    /** @param {{ query?: string, filters?: Record<string, string> }} params */
    async list(params = {}) {
      const loaded = await loadVault()
      if (!loaded.records) {
        return { items: [], notice: loaded.setup }
      }
      const { settings, vaultProject, state, records, itemContext } = loaded
      const filterContext = { me: settings.me, filterFields: pickFilterFields(records, settings) }
      const { filters, allowed } = buildNoteFilters(records, filterContext)
      const selection = resolveSelection(params.filters, filterContext, allowed)
      const shown = filterAndSortNotes(records, {
        query: params.query ?? '',
        selection,
        context: filterContext
      })
      const from =
        settings.source === 'latest' && vaultProject.sourceControl !== 'none'
          ? 'latest on the server'
          : 'on disk'
      const notice = [
        `${shown.length} of ${records.length} notes, ${from}.`,
        state.truncated ? 'The folder has more notes than Orca lists.' : '',
        state.unreadable > 0 ? `${state.unreadable} could not be read.` : '',
        state.notice
      ]
        .filter(Boolean)
        .join(' ')
      return {
        items: shown.slice(0, LIST_ITEM_LIMIT).map((record) => toTaskItem(record, itemContext)),
        filters,
        notice: notice.length > NOTICE_MAX ? `${notice.slice(0, NOTICE_MAX - 1)}…` : notice
      }
    },

    /** @param {{ itemId: string }} params */
    async get({ itemId }) {
      const loaded = await loadVault()
      if (!loaded.records) {
        throw new Error(loaded.setup)
      }
      const entry = itemId === loaded.configPath ? undefined : loaded.state.files.get(itemId)
      if (!entry) {
        throw new Error(`There is no note ${itemId} in the vault folder.`)
      }
      // Why: the cache keeps frontmatter only; the detail always shows the file as it is now.
      const text = await reader.readNote(loaded.vault, itemId, entry.version)
      const record = toNoteRecord({ path: itemId, ...parseNote(text) }, loaded.settings)
      return {
        item: toTaskItem(record, loaded.itemContext),
        bodyMarkdown: noteBodyMarkdown(record, loaded.itemContext)
      }
    }
  }
}
