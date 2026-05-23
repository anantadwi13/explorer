import { test, expect } from '@playwright/test'

test('dark theme applies diff add/del backgrounds', async ({ page }) => {
  // Set the theme before navigating so the inline init script picks it up
  // and the SPA mounts in dark mode without a flash.
  await page.addInitScript(() => {
    localStorage.setItem('explorer.theme', 'dark')
  })
  await page.goto('/git/commits/9626e7a127f9549c58c7b3dbf20e00b3cc65f868')

  // The hunk auto-expands for the rename, so we can inspect a diff line.
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  const card = page.locator('.diff-line-add').first()
  await expect(card).toBeVisible()
  // Computed background should be the dark-theme green tint (any non-empty bg
  // that isn't transparent works for this smoke check).
  const bg = await card.evaluate((el) => getComputedStyle(el).backgroundColor)
  expect(bg).not.toBe('rgba(0, 0, 0, 0)')
})
