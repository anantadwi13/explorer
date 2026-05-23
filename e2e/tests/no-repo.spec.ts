import { test, expect } from '@playwright/test'

test('no branch picker or changes badge appears in non-repo mode', async ({ page }) => {
  await page.goto('/')
  // Wait for the SPA to settle (i.e., /api/git/info to complete).
  await page.waitForLoadState('networkidle')
  await expect(page.locator('.branch-picker')).toHaveCount(0)
  await expect(page.locator('.changes-badge')).toHaveCount(0)
})

test('navigating to /git/commits shows the NoGitRepo placeholder', async ({ page }) => {
  await page.goto('/git/commits')
  await expect(page.getByRole('heading', { name: /Not a git repository/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /Back to the file browser/ })).toBeVisible()
})
