import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseNote, toNoteRecord } from '../src/note-record.mjs'
import { resolveSettings } from '../src/settings.mjs'
import { parseStatusTones, resolveStatus } from '../src/status-tones.mjs'
import { noteText } from './fixtures.mjs'

const settings = resolveSettings({})

function record(path, text, using = settings) {
  return toNoteRecord({ path, ...parseNote(text) }, using)
}

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

test('a note reads through the default fields', () => {
  const note = record(
    'plans/open-stance.md',
    noteText({
      state: 'in_progress',
      status: 'Waiting for art',
      priority: 'p1',
      owner: 'mia@example.com',
      tags: '["#ai", animation, ai]',
      updated: '2026-10-01'
    })
  )
  assert.equal(note.slug, 'open-stance')
  assert.equal(note.title, 'Note')
  assert.equal(note.statusText, 'in_progress')
  assert.deepEqual(note.status, { key: 'in progress', label: 'In progress', tone: 'active' })
  assert.equal(note.priority, 'P1')
  assert.deepEqual(note.labels, ['ai', 'animation'])
})

test('the vault config note renames fields and sets the start behaviour for everyone', () => {
  const config = parseNote(
    [
      '---',
      'status-fields: [phase]',
      'title-field: name',
      'labels-field: areas',
      'status-words: |',
      '  done: landed',
      '  active: cooking',
      'work-project: //depot/main',
      'base-field: parent-stream',
      'base-prefix: //depot/',
      'filters: [team, area, kind, size, extra]',
      'start-without-agent-when: mode = Manual',
      'agent-message: |',
      '  Do {{title}}.',
      '',
      '  Read {{path}} first.',
      'link-notes:',
      '  - plan: {{path}}',
      '  - 1bad: x',
      '  - task: Do {{title}}',
      '---',
      '',
      '# How this vault works'
    ].join('\n')
  ).fields
  const configured = resolveSettings({ folder: '\\plans\\', source: 'elsewhere' }, config)
  assert.equal(configured.folder, 'plans')
  assert.equal(configured.source, 'latest')
  assert.deepEqual(configured.statusFields, ['phase'])
  assert.deepEqual(configured.filterFields, ['team', 'area', 'kind', 'size'])
  assert.equal(configured.workProjectSource, '//depot/main')
  assert.equal(configured.basePrefix, '//depot')
  assert.deepEqual(configured.startWithoutAgentWhen, { field: 'mode', value: 'manual' })
  assert.equal(configured.agentMessage, 'Do {{title}}.\n\nRead {{path}} first.')
  assert.deepEqual(configured.linkNotes, [
    { key: 'plan', template: '{{path}}' },
    { key: 'task', template: 'Do {{title}}' }
  ])

  const note = record(
    'x.md',
    noteText({ name: 'Custom', phase: 'Landed', areas: 'ui, net' }),
    configured
  )
  assert.equal(note.title, 'Custom')
  assert.equal(note.status.tone, 'done')
  assert.deepEqual(note.labels, ['ui', 'net'])
  assert.equal(resolveSettings({ folder: '../outside' }).folder, '')
})
