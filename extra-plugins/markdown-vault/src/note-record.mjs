import { parseFrontmatter } from './frontmatter.mjs'
import { resolveStatus } from './status-tones.mjs'

/** @typedef {Record<string, string | string[] | null>} NoteFields */
/** What the cache keeps per note: everything a record needs except the body. */
/** @typedef {{ fields: NoteFields, heading: string }} ParsedNote */
/**
 * @typedef {{
 *   path: string,
 *   slug: string,
 *   title: string,
 *   status: ReturnType<typeof resolveStatus>,
 *   statusText: string,
 *   priority: string,
 *   owner: string,
 *   labels: string[],
 *   updated: string,
 *   fields: NoteFields,
 *   body: string
 * }} NoteRecord
 */

/** @param {string} text */
export function parseNote(text) {
  const { data, body } = parseFrontmatter(text)
  return { fields: data, heading: firstHeading(body), body }
}

/**
 * A note as the vault's configuration reads it.
 * @param {{ path: string, fields: NoteFields, heading: string, body?: string }} note path relative to the project
 * @param {import('./settings.mjs').VaultSettings} settings
 * @returns {NoteRecord}
 */
export function toNoteRecord({ path, fields, heading, body = '' }, settings) {
  const fileName = path.slice(path.lastIndexOf('/') + 1)
  const slug = fileName.replace(/\.(?:md|mdx|markdown)$/i, '')
  const statusText = settings.statusFields.map((field) => scalar(fields[field])).find(Boolean) ?? ''
  return {
    path,
    slug,
    title: scalar(fields[settings.titleField]) || heading || slug,
    status: resolveStatus(statusText, settings.statusTones),
    statusText,
    priority: normalizePriority(scalar(fields[settings.priorityField])),
    owner: scalar(fields[settings.ownerField]),
    labels: [
      ...new Set(list(fields[settings.labelsField]).map((label) => label.replace(/^#+/, '').trim()))
    ].filter(Boolean),
    updated: scalar(fields[settings.updatedField]),
    fields,
    body
  }
}

/** A frontmatter value as one string; lists join with ", ". */
export function scalar(value) {
  if (typeof value === 'string') {
    return value.trim()
  }
  return Array.isArray(value) ? value.join(', ').trim() : ''
}

/** A frontmatter value as a list; a plain string splits on commas. */
export function list(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => entry.trim()).filter(Boolean)
  }
  return typeof value === 'string'
    ? value
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean)
    : []
}

/** @param {string} value */
function normalizePriority(value) {
  return /^p[0-9]$/i.test(value) ? value.toUpperCase() : value
}

/** @param {string} body */
function firstHeading(body) {
  const match = /^#[ \t]+(.+)$/m.exec(body)
  return match ? match[1].trim() : ''
}
