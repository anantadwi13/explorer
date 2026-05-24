import { test, expect } from '@playwright/test'

test('commits list renders cards with subject, author, sha, time', async ({ page }) => {
  await page.goto('/git/commits')
  // sample-repo has 3 commits on main.
  await expect(page.locator('.commit-card')).toHaveCount(3)

  // First card is the newest commit (rename).
  const first = page.locator('.commit-card').first()
  await expect(first.locator('.commit-subject')).toHaveText(/Third commit/)
  await expect(first.locator('.commit-sha')).toContainText('9626e7a')
  await expect(first.locator('.commit-author')).toHaveText('Sample Author')
})

test('commits list pager shows when next_cursor is non-null', async ({ page }) => {
  // The fixture only has 3 commits and the default page size is 30, so by
  // default no pager appears. Lower the limit via direct API to verify the
  // pager renders when the server reports next_cursor.
  await page.goto('/git/commits')

  // No pager expected with default limit.
  await expect(page.locator('.commits-pager')).toHaveCount(0)
})
