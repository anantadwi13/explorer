import { test, expect } from '@playwright/test'

test('SPA shows branch pill and changes badge against sample-repo', async ({ page }) => {
  await page.goto('/')
  // Branch picker label reads `main` (the sample-repo HEAD).
  await expect(page.locator('.branch-picker-label').first()).toHaveText('main')
  // Changes badge appears because sample-repo has 1 staged + 2 unstaged + 1 untracked.
  await expect(page.locator('.changes-badge-count').first()).toHaveText('4 changes')
})

test('on a mobile viewport, branch picker and changes badge are hidden from the toolbar (drawer-only)', async ({ page }) => {
  // 375x800 — typical phone width, well under the 800px breakpoint.
  await page.setViewportSize({ width: 375, height: 800 })
  await page.goto('/')
  // Toolbar exists but its .toolbar-git wrapper is display:none.
  await expect(page.locator('.toolbar .toolbar-git')).toBeHidden()
  await expect(page.locator('.toolbar .branch-picker')).toBeHidden()
  await expect(page.locator('.toolbar .changes-badge')).toBeHidden()

  // The mobile top bar (.topbar) also has no branch picker / changes badge.
  await expect(page.locator('.topbar .branch-picker')).toHaveCount(0)
  await expect(page.locator('.topbar .changes-badge')).toHaveCount(0)

  // Open the drawer and verify the affordances appear in the sidebar header.
  await page.locator('.topbar .icon-btn[aria-label="Open folders"]').click()
  await expect(page.locator('.sidebar-git .branch-picker')).toBeVisible()
  await expect(page.locator('.sidebar-git .changes-badge')).toBeVisible()
})

test('on a desktop viewport, branch picker and changes badge live in the toolbar', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/')
  await expect(page.locator('.toolbar .toolbar-git')).toBeVisible()
  await expect(page.locator('.toolbar .branch-picker-label').first()).toHaveText('main')
  // No mobile top bar at desktop sizes.
  await expect(page.locator('.topbar')).toHaveCount(0)
})
