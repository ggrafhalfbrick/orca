/**
 * Invariant: a plugin task source shows on the Tasks page only after visible
 * consent, lists and filters its items, and its Start action only prefills
 * Create workspace for the user to review; nothing is created on its own.
 */

import { cp, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Page } from '@stablyai/playwright-test'
import { expect, test } from './helpers/orca-app'

async function enableFromPluginSettings(page: Page, pluginKey: string): Promise<void> {
  await page.evaluate(() => {
    const state = window.__store?.getState()
    if (!state) {
      throw new Error('store unavailable')
    }
    state.openSettingsTarget({ pane: 'plugins', repoId: null })
    state.openSettingsPage()
  })
  await expect(page.locator('[data-settings-section="plugins"]')).toBeVisible()
  await page.getByRole('tab', { name: /^Installed/ }).click()
  const row = page.locator(`[data-plugin-key="${pluginKey}"]`)
  await row.getByRole('button', { name: 'Review & enable' }).click()
  const consent = page.getByRole('dialog', { name: 'Review permissions' })
  await expect(consent).toContainText('Add task lists to the Tasks page')
  await consent.getByRole('button', { name: 'Enable plugin' }).click()
  await expect(row).toContainText('Enabled')
}

// Why: screenshots taken mid slide-in/out show half-drawn sheets and dialogs.
async function settleAnimations(page: Page): Promise<void> {
  await page.evaluate(() =>
    Promise.all(document.getAnimations().map((animation) => animation.finished.catch(() => null)))
  )
}

async function countWorktrees(page: Page): Promise<number> {
  return page.evaluate(() => {
    const state = window.__store?.getState()
    return state ? Object.values(state.worktreesByRepo).flat().length : -1
  })
}

test('lists plugin tasks and prefills Create workspace from a start recipe', async ({
  orcaPage
}, testInfo) => {
  const tempRoot = await mkdtemp(join(tmpdir(), 'orca-task-source-plugin-e2e-'))
  const pluginRoot = join(tempRoot, 'hello-tasks')
  await cp(join(process.cwd(), 'examples', 'plugins', 'hello-tasks'), pluginRoot, {
    recursive: true
  })

  try {
    const pluginKey = await orcaPage.evaluate(async (sourcePath) => {
      const settings = await window.api.settings.set({ pluginSystemEnabled: true })
      window.__store?.setState({ settings })
      const result = await window.api.plugins.install({ kind: 'local-path', path: sourcePath })
      if (!result.ok) {
        throw new Error(result.error)
      }
      await window.api.plugins.refresh()
      return result.pluginKey
    }, pluginRoot)

    await enableFromPluginSettings(orcaPage, pluginKey)
    const worktreesBefore = await countWorktrees(orcaPage)

    await orcaPage.evaluate(() => {
      const state = window.__store?.getState()
      state?.closeSettingsPage()
      state?.openTaskPage()
    })
    const sourceTab = orcaPage.getByRole('button', { name: 'Hello Tasks', exact: true })
    await expect(sourceTab).toBeVisible({ timeout: 15_000 })
    await sourceTab.click()
    await expect(sourceTab).toHaveAttribute('aria-pressed', 'true')
    await expect(orcaPage.getByRole('heading', { name: 'Wire up the login form' })).toBeVisible({
      timeout: 15_000
    })
    await expect(orcaPage.getByRole('heading', { name: 'Fix the flaky upload test' })).toBeVisible()
    await orcaPage.screenshot({ path: testInfo.outputPath('plugin-task-list.png') })

    await orcaPage.getByRole('combobox', { name: 'Status' }).click()
    await orcaPage.getByRole('option', { name: 'Blocked' }).click()
    await expect(
      orcaPage.getByRole('heading', { name: 'Design review of the settings page' })
    ).toBeVisible()
    await expect(orcaPage.getByRole('heading', { name: 'Wire up the login form' })).toBeHidden()

    await orcaPage.getByRole('combobox', { name: 'Status' }).click()
    await orcaPage.getByRole('option', { name: 'All' }).click()
    await orcaPage.getByRole('heading', { name: 'Wire up the login form' }).click()
    const detail = orcaPage.getByRole('dialog', { name: 'Wire up the login form' })
    await expect(detail).toContainText('Users can sign in with email and password.')
    await settleAnimations(orcaPage)
    await orcaPage.screenshot({ path: testInfo.outputPath('plugin-task-detail.png') })

    await detail.getByRole('button', { name: 'Start workspace' }).click()
    const agentPrompt = orcaPage.getByLabel('Agent prompt')
    await expect(agentPrompt).toHaveValue(
      'Build the login form described in docs/login.md, with tests.'
    )
    await settleAnimations(orcaPage)
    await orcaPage.screenshot({ path: testInfo.outputPath('plugin-task-composer.png') })

    await orcaPage.keyboard.press('Escape')
    await expect(agentPrompt).toBeHidden()
    expect(await countWorktrees(orcaPage)).toBe(worktreesBefore)
  } finally {
    await rm(tempRoot, { recursive: true, force: true })
  }
})
