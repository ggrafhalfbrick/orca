import { parseFrontmatter } from './frontmatter.mjs'
import { resolveStatus } from './status-tones.mjs'

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
 *   fields: Record<string, string | string[] | null>,
 *   body: string
 * }} NoteRecord
 */

/**
 * @param {{ path: string, text: string }} note path relative to the project
 * @param {import('./settings.mjs').VaultSettings} settings
 * @returns {NoteRecord}
 */
export function toNoteRecord({ path, text }, settings) {
  const { data, body } = parseFrontmatter(text)
  const fileName = path.slice(path.lastIndexOf('/') + 1)
  const slug = fileName.replace(/\.(?:md|mdx|markdown)$/i, '')
  const statusText = settings.statusFields.map((field) => scalar(data[field])).find(Boolean) ?? ''
  return {
    path,
    slug,
    title: scalar(data[settings.titleField]) || firstHeading(body) || slug,
    status: resolveStatus(statusText, settings.statusTones),
    statusText,
    priority: normalizePriority(scalar(data[settings.priorityField])),
    owner: scalar(data[settings.ownerField]),
    labels: [
      ...new Set(list(data[settings.labelsField]).map((label) => label.replace(/^#+/, '').trim()))
    ].filter(Boolean),
    updated: scalar(data[settings.updatedField]),
    fields: data,
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
