import { test, expect } from '@playwright/test'

test('branch picker lists branches and tags in distinct sections', async ({ page }) => {
  await page.goto('/')
  // Open the picker.
  await page.locator('.branch-picker-trigger').first().click()

  // Sections should be present.
  await expect(page.locator('.branch-picker-section', { hasText: 'Branches' })).toBeVisible()
  await expect(page.locator('.branch-picker-section', { hasText: 'Tags' })).toBeVisible()

  // Branches: main + feature/x (sorted case-insensitively).
  await expect(page.locator('.branch-picker-item', { hasText: 'feature/x' })).toBeVisible()
  await expect(page.locator('.branch-picker-item', { hasText: 'main' })).toBeVisible()

  // Tag: v0.1.0.
  await expect(page.locator('.branch-picker-item', { hasText: 'v0.1.0' })).toBeVisible()
})

test('selecting feature/x navigates with URL-encoded slash', async ({ page }) => {
  await page.goto('/')
  await page.locator('.branch-picker-trigger').first().click()
  await page.locator('.branch-picker-item', { hasText: 'feature/x' }).click()
  await expect(page).toHaveURL(/\/git\/commits\?ref=feature%2Fx$/)
})
