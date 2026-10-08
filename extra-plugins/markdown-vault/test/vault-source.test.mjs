import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createVaultSource } from '../src/vault-source.mjs'
import { fakeHost, noteText, PROJECTS } from './fixtures.mjs'

const CONFIG = [
  '---',
  'base-field: parent-stream',
  'work-project: //depot/main',
  'agent-message: Ship {{title}}.',
  '---',
  '',
  'This folder lists plans for the Markdown Vault plugin.'
].join('\n')

function vaultFiles(withConfig = true) {
  const files = new Map([
    [
      'plans/a.md',
      {
        text: noteText({
          title: 'Alpha',
          status: 'Active',
          owner: 'mia@example.com',
          'parent-stream': 'dev'
        }),
        version: 'v1'
      }
    ],
    ['plans/b.md', { text: noteText({ title: 'Beta', status: 'Done' }), version: 'v1' }]
  ])
  if (withConfig) {
    files.set('plans/markdown-vault.md', { text: CONFIG, version: 'c1' })
  }
  return files
}

const SETTINGS = { project: 'vault', folder: 'plans', me: 'mia@example.com' }

test('lists the notes, configured by the folder note, which itself is not listed', async () => {
  const fake = fakeHost({ settings: SETTINGS, projects: PROJECTS, files: vaultFiles() })
  const source = createVaultSource({ host: fake.host })

  const result = await source.list({ query: '', filters: {} })

  assert.deepEqual(
    result.items.map((item) => item.id),
    ['plans/a.md']
  )
  assert.deepEqual(result.items[0].start, {
    workspaceName: 'a',
    projectSource: '//depot/main',
    baseRef: 'dev',
    agentPrompt: 'Ship Alpha.',
    linkMetadata: { note: 'plans/a.md' }
  })
  assert.equal(result.notice, '1 of 2 notes, latest on the server.')
  assert.ok(result.filters.find((f) => f.id === 'owner').options.some((o) => o.value === 'mine'))
  await assert.rejects(source.get({ itemId: 'plans/markdown-vault.md' }), /no note/)
})

test('without a config note the defaults apply and Start works in the vault project', async () => {
  const fake = fakeHost({ settings: SETTINGS, projects: PROJECTS, files: vaultFiles(false) })
  const result = await createVaultSource({ host: fake.host }).list({})
  assert.equal(result.items[0].start.projectId, 'vault')
  assert.match(result.items[0].start.agentPrompt, /Work on the note "Alpha" \(plans\/a.md\)/)
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
  assert.equal(fake.calls.filter((call) => call.method === 'projects.listMarkdown').length, 1)

  fake.files.set('plans/b.md', {
    text: noteText({ title: 'Beta 2', status: 'Active' }),
    version: 'v2'
  })
  clock += 31_000
  const result = await source.list({})
  assert.deepEqual(reads().sort(), [
    'plans/a.md',
    'plans/b.md',
    'plans/b.md',
    'plans/markdown-vault.md'
  ])
  assert.ok(result.items.some((item) => item.title === 'Beta 2'))
})

test('a new session starts from the saved notes instead of reading every file again', async () => {
  const storage = new Map()
  const first = fakeHost({ settings: SETTINGS, projects: PROJECTS, files: vaultFiles(), storage })
  await createVaultSource({ host: first.host }).list({})
  assert.ok([...storage.keys()].some((key) => key.endsWith(':meta')))

  const second = fakeHost({ settings: SETTINGS, projects: PROJECTS, files: vaultFiles(), storage })
  const result = await createVaultSource({ host: second.host }).list({})
  assert.equal(second.calls.filter((call) => call.method === 'projects.readMarkdown').length, 0)
  assert.equal(result.items[0].title, 'Alpha')
  assert.equal(result.items[0].start.projectSource, '//depot/main')
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
