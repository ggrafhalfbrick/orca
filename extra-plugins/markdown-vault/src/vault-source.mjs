import { buildNoteFilters, filterAndSortNotes, resolveSelection } from './note-filters.mjs'
import { noteBodyMarkdown, toTaskItem } from './note-item.mjs'
import { toNoteRecord } from './note-record.mjs'
import { parsePeople } from './people.mjs'
import { resolveSettings } from './settings.mjs'
import { createVaultReader } from './vault-reader.mjs'

const LIST_ITEM_LIMIT = 500
const NOTICE_MAX = 512
// Why: a people file changes rarely; one more listing of its folder every few minutes is plenty.
const PEOPLE_RECHECK_MS = 5 * 60_000

/** @typedef {import('./vault-reader.mjs').HostCall} HostCall */

/**
 * The "notes" task source: markdown notes in a folder of an Orca project.
 * @param {{ host: HostCall, log?: (message: string) => void, now?: () => number }} options
 */
export function createVaultSource({ host, log = () => {}, now = Date.now }) {
  const reader = createVaultReader({ host, log, now })
  /** @type {{ key: string, checkedAt: number, version: string | null, people: Map<string, import('./people.mjs').Person> } | null} */
  let peopleCache = null

  async function loadSettings() {
    try {
      return resolveSettings((await host('settings.get'))?.settings)
    } catch {
      // Why: no settings yet (or not granted) means the defaults apply.
      return resolveSettings({})
    }
  }

  /** Settings and projects, or the one line that tells the user what to set up. */
  async function loadContext() {
    const settings = await loadSettings()
    if (!settings.project) {
      return { setup: 'Pick the vault project in Settings > Plugins > Markdown Vault.' }
    }
    /** @type {{ id: string, name: string, sourceControl: string, host: string }[]} */
    const projects = (await host('projects.list'))?.projects ?? []
    const vaultProject = projects.find((project) => project.id === settings.project)
    if (!vaultProject) {
      return {
        setup:
          'The vault project is no longer in Orca. Pick it again in Settings > Plugins > Markdown Vault.'
      }
    }
    const workProject =
      projects.find((project) => project.id === (settings.workProject || settings.project)) ??
      vaultProject
    /** @type {import('./vault-reader.mjs').VaultLocation} */
    const vault = { projectId: settings.project, folder: settings.folder, source: settings.source }
    return { settings, vaultProject, workProject, vault }
  }

  /** People from the configured file, re-checked every few minutes; failures mean no names. */
  async function loadPeople(settings, vault) {
    if (!settings.peopleFile) {
      return new Map()
    }
    const key = JSON.stringify([vault.projectId, vault.source, settings.peopleFile])
    if (peopleCache?.key === key && now() - peopleCache.checkedAt < PEOPLE_RECHECK_MS) {
      return peopleCache.people
    }
    try {
      const folder = settings.peopleFile.includes('/')
        ? settings.peopleFile.slice(0, settings.peopleFile.lastIndexOf('/'))
        : ''
      const listing = await host('projects.listMarkdown', {
        projectId: vault.projectId,
        folder,
        source: vault.source
      })
      const file = (listing?.files ?? []).find((entry) => entry.path === settings.peopleFile)
      if (!file) {
        throw new Error(`${settings.peopleFile} was not found`)
      }
      const people =
        peopleCache?.key === key && file.version !== null && peopleCache.version === file.version
          ? peopleCache.people
          : parsePeople(await reader.readNote(vault, file.path, file.version))
      peopleCache = { key, checkedAt: now(), version: file.version, people }
      return people
    } catch (error) {
      log(
        `could not read the people file: ${error instanceof Error ? error.message : String(error)}`
      )
      peopleCache = { key, checkedAt: now(), version: null, people: new Map() }
      return peopleCache.people
    }
  }

  async function loadNotes() {
    const context = await loadContext()
    if (!context.settings) {
      return { setup: context.setup }
    }
    const { settings, vault, vaultProject, workProject } = context
    const [state, people] = await Promise.all([
      reader.readAll(vault, settings),
      loadPeople(settings, vault)
    ])
    /** @type {import('./note-item.mjs').ItemContext} */
    const itemContext = {
      settings,
      person: (owner) => people.get(owner.trim().toLowerCase()),
      workProjectId: workProject.id,
      workSourceControl: workProject.sourceControl
    }
    const records = [...state.files.values()].map((entry) => entry.record)
    return { settings, vault, vaultProject, state, people, records, itemContext }
  }

  return {
    /** @param {{ query?: string, filters?: Record<string, string> }} params */
    async list(params = {}) {
      const loaded = await loadNotes()
      if (!loaded.records) {
        return { items: [], notice: loaded.setup }
      }
      const { settings, vaultProject, state, people, records, itemContext } = loaded
      const filterContext = { people, me: settings.me, filterFields: settings.filterFields }
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
      const loaded = await loadNotes()
      if (!loaded.records) {
        throw new Error(loaded.setup)
      }
      const entry = loaded.state.files.get(itemId)
      if (!entry) {
        throw new Error(`There is no note ${itemId} in the vault folder.`)
      }
      // Why: list records drop note bodies; the detail always shows the file as it is now.
      const text = await reader.readNote(loaded.vault, itemId, entry.version)
      const record = toNoteRecord({ path: itemId, text }, loaded.settings)
      return {
        item: toTaskItem(record, loaded.itemContext),
        bodyMarkdown: noteBodyMarkdown(record, loaded.itemContext)
      }
    }
  }
}
