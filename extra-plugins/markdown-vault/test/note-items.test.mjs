import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  buildNoteFilters,
  fieldFilterId,
  filterAndSortNotes,
  resolveSelection
} from '../src/note-filters.mjs'
import { noteBodyMarkdown, renderTemplate, toTaskItem, toWorkspaceName } from '../src/note-item.mjs'
import { toNoteRecord } from '../src/note-record.mjs'
import { parsePeople } from '../src/people.mjs'
import { resolveSettings } from '../src/settings.mjs'
import { noteText } from './fixtures.mjs'

const people = parsePeople('| Name | Email |\n|---|---|\n| Mia Example | mia@example.com |\n')
const settings = resolveSettings({
  filterFields: 'mode, parent-stream',
  baseField: 'parent-stream',
  basePrefix: '//depot',
  startWithoutAgentWhen: 'mode=manual',
  promptTemplate: 'Do {{title}} ({{path}}) for {{owner}} on {{base}}. Checks: {{field:acceptance}}',
  linkNotes: 'plan: {{path}}\ntask: {{title}}'
})

function note(path, fields, body) {
  return toNoteRecord({ path, text: noteText(fields, body) }, settings)
}

const records = [
  note('plans/a.md', {
    title: 'Alpha',
    status: 'Active',
    priority: 'P1',
    owner: 'mia',
    tags: 'ui',
    updated: '2026-10-02',
    mode: 'assisted',
    'parent-stream': 'main-dev',
    acceptance: '[Looks right, Runs fast]',
    model: 'opus',
    effort: 'High'
  }),
  note('plans/b.md', { title: 'Beta', status: 'Done', priority: 'P0', owner: 'bo@example.com' }),
  note('plans/c.md', {
    title: 'Gamma',
    status: 'Draft for review',
    mode: 'manual',
    updated: '2026-10-05'
  }),
  note('plans/d.md', { title: 'Delta', status: 'Draft', priority: 'P1', updated: '2026-10-09' })
]
const context = { people, me: 'Mia Example', filterFields: settings.filterFields }

test('open work is the default view, sorted by priority then most recently updated', () => {
  const selection = resolveSelection({}, context)
  const shown = filterAndSortNotes(records, { query: '', selection, context })
  assert.deepEqual(
    shown.map((r) => r.title),
    ['Delta', 'Alpha', 'Gamma']
  )
})

test('filters offer statuses, mine, labels and extra fields, and drop values no longer offered', () => {
  const { filters, allowed } = buildNoteFilters(records, context)
  assert.deepEqual(
    filters.map((filter) => filter.id),
    ['status', 'priority', 'owner', 'label', 'field-mode', 'field-parent-stream']
  )
  const owner = filters.find((filter) => filter.id === 'owner')
  assert.deepEqual(owner.options.slice(0, 2), [
    { value: 'all', label: 'All', count: 4 },
    { value: 'mine', label: 'Mine', count: 1 }
  ])
  assert.ok(owner.options.some((o) => o.value === 'mia@example.com' && o.label === 'Mia Example'))

  const selection = resolveSelection(
    { owner: 'mine', [fieldFilterId('mode')]: 'assisted', label: 'nowhere' },
    context,
    allowed
  )
  assert.equal(selection.label, 'all')
  const shown = filterAndSortNotes(records, { query: 'alp', selection, context })
  assert.deepEqual(
    shown.map((r) => r.title),
    ['Alpha']
  )
})

test('a note starts a workspace prefilled from its fields and the templates', () => {
  const itemContext = {
    settings,
    person: (owner) => people.get(owner.toLowerCase()),
    workProjectId: 'work',
    workSourceControl: 'perforce'
  }
  const item = toTaskItem(records[0], itemContext)
  assert.equal(item.owner, 'Mia Example')
  assert.deepEqual(item.start, {
    workspaceName: 'a',
    projectId: 'work',
    baseRef: '//depot/main-dev',
    agentPrompt:
      'Do Alpha (plans/a.md) for Mia Example (mia@example.com) on //depot/main-dev. Checks: Looks right; Runs fast',
    sessionOptions: { agent: 'claude', model: 'opus', effort: 'high' },
    linkMetadata: { plan: 'plans/a.md', task: 'Alpha' }
  })

  const manual = toTaskItem(records[2], itemContext)
  assert.equal(Object.hasOwn(manual.start, 'agentPrompt'), false)
  assert.equal(Object.hasOwn(manual.start, 'sessionOptions'), false)

  const done = toTaskItem(records[1], itemContext)
  assert.equal(Object.hasOwn(done, 'start'), false)
  assert.equal(done.startBlockedReason, 'This note is done.')

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
