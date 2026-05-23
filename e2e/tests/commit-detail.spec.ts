import { test, expect } from '@playwright/test'

// The rename commit in sample-repo: 3rd commit, sha 9626e7a127f9549c58c7b3dbf20e00b3cc65f868.
const RENAME_SHA = '9626e7a127f9549c58c7b3dbf20e00b3cc65f868'

test('rename commit header renders metadata and summary counts', async ({ page }) => {
  await page.goto(`/git/commits/${RENAME_SHA}`)
  await expect(page.locator('.commit-detail-subject')).toContainText('Third commit')
  await expect(page.locator('.commit-detail-summary')).toContainText('files changed')
  // Single file in the rename commit.
  await expect(page.locator('.filediff-card')).toHaveCount(1)
})

test('rename card shows old → new', async ({ page }) => {
  await page.goto(`/git/commits/${RENAME_SHA}`)
  await expect(page.locator('.filediff-path').first()).toContainText('→')
})

// Binary commit is the 2nd commit (1181af0...).
const BIN_SHA = '1181af037cdaba0949717afb4bf224d0c68ca15c'

test('binary file card is non-expandable and shows size delta', async ({ page }) => {
  await page.goto(`/git/commits/${BIN_SHA}`)
  // Locate the row whose path is logo.png.
  const card = page.locator('.filediff-binary', { has: page.locator('.filediff-path', { hasText: 'logo.png' }) })
  await expect(card).toBeVisible()
  await expect(card.locator('.filediff-binary-note')).toContainText('Binary file changed')
  // There is no expand button on a binary card.
  await expect(card.locator('.filediff-toggle')).toHaveCount(0)
})

test('source lines for a known grammar are syntax-highlighted', async ({ page }) => {
  // The 2nd commit (1181af0) modifies README.md (markdown grammar — registered).
  await page.goto(`/git/commits/${BIN_SHA}`)
  // Find the README.md card (it auto-expands as one of the first 3).
  const card = page.locator('.filediff-card', {
    has: page.locator('.filediff-path', { hasText: 'README.md' }),
  })
  await card.waitFor()
  await card.locator('.diff-hunk').first().waitFor()
  // Expanded text spans should carry the .hljs wrapper class.
  await expect(card.locator('.diff-line-text.hljs').first()).toBeVisible()
  // And at least one hljs-* token span should be present somewhere in the card.
  const tokens = await card.locator('[class^="hljs-"]').count()
  expect(tokens).toBeGreaterThan(0)
})

test('source lines for an unknown grammar fall back to plain monospace', async ({ page }) => {
  // The rename commit touches b/new.txt — `.txt` has no registered grammar.
  await page.goto(`/git/commits/${RENAME_SHA}`)
  const card = page.locator('.filediff-card', {
    has: page.locator('.filediff-path', { hasText: 'new.txt' }),
  })
  await card.waitFor()
  await card.locator('.diff-hunk').first().waitFor()
  // No .hljs wrapper class on text spans, and no hljs-* token spans.
  await expect(card.locator('.diff-line-text.hljs')).toHaveCount(0)
  await expect(card.locator('[class^="hljs-"]')).toHaveCount(0)
})

test('wrap toggle in the commit detail header flips hunk bodies between wrap-on and wrap-off', async ({ page }) => {
  // Land on root first so we have a same-origin context to clear localStorage,
  // then navigate. Don't use addInitScript — it would re-run on reload and
  // wipe the preference we're explicitly trying to test for persistence.
  await page.goto('/')
  await page.evaluate(() => localStorage.removeItem('explorer.wrap'))
  await page.goto(`/git/commits/${BIN_SHA}`)
  await page.locator('.diff-hunk').first().waitFor()
  await expect(page.locator('.diff-hunk-body.wrap-on').first()).toBeVisible()
  await expect(page.locator('.diff-hunk-body.wrap-off')).toHaveCount(0)

  // Toggle off and verify every visible hunk body switches.
  // The wrap toggle is the icon-btn inside the commit-detail-summary block.
  await page.locator('.commit-detail-summary .icon-btn').click()
  await expect(page.locator('.diff-hunk-body.wrap-off').first()).toBeVisible()
  await expect(page.locator('.diff-hunk-body.wrap-on')).toHaveCount(0)

  // Preference persists across reload (without addInitScript clobbering it).
  await page.reload()
  await page.locator('.diff-hunk').first().waitFor()
  await expect(page.locator('.diff-hunk-body.wrap-off').first()).toBeVisible()

  // Reset for subsequent tests.
  await page.evaluate(() => localStorage.removeItem('explorer.wrap'))
})
