import { test, expect } from '@playwright/test'

test('status page renders Staged, Unstaged, Untracked sections', async ({ page }) => {
  await page.goto('/git/status')
  await expect(page.getByRole('heading', { name: /Staged/ })).toBeVisible()
  await expect(page.getByRole('heading', { name: /Unstaged/ })).toBeVisible()
  await expect(page.getByRole('heading', { name: /Untracked/ })).toBeVisible()

  // sample-repo: 1 staged (intro.md), 1 unstaged (README.md), 1 untracked (untracked.txt).
  // Scope the assertion to the status-page untracked list so it doesn't
  // collide with the same filename appearing in the sidebar tree.
  await expect(page.locator('.status-untracked li', { hasText: 'untracked.txt' })).toBeVisible()
})

test('untracked file row is a link to the file viewer in a new tab', async ({ page }) => {
  await page.goto('/git/status')
  const link = page.locator('.status-untracked-link', { hasText: 'untracked.txt' })
  await expect(link).toHaveAttribute('href', '/view/untracked.txt')
  await expect(link).toHaveAttribute('target', '_blank')
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer')
})

test('first 3 entries across staged+unstaged auto-expand', async ({ page }) => {
  await page.goto('/git/status')
  // The two FileDiffCards should be expanded on first paint (there are only 2
  // total — well under the 3-entry budget).
  const expanded = page.locator('.filediff-card.is-expanded')
  await expect(expanded).toHaveCount(2)
})
