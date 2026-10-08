import { scalar } from './note-record.mjs'
import { isOpenWorkTone, TONE_ORDER } from './status-tones.mjs'

const ALL = 'all'
const NONE = 'none'
const OPEN_WORK = 'open-work'
const MINE = 'mine'
const OPTION_LIMIT = 100
const PRIORITIES = ['P0', 'P1', 'P2', 'P3']

/** @typedef {import('./note-record.mjs').NoteRecord} NoteRecord */
/** @typedef {import('./people.mjs').Person} Person */
/**
 * @typedef {{
 *   people: Map<string, Person>,
 *   me: string,
 *   filterFields: string[]
 * }} FilterContext
 */

/** The owner's identity: their people-file email when known, else the owner as written. */
export function ownerKey(owner, people) {
  const key = owner.trim().toLowerCase()
  return key ? (people.get(key)?.email ?? key) : ''
}

/** Filter id for a frontmatter field, e.g. "parent-stream" → "field-parent-stream". */
export function fieldFilterId(field) {
  const kebab = field
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `field-${kebab || 'value'}`.slice(0, 64)
}

/** @param {FilterContext} context */
function filterSpecs(context) {
  /** @type {{ id: string, defaultValue: string, valueOf: (record: NoteRecord) => string }[]} */
  const specs = [
    { id: 'status', defaultValue: OPEN_WORK, valueOf: (r) => r.status.key },
    { id: 'priority', defaultValue: ALL, valueOf: (r) => r.priority },
    { id: 'owner', defaultValue: ALL, valueOf: (r) => ownerKey(r.owner, context.people) }
  ]
  for (const field of context.filterFields) {
    specs.push({
      id: fieldFilterId(field),
      defaultValue: ALL,
      valueOf: (r) => scalar(r.fields[field])
    })
  }
  return specs
}

/**
 * Selected values per filter; unknown ids and values no longer offered fall back to the default.
 * @param {Record<string, string> | undefined} raw
 * @param {FilterContext} context
 * @param {Map<string, Set<string>>} [allowed]
 */
export function resolveSelection(raw, context, allowed) {
  /** @type {Record<string, string>} */
  const selection = { label: ALL }
  for (const spec of filterSpecs(context)) {
    selection[spec.id] = spec.defaultValue
  }
  for (const id of Object.keys(selection)) {
    const value = raw?.[id]
    if (typeof value === 'string' && (!allowed || allowed.get(id)?.has(value))) {
      selection[id] = value
    }
  }
  return selection
}

/**
 * @param {NoteRecord} record
 * @param {Record<string, string>} selection
 * @param {FilterContext} context
 */
function matchesSelection(record, selection, context) {
  for (const spec of filterSpecs(context)) {
    const selected = selection[spec.id] ?? spec.defaultValue
    const actual = spec.valueOf(record)
    if (spec.id === 'status' && selected === OPEN_WORK) {
      if (!isOpenWorkTone(record.status.tone)) {
        return false
      }
    } else if (spec.id === 'owner' && selected === MINE) {
      if (!context.me || actual !== ownerKey(context.me, context.people)) {
        return false
      }
    } else if (!matchesValue(actual, selected)) {
      return false
    }
  }
  const label = selection.label ?? ALL
  return (
    label === ALL || (label === NONE ? record.labels.length === 0 : record.labels.includes(label))
  )
}

/** @param {string} actual @param {string} selected */
function matchesValue(actual, selected) {
  return selected === ALL || (selected === NONE ? !actual : actual === selected)
}

/** Every whitespace-separated term must appear in the title, path, owner, labels or status. */
function matchesQuery(record, terms, people) {
  if (terms.length === 0) {
    return true
  }
  const person = people.get(record.owner.toLowerCase())
  const haystack = [
    record.title,
    record.path,
    record.owner,
    person?.name ?? '',
    record.statusText,
    ...record.labels
  ]
    .join('\n')
    .toLowerCase()
  return terms.every((term) => haystack.includes(term))
}

/**
 * @param {NoteRecord[]} records
 * @param {{ query: string, selection: Record<string, string>, context: FilterContext }} options
 */
export function filterAndSortNotes(records, options) {
  const terms = options.query.toLowerCase().split(/\s+/).filter(Boolean)
  return records
    .filter(
      (record) =>
        matchesSelection(record, options.selection, options.context) &&
        matchesQuery(record, terms, options.context.people)
    )
    .sort(compareNotes)
}

/** @param {string} priority */
function priorityRank(priority) {
  const index = PRIORITIES.indexOf(priority)
  return index !== -1 ? index : priority ? PRIORITIES.length : PRIORITIES.length + 1
}

/** Priority (P0 first, unset last), then most recently updated, then title. */
export function compareNotes(a, b) {
  return (
    priorityRank(a.priority) - priorityRank(b.priority) ||
    (b.updated > a.updated ? 1 : b.updated < a.updated ? -1 : 0) ||
    a.title.localeCompare(b.title)
  )
}

/**
 * Filters with counts over all notes, and the values each one accepts.
 * @param {NoteRecord[]} records
 * @param {FilterContext} context
 */
export function buildNoteFilters(records, context) {
  const statuses = new Map(records.map((r) => [r.status.key, r.status]))
  const statusRank = (key) => TONE_ORDER.indexOf(statuses.get(key)?.tone ?? 'open')
  const ownerLabel = (key) => {
    const person = context.people.get(key)
    return (
      person?.name ?? records.find((r) => ownerKey(r.owner, context.people) === key)?.owner ?? key
    )
  }
  const meKey = context.me ? ownerKey(context.me, context.people) : ''
  const valueFilter = (id, label, valueOf, compare, labelOf = (value) => value, noneLabel) => ({
    id,
    label,
    defaultValue: ALL,
    options: [
      option(ALL, 'All', records.length),
      ...distinct(records, valueOf, compare).map((value) =>
        option(
          value,
          labelOf(value),
          count(records, (r) => valueOf(r) === value)
        )
      ),
      ...noneOption(records, (r) => valueOf(r), noneLabel)
    ]
  })
  const filters = [
    {
      id: 'status',
      label: 'Status',
      defaultValue: OPEN_WORK,
      options: [
        option(
          OPEN_WORK,
          'Open work',
          count(records, (r) => isOpenWorkTone(r.status.tone))
        ),
        option(ALL, 'All', records.length),
        ...distinct(
          records,
          (r) => r.status.key,
          (a, b) => statusRank(a) - statusRank(b) || a.localeCompare(b)
        ).map((key) =>
          option(
            key,
            statuses.get(key)?.label ?? key,
            count(records, (r) => r.status.key === key)
          )
        )
      ]
    },
    valueFilter(
      'priority',
      'Priority',
      (r) => r.priority,
      (a, b) => priorityRank(a) - priorityRank(b) || a.localeCompare(b),
      undefined,
      'No priority'
    ),
    (() => {
      const owner = valueFilter(
        'owner',
        'Owner',
        (r) => ownerKey(r.owner, context.people),
        (a, b) => ownerLabel(a).localeCompare(ownerLabel(b)),
        ownerLabel,
        'No owner'
      )
      if (meKey) {
        owner.options.splice(
          1,
          0,
          option(
            MINE,
            'Mine',
            count(records, (r) => ownerKey(r.owner, context.people) === meKey)
          )
        )
      }
      return owner
    })(),
    {
      id: 'label',
      label: 'Label',
      defaultValue: ALL,
      options: [
        option(ALL, 'All', records.length),
        ...[...new Set(records.flatMap((r) => r.labels))]
          .sort((a, b) => a.localeCompare(b))
          .map((label) =>
            option(
              label,
              label,
              count(records, (r) => r.labels.includes(label))
            )
          ),
        ...(records.some((r) => r.labels.length === 0)
          ? [
              option(
                NONE,
                'No label',
                count(records, (r) => r.labels.length === 0)
              )
            ]
          : [])
      ]
    },
    ...context.filterFields.map((field) =>
      valueFilter(
        fieldFilterId(field),
        field.slice(0, 64),
        (r) => scalar(r.fields[field]),
        (a, b) => a.localeCompare(b),
        undefined,
        'Not set'
      )
    )
  ].map((filter) => ({ ...filter, options: filter.options.slice(0, OPTION_LIMIT) }))

  /** @type {Map<string, Set<string>>} */
  const allowed = new Map(
    filters.map((filter) => [filter.id, new Set(filter.options.map((entry) => entry.value))])
  )
  return { filters, allowed }
}

function option(value, label, optionCount) {
  const clipped = label.length > 128 ? `${label.slice(0, 127)}…` : label
  return { value: value.slice(0, 256), label: clipped || '(empty)', count: optionCount }
}

function noneOption(records, valueOf, label) {
  const missing = count(records, (r) => !valueOf(r))
  return missing > 0 ? [option(NONE, label, missing)] : []
}

function distinct(records, valueOf, compare) {
  return [...new Set(records.map(valueOf).filter(Boolean))].sort(compare)
}

function count(records, predicate) {
  let total = 0
  for (const record of records) {
    if (predicate(record)) {
      total++
    }
  }
  return total
}
