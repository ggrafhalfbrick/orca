import { list, scalar } from './note-record.mjs'

export const AGENT_PROMPT_MAX_CHARS = 16 * 1024
const BODY_MAX_CHARS = 512 * 1024
const LINK_VALUE_MAX = 4096
const PERFORCE_COPY_NAME_MAX = 24
const WORKSPACE_NAME_MAX = 48

/** @typedef {import('./note-record.mjs').NoteRecord} NoteRecord */
/**
 * @typedef {{
 *   settings: import('./settings.mjs').VaultSettings,
 *   vaultProjectId: string,
 *   vaultSourceControl: string
 * }} ItemContext
 */

/**
 * Where Start creates the workspace: the vault config's `work-project` (a depot path or Git remote,
 * which Orca matches to each person's own project), else the vault project itself.
 * @param {ItemContext} context
 */
function workProject(context) {
  const source = context.settings.workProjectSource
  return source
    ? { projectSource: clip(source, 512), perforce: source.startsWith('//') }
    : { projectId: context.vaultProjectId, perforce: context.vaultSourceControl === 'perforce' }
}

/** Maps a note to the Tasks item shape (strict: optional keys are omitted, never undefined). */
export function toTaskItem(record, context) {
  /** @type {Record<string, unknown>} */
  const item = {
    id: clip(record.path, 512),
    title: clip(record.title, 512),
    status: { label: clip(record.status.label, 64), tone: record.status.tone }
  }
  if (record.priority) {
    item.priority = clip(record.priority, 32)
  }
  if (record.owner) {
    item.owner = clip(record.owner, 256)
  }
  const labels = record.labels.slice(0, 16).map((label) => clip(label, 64))
  if (labels.length > 0) {
    item.labels = labels
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(record.updated)) {
    item.updatedAt = clip(record.updated, 64)
  }
  const summary = record.statusText.replace(/\s+/g, ' ').trim()
  // Why: a status that is just its label adds nothing under it.
  if (summary.split(' ').length > 2) {
    item.summary = clip(summary, 1024)
  }
  if (record.status.tone === 'done' || record.status.tone === 'closed') {
    item.startBlockedReason = clip(`This note is ${record.status.label.toLowerCase()}.`, 256)
  } else {
    item.start = startRecipe(record, context)
  }
  return item
}

/** @param {NoteRecord} record @param {ItemContext} context */
function startRecipe(record, context) {
  const { settings } = context
  const values = templateValues(record, context)
  const { perforce, ...project } = workProject(context)
  /** @type {Record<string, unknown>} */
  const recipe = {
    workspaceName: toWorkspaceName(
      record.slug,
      perforce ? PERFORCE_COPY_NAME_MAX : WORKSPACE_NAME_MAX
    ),
    ...project
  }
  const base = values.base
  if (base) {
    recipe.baseRef = clip(base, 512)
  }
  if (!startsWithoutAgent(record, settings)) {
    const prompt = renderTemplate(settings.agentMessage, values, record)
    if (prompt) {
      recipe.agentPrompt = clip(prompt, AGENT_PROMPT_MAX_CHARS)
    }
    const model = scalar(record.fields[settings.modelField])
    const effort = scalar(record.fields[settings.effortField]).toLowerCase()
    if ((model && model.length <= 128) || (effort && effort.length <= 32)) {
      recipe.sessionOptions = {
        agent: settings.agent,
        ...(model && model.length <= 128 ? { model } : {}),
        ...(effort && effort.length <= 32 ? { effort } : {})
      }
    }
  }
  const linkMetadata = Object.fromEntries(
    settings.linkNotes
      .map(({ key, template }) => [
        key,
        clip(renderTemplate(template, values, record), LINK_VALUE_MAX)
      ])
      .filter(([, value]) => value)
  )
  if (Object.keys(linkMetadata).length > 0) {
    recipe.linkMetadata = linkMetadata
  }
  return recipe
}

/** @param {NoteRecord} record @param {import('./settings.mjs').VaultSettings} settings */
function startsWithoutAgent(record, settings) {
  const condition = settings.startWithoutAgentWhen
  return (
    Boolean(condition) && scalar(record.fields[condition.field]).toLowerCase() === condition.value
  )
}

/**
 * Placeholders templates may use, besides `{{field:NAME}}` for any frontmatter field.
 * @param {NoteRecord} record
 * @param {ItemContext} context
 */
export function templateValues(record, context) {
  const rawBase = scalar(record.fields[context.settings.baseField])
  return {
    title: record.title,
    path: record.path,
    slug: record.slug,
    status: record.status.label,
    statusText: record.statusText,
    owner: record.owner || 'the note owner',
    priority: record.priority,
    labels: record.labels.join(', '),
    base: qualifyBase(rawBase, context.settings.basePrefix)
  }
}

/** A bare name ("feature-x") gets the prefix ("//depot" → "//depot/feature-x"); paths stay as written. */
export function qualifyBase(value, prefix) {
  const trimmed = value.trim()
  return trimmed && prefix && /^[\w.-]+$/.test(trimmed) ? `${prefix}/${trimmed}` : trimmed
}

/**
 * Fills `{{name}}` and `{{field:NAME}}`; unknown placeholders become empty, runs of blank lines one.
 * @param {string} template
 * @param {Record<string, string>} values
 * @param {NoteRecord} record
 */
export function renderTemplate(template, values, record) {
  return template
    .replace(/\{\{\s*field:([^}]+?)\s*\}\}/g, (_match, field) =>
      list(record.fields[field.trim()]).length > 1
        ? list(record.fields[field.trim()]).join('; ')
        : scalar(record.fields[field.trim()])
    )
    .replace(/\{\{\s*([A-Za-z]+)\s*\}\}/g, (_match, name) =>
      Object.hasOwn(values, name) ? values[name] : ''
    )
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Whole words of the slug within `max` characters of letters, digits and hyphens. */
export function toWorkspaceName(slug, max) {
  const words = slug
    .replace(/[^A-Za-z0-9-]+/g, '-')
    .split('-')
    .filter(Boolean)
  let name = ''
  for (const word of words) {
    const next = name ? `${name}-${word}` : word
    if (next.length > max) {
      break
    }
    name = next
  }
  return name || words.join('-').slice(0, max).replace(/-+$/, '') || 'note'
}

/**
 * Key facts, then the note's body without its frontmatter.
 * @param {NoteRecord} record
 * @param {ItemContext} context
 */
export function noteBodyMarkdown(record, context) {
  const values = templateValues(record, context)
  const facts = [
    ['Status', record.statusText || record.status.label],
    ['Owner', record.owner && values.owner],
    ['Priority', record.priority],
    ['Base', values.base && `\`${values.base}\``],
    ['Labels', values.labels],
    ['Updated', record.updated],
    ['File', `\`${record.path}\``]
  ]
    .filter(([, value]) => value)
    .map(([label, value]) => `- **${label}:** ${value}`)
  const markdown = `${facts.join('\n')}\n\n${record.body.trim()}`.trim()
  return clip(markdown, BODY_MAX_CHARS)
}

/** @param {string} value @param {number} max */
function clip(value, max) {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value
}
