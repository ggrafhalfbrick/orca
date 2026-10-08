import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createVaultSource } from '../src/vault-source.mjs'
import { fakeHost, noteText, PROJECTS } from './fixtures.mjs'

function vaultFiles() {
  return new Map([
    [
      'plans/a.md',
      { text: noteText({ title: 'Alpha', status: 'Active', owner: 'mia' }), version: 'v1' }
    ],
    ['plans/b.md', { text: noteText({ title: 'Beta', status: 'Done' }), version: 'v1' }],
    [
      'team/people.md',
      { text: '| Name | Email |\n|---|---|\n| Mia Example | mia@example.com |\n', version: 'p1' }
    ]
  ])
}

const SETTINGS = {
  project: 'vault',
  folder: 'plans',
  peopleFile: 'team/people.md',
  workProject: 'work'
}

test('lists notes from the vault project and names owners from the people file', async () => {
  const fake = fakeHost({ settings: SETTINGS, projects: PROJECTS, files: vaultFiles() })
  const source = createVaultSource({ host: fake.host })

  const result = await source.list({ query: '', filters: {} })

  assert.deepEqual(
    result.items.map((item) => [item.id, item.owner ?? '']),
    [['plans/a.md', 'Mia Example']]
  )
  assert.equal(result.items[0].start.projectId, 'work')
  assert.equal(result.notice, '1 of 2 notes, latest on the server.')
  assert.ok(result.filters.some((filter) => filter.id === 'status'))
})

test('asks the server again only after 30 seconds, and reads only notes whose version changed', async () => {
  let clock = 1_000
  const fake = fakeHost({ settings: SETTINGS, projects: PROJECTS, files: vaultFiles() })
  const source = createVaultSource({ host: fake.host, now: () => clock })
  const reads = () =>
    fake.calls
      .filter((call) => call.method === 'projects.readMarkdown')
      .flatMap((call) => call.params.files.map((file) => file.path))

  await source.list({})
  await source.list({ query: 'alpha' })
  assert.equal(fake.calls.filter((call) => call.method === 'projects.listMarkdown').length, 2)

  fake.files.set('plans/b.md', {
    text: noteText({ title: 'Beta 2', status: 'Active' }),
    version: 'v2'
  })
  clock += 31_000
  const result = await source.list({})
  assert.deepEqual(
    reads().filter((path) => path.startsWith('plans/')),
    ['plans/a.md', 'plans/b.md', 'plans/b.md']
  )
  assert.ok(result.items.some((item) => item.title === 'Beta 2'))
})

test('a new session starts from the saved notes instead of reading every file again', async () => {
  const storage = new Map()
  const first = fakeHost({ settings: SETTINGS, projects: PROJECTS, files: vaultFiles(), storage })
  await createVaultSource({ host: first.host }).list({})
  assert.ok([...storage.keys()].some((key) => key.endsWith(':meta')))

  const second = fakeHost({ settings: SETTINGS, projects: PROJECTS, files: vaultFiles(), storage })
  const result = await createVaultSource({ host: second.host }).list({})
  const noteReads = second.calls
    .filter((call) => call.method === 'projects.readMarkdown')
    .flatMap((call) => call.params.files.map((file) => file.path))
    .filter((path) => path.startsWith('plans/'))
  assert.deepEqual(noteReads, [])
  assert.equal(result.items[0].title, 'Alpha')
})

test('the detail reads the note as it is now, body included', async () => {
  const fake = fakeHost({ settings: SETTINGS, projects: PROJECTS, files: vaultFiles() })
  const source = createVaultSource({ host: fake.host })

  const detail = await source.get({ itemId: 'plans/a.md' })

  assert.equal(detail.item.title, 'Alpha')
  assert.match(detail.bodyMarkdown, /- \*\*File:\*\* `plans\/a.md`/)
  assert.match(detail.bodyMarkdown, /Body text\./)
  await assert.rejects(source.get({ itemId: 'plans/missing.md' }), /no note plans\/missing.md/)
})

test('says what to set up instead of failing when the vault project is unset or gone', async () => {
  const unset = fakeHost({ settings: {}, projects: PROJECTS })
  assert.deepEqual(await createVaultSource({ host: unset.host }).list({}), {
    items: [],
    notice: 'Pick the vault project in Settings > Plugins > Markdown Vault.'
  })
  const gone = fakeHost({ settings: { project: 'deleted' }, projects: PROJECTS })
  const result = await createVaultSource({ host: gone.host }).list({})
  assert.match(result.notice, /no longer in Orca/)
})
