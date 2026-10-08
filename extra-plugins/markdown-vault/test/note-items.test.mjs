import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  buildNoteFilters,
  fieldFilterId,
  filterAndSortNotes,
  pickFilterFields,
  resolveSelection
} from '../src/note-filters.mjs'
import { noteBodyMarkdown, renderTemplate, toTaskItem, toWorkspaceName } from '../src/note-item.mjs'
import { parseNote, toNoteRecord } from '../src/note-record.mjs'
import { resolveSettings } from '../src/settings.mjs'
import { noteText } from './fixtures.mjs'

const settings = resolveSettings(
  { me: 'Mia@Example.com' },
  {
    'base-field': 'parent-stream',
    'base-prefix': '//depot',
    'start-without-agent-when': 'mode=manual',
    'agent-message':
      'Do {{title}} ({{path}}) for {{owner}} on {{base}}. Checks: {{field:acceptance}}',
    'link-notes': ['plan: {{path}}', 'task: {{title}}']
  }
)

function note(path, fields) {
  return toNoteRecord({ path, ...parseNote(noteText(fields)) }, settings)
}

const records = [
  note('plans/a.md', {
    title: 'Alpha',
    status: 'Active',
    priority: 'P1',
    owner: 'mia@example.com',
    tags: 'ui',
    updated: '2026-10-02',
    mode: 'assisted',
    'parent-stream': 'main-dev',
    acceptance: '[Looks right, Runs fast]',
    model: 'opus',
    effort: 'High',
    type: 'plan'
  }),
  note('plans/b.md', {
    title: 'Beta',
    status: 'Done',
    priority: 'P0',
    owner: 'bo@example.com',
    type: 'plan',
    mode: 'assisted'
  }),
  note('plans/c.md', {
    title: 'Gamma',
    status: 'Draft for review',
    mode: 'manual',
    updated: '2026-10-05',
    type: 'spec',
    'parent-stream': 'main-dev'
  }),
  note('plans/d.md', {
    title: 'Delta',
    status: 'Draft',
    priority: 'P1',
    updated: '2026-10-09',
    type: 'plan',
    note: 'one of a kind text'
  })
]

test('filter fields come from what the notes use, unless the config lists them', () => {
  assert.deepEqual(pickFilterFields(records, settings), ['type', 'mode'])
  assert.deepEqual(pickFilterFields(records, resolveSettings({}, { filters: 'parent-stream' })), [
    'parent-stream'
  ])
})

test('open work is the default view, sorted by priority then most recently updated', () => {
  const context = { me: settings.me, filterFields: [] }
  const shown = filterAndSortNotes(records, {
    query: '',
    selection: resolveSelection({}, context),
    context
  })
  assert.deepEqual(
    shown.map((r) => r.title),
    ['Delta', 'Alpha', 'Gamma']
  )
})

test('filters offer statuses, mine, labels and field values, and drop values no longer offered', () => {
  const context = { me: settings.me, filterFields: ['mode'] }
  const { filters, allowed } = buildNoteFilters(records, context)
  assert.deepEqual(
    filters.map((filter) => filter.id),
    ['status', 'priority', 'owner', 'label', 'field-mode']
  )
  const owner = filters.find((filter) => filter.id === 'owner')
  assert.deepEqual(owner.options.slice(0, 2), [
    { value: 'all', label: 'All', count: 4 },
    { value: 'mine', label: 'Mine', count: 1 }
  ])
  const selection = resolveSelection(
    { owner: 'mine', [fieldFilterId('mode')]: 'assisted', label: 'nowhere' },
    context,
    allowed
  )
  assert.equal(selection.label, 'all')
  assert.deepEqual(
    filterAndSortNotes(records, { query: 'alp', selection, context }).map((r) => r.title),
    ['Alpha']
  )
})

test('a note starts a workspace prefilled from its fields and the vault config', () => {
  const itemContext = { settings, vaultProjectId: 'vault', vaultSourceControl: 'git' }
  const item = toTaskItem(records[0], itemContext)
  assert.equal(item.owner, 'mia@example.com')
  assert.deepEqual(item.start, {
    workspaceName: 'a',
    projectId: 'vault',
    baseRef: '//depot/main-dev',
    agentPrompt:
      'Do Alpha (plans/a.md) for mia@example.com on //depot/main-dev. Checks: Looks right; Runs fast',
    sessionOptions: { agent: 'claude', model: 'opus', effort: 'high' },
    linkMetadata: { plan: 'plans/a.md', task: 'Alpha' }
  })

  const manual = toTaskItem(records[2], itemContext)
  assert.equal(Object.hasOwn(manual.start, 'agentPrompt'), false)
  assert.equal(Object.hasOwn(manual.start, 'sessionOptions'), false)

  const done = toTaskItem(records[1], itemContext)
  assert.equal(Object.hasOwn(done, 'start'), false)
  assert.equal(done.startBlockedReason, 'This note is done.')

  const elsewhere = toTaskItem(records[3], {
    ...itemContext,
    settings: resolveSettings({}, { 'work-project': '//depot/main' })
  })
  assert.equal(elsewhere.start.projectSource, '//depot/main')
  assert.equal(Object.hasOwn(elsewhere.start, 'projectId'), false)

  assert.match(noteBodyMarkdown(records[0], itemContext), /- \*\*Base:\*\* `\/\/depot\/main-dev`/)
})

test('workspace names keep whole words, shorter for Perforce copies', () => {
  assert.equal(toWorkspaceName('tablet-menus-ui-toolkit-migration', 24), 'tablet-menus-ui-toolkit')
  assert.equal(toWorkspaceName('Ünïcode name!', 24), 'n-code-name')
  assert.equal(toWorkspaceName('???', 24), 'note')
  assert.equal(
    renderTemplate('{{title}}\n\n\n\n{{nope}}{{field:missing}}', { title: 'T' }, records[3]),
    'T'
  )
})
