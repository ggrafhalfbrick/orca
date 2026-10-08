import { DEFAULT_STATUS_TONES, parseStatusTones } from './status-tones.mjs'

export const DEFAULT_PROMPT_TEMPLATE = [
  'Work on the note "{{title}}" ({{path}}).',
  '',
  'Read that note first: it is your brief.'
].join('\n')

export const DEFAULT_LINK_NOTES = 'note: {{path}}'
export const EXTRA_FILTER_LIMIT = 4
const LINK_NOTE_LIMIT = 8
const LINK_KEY = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/

/** Defaults of every `contributes.settings` key; only user-set values are stored. */
export const DEFAULT_SETTINGS = Object.freeze({
  project: '',
  folder: '',
  source: 'latest',
  statusFields: 'state, status',
  titleField: 'title',
  priorityField: 'priority',
  ownerField: 'owner',
  labelsField: 'tags',
  updatedField: 'updated',
  filterFields: '',
  statusTones: DEFAULT_STATUS_TONES,
  peopleFile: '',
  me: '',
  workProject: '',
  baseField: 'base',
  basePrefix: '',
  modelField: 'model',
  effortField: 'effort',
  agent: 'claude',
  startWithoutAgentWhen: '',
  promptTemplate: DEFAULT_PROMPT_TEMPLATE,
  linkNotes: DEFAULT_LINK_NOTES
})

/**
 * @typedef {ReturnType<typeof resolveSettings>} VaultSettings
 */

/**
 * Stored values over the defaults; values of the wrong type or shape fall back.
 * @param {Record<string, unknown> | null | undefined} raw
 */
export function resolveSettings(raw) {
  /** @param {keyof typeof DEFAULT_SETTINGS} key */
  const text = (key) => {
    const value = raw?.[key]
    return typeof value === 'string' && value.trim() ? value.trim() : DEFAULT_SETTINGS[key]
  }
  return {
    project: text('project'),
    folder: normalizeFolder(text('folder')),
    source: text('source') === 'disk' ? 'disk' : 'latest',
    statusFields: names(text('statusFields')),
    titleField: text('titleField'),
    priorityField: text('priorityField'),
    ownerField: text('ownerField'),
    labelsField: text('labelsField'),
    updatedField: text('updatedField'),
    filterFields: names(text('filterFields')).slice(0, EXTRA_FILTER_LIMIT),
    statusTones: parseStatusTones(text('statusTones')),
    peopleFile: normalizeFolder(text('peopleFile')),
    me: text('me'),
    workProject: text('workProject'),
    baseField: text('baseField'),
    basePrefix: text('basePrefix').replace(/\/+$/, ''),
    modelField: text('modelField'),
    effortField: text('effortField'),
    agent: text('agent'),
    startWithoutAgentWhen: parseCondition(text('startWithoutAgentWhen')),
    promptTemplate: text('promptTemplate'),
    linkNotes: parseLinkNotes(text('linkNotes'))
  }
}

/** Fields that change how a note file reads; the cache is only valid for the same set. */
export function readingFingerprint(settings) {
  return JSON.stringify([
    settings.statusFields,
    settings.titleField,
    settings.priorityField,
    settings.ownerField,
    settings.labelsField,
    settings.updatedField,
    [...settings.statusTones]
  ])
}

/** @param {string} value */
function names(value) {
  return [
    ...new Set(
      value
        .split(',')
        .map((name) => name.trim())
        .filter(Boolean)
    )
  ]
}

/** Project-relative with forward slashes; anything escaping the project becomes the root. */
export function normalizeFolder(value) {
  const folder = value.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
  const segments = folder.split('/')
  return folder && segments.every((segment) => segment && segment !== '.' && segment !== '..')
    ? folder
    : ''
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
