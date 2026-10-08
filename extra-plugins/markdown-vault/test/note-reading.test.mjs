import assert from 'node:assert/strict'
import { test } from 'node:test'
import { toNoteRecord } from '../src/note-record.mjs'
import { parsePeople, describeOwner } from '../src/people.mjs'
import { resolveSettings } from '../src/settings.mjs'
import { parseStatusTones, resolveStatus } from '../src/status-tones.mjs'
import { noteText } from './fixtures.mjs'

const settings = resolveSettings({})

test('status words map to tones; long statuses keep their leading known phrase', () => {
  const tones = parseStatusTones(
    'active: in progress, doing\ndone: shipped\nbogus: x\nclosed: parked'
  )
  assert.deepEqual(
    [...tones],
    [
      ['in progress', 'active'],
      ['doing', 'active'],
      ['shipped', 'done'],
      ['parked', 'closed']
    ]
  )
  assert.deepEqual(resolveStatus('In-Progress since Monday', tones), {
    key: 'in progress',
    label: 'In progress',
    tone: 'active'
  })
  assert.deepEqual(resolveStatus('Shipped', tones), {
    key: 'shipped',
    label: 'Shipped',
    tone: 'done'
  })
  assert.deepEqual(resolveStatus('Needs design', tones), {
    key: 'needs design',
    label: 'Needs design',
    tone: 'open'
  })
  assert.equal(
    resolveStatus('Draft for review (2026-10-07). Waits on the checks.', tones).key,
    'draft'
  )
  assert.deepEqual(resolveStatus('', tones), { key: 'none', label: 'No status', tone: 'open' })
})

test('a note reads through the configured fields', () => {
  const record = toNoteRecord(
    {
      path: 'plans/open-stance.md',
      text: noteText({
        state: 'in_progress',
        status: 'Waiting for art',
        priority: 'p1',
        owner: 'mia@example.com',
        tags: '["#ai", animation, ai]',
        updated: '2026-10-01'
      })
    },
    settings
  )
  assert.equal(record.slug, 'open-stance')
  assert.equal(record.title, 'Note')
  assert.equal(record.statusText, 'in_progress')
  assert.deepEqual(record.status, { key: 'in progress', label: 'In progress', tone: 'active' })
  assert.equal(record.priority, 'P1')
  assert.deepEqual(record.labels, ['ai', 'animation'])

  const custom = resolveSettings({
    statusFields: 'phase',
    titleField: 'name',
    labelsField: 'areas'
  })
  const other = toNoteRecord(
    { path: 'x.md', text: noteText({ name: 'Custom', phase: 'Shipped', areas: 'ui, net' }) },
    custom
  )
  assert.equal(other.title, 'Custom')
  assert.equal(other.status.tone, 'done')
  assert.deepEqual(other.labels, ['ui', 'net'])
})

test('people come from any table with email and name columns, by email, login, name or alias', () => {
  const people = parsePeople(
    [
      '| Name | Email | Aliases |',
      '|---|---|---|',
      '| **Mia Example** | `Mia@Example.com` | mia e, Mimi |',
      '| No mail | — | |'
    ].join('\n')
  )
  for (const key of ['mia@example.com', 'mia', 'mia example', 'mimi', 'mia e']) {
    assert.deepEqual(people.get(key), { name: 'Mia Example', email: 'mia@example.com' }, key)
  }
  assert.equal(people.size, 5)
  assert.equal(describeOwner('mia', people.get('mia')), 'Mia Example (mia@example.com)')
  assert.equal(describeOwner('someone', undefined), 'someone')
})

test('settings fall back on bad values and parse their small formats', () => {
  const resolved = resolveSettings({
    folder: '\\docs\\plans\\',
    source: 'elsewhere',
    filterFields: 'a, b, c, d, e',
    startWithoutAgentWhen: 'agent_mode = Manual',
    linkNotes: 'plan: {{path}}\n1bad: x\ntask: Do {{title}}\nempty:',
    basePrefix: '//depot/'
  })
  assert.equal(resolved.folder, 'docs/plans')
  assert.equal(resolved.source, 'latest')
  assert.deepEqual(resolved.filterFields, ['a', 'b', 'c', 'd'])
  assert.deepEqual(resolved.startWithoutAgentWhen, { field: 'agent_mode', value: 'manual' })
  assert.deepEqual(resolved.linkNotes, [
    { key: 'plan', template: '{{path}}' },
    { key: 'task', template: 'Do {{title}}' }
  ])
  assert.equal(resolved.basePrefix, '//depot')
  assert.equal(resolveSettings({ folder: '../outside' }).folder, '')
})
