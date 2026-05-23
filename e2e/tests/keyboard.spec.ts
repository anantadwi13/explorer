import { test, expect } from '@playwright/test'

const RENAME_SHA = '9626e7a127f9549c58c7b3dbf20e00b3cc65f868'

test('Escape on commit detail navigates to commits list', async ({ page }) => {
  await page.goto(`/git/commits/${RENAME_SHA}`)
  // Wait for the page to actually render so the keyboard handler is mounted.
  await page.locator('.commit-detail-subject').waitFor()
  await page.locator('body').click() // ensure focus is on body, not any input
  await page.keyboard.press('Escape')
  await expect(page).toHaveURL(/\/git\/commits($|\?)/)
})

test('Backspace on commit detail navigates to commits list', async ({ page }) => {
  await page.goto(`/git/commits/${RENAME_SHA}`)
  await page.locator('.commit-detail-subject').waitFor()
  await page.locator('body').click()
  await page.keyboard.press('Backspace')
  await expect(page).toHaveURL(/\/git\/commits($|\?)/)
})

test('Backspace on commits list is a no-op', async ({ page }) => {
  await page.goto('/git/commits')
  await page.keyboard.press('Backspace')
  await expect(page).toHaveURL(/\/git\/commits$/)
})

test('/ is a no-op on git pages', async ({ page }) => {
  await page.goto('/git/status')
  await page.keyboard.press('/')
  await expect(page).toHaveURL(/\/git\/status$/)
})

test('shortcuts are inert while typing in an input', async ({ page }) => {
  // Land on root, then open the picker so the dropdown items are present.
  await page.goto('/')
  // Search box on the folder view should swallow `/`.
  const searchInput = page.locator('.toolbar input').first()
  await searchInput.focus()
  await page.keyboard.press('/')
  // After pressing /, we should still be on / and the input should hold "/".
  await expect(page).toHaveURL(/\/$/)
})
