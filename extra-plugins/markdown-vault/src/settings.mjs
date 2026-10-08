import { list, scalar } from './note-record.mjs'
import { DEFAULT_STATUS_TONES, parseStatusTones } from './status-tones.mjs'

/** The vault's own configuration: a note in the notes folder whose frontmatter is the config. */
export const CONFIG_NOTE = 'markdown-vault.md'

export const DEFAULT_AGENT_MESSAGE = [
  'Work on the note "{{title}}" ({{path}}).',
  '',
  'Read that note first: it is your brief.'
].join('\n')

export const MAX_FILTER_FIELDS = 4
const LINK_NOTE_LIMIT = 8
const LINK_KEY = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/

/** Each person's own settings (Settings > Plugins); only user-set values are stored. */
export const DEFAULT_USER_SETTINGS = Object.freeze({
  project: '',
  folder: '',
  source: 'latest',
  me: ''
})

/** What the vault's config note may set, as its frontmatter keys, and the defaults without one. */
export const DEFAULT_VAULT_CONFIG = Object.freeze({
  'status-fields': 'state, status',
  'status-words': DEFAULT_STATUS_TONES,
  'title-field': 'title',
  'priority-field': 'priority',
  'owner-field': 'owner',
  'labels-field': 'tags',
  'updated-field': 'updated',
  filters: '',
  'work-project': '',
  'base-field': 'base',
  'base-prefix': '',
  'model-field': 'model',
  'effort-field': 'effort',
  agent: 'claude',
  'start-without-agent-when': '',
  'agent-message': DEFAULT_AGENT_MESSAGE,
  'link-notes': 'note: {{path}}'
})

/** @typedef {ReturnType<typeof resolveSettings>} VaultSettings */

/**
 * A person's settings plus the vault's config note (its frontmatter fields); bad values fall back.
 * @param {Record<string, unknown> | null | undefined} user
 * @param {Record<string, string | string[] | null>} [config]
 */
export function resolveSettings(user, config = {}) {
  /** @param {keyof typeof DEFAULT_USER_SETTINGS} key */
  const own = (key) => {
    const value = user?.[key]
    return typeof value === 'string' && value.trim() ? value.trim() : DEFAULT_USER_SETTINGS[key]
  }
  /** @param {keyof typeof DEFAULT_VAULT_CONFIG} key */
  const text = (key) => {
    const value = Array.isArray(config[key]) ? config[key].join('\n') : scalar(config[key])
    return value || DEFAULT_VAULT_CONFIG[key]
  }
  /** @param {keyof typeof DEFAULT_VAULT_CONFIG} key */
  const names = (key) => [...new Set(list(config[key] ?? DEFAULT_VAULT_CONFIG[key]))]
  return {
    project: own('project'),
    folder: normalizeFolder(own('folder')),
    source: own('source') === 'disk' ? 'disk' : 'latest',
    me: own('me'),
    statusFields: names('status-fields').length > 0 ? names('status-fields') : ['state', 'status'],
    statusTones: parseStatusTones(text('status-words')),
    titleField: text('title-field'),
    priorityField: text('priority-field'),
    ownerField: text('owner-field'),
    labelsField: text('labels-field'),
    updatedField: text('updated-field'),
    /** Empty means: pick filter fields from what the notes use. */
    filterFields: names('filters').slice(0, MAX_FILTER_FIELDS),
    workProjectSource: text('work-project'),
    baseField: text('base-field'),
    basePrefix: text('base-prefix').replace(/\/+$/, ''),
    modelField: text('model-field'),
    effortField: text('effort-field'),
    agent: text('agent'),
    startWithoutAgentWhen: parseCondition(text('start-without-agent-when')),
    agentMessage: text('agent-message'),
    linkNotes: parseLinkNotes(text('link-notes'))
  }
}

/** Project-relative with forward slashes; anything escaping the project becomes the root. */
export function normalizeFolder(value) {
  const folder = value.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
  const segments = folder.split('/')
  return folder && segments.every((segment) => segment && segment !== '.' && segment !== '..')
    ? folder
    : ''
}

/** The config note's project-relative path for a notes folder. */
export function configNotePath(folder) {
  return folder ? `${folder}/${CONFIG_NOTE}` : CONFIG_NOTE
}

/** "field=value" (case-insensitive value); anything else means never. */
function parseCondition(value) {
  const equals = value.indexOf('=')
  const field = value.slice(0, equals).trim()
  const expected = value.slice(equals + 1).trim()
  return equals > 0 && field && expected ? { field, value: expected.toLowerCase() } : null
}

/** Lines of `key: template`, kept with the workspace's link to the note. */
function parseLinkNotes(value) {
  /** @type {{ key: string, template: string }[]} */
  const notes = []
  for (const line of value.split(/\r?\n/)) {
    const colon = line.indexOf(':')
    const key = line.slice(0, colon).trim()
    const template = line.slice(colon + 1).trim()
    if (colon > 0 && LINK_KEY.test(key) && template && notes.length < LINK_NOTE_LIMIT) {
      notes.push({ key, template })
    }
  }
  return notes
}
