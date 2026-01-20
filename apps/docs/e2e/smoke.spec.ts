import { test, expect } from "@playwright/test"

/**
 * Smoke tests for critical user paths in AgileFlow Docs.
 * These tests verify core functionality works correctly.
 */

test.describe("Homepage", () => {
  test("should load and display title", async ({ page }) => {
    await page.goto("/")
    await expect(page).toHaveTitle(/AgileFlow/)
    await expect(page.getByRole("heading", { name: /AgileFlow/i })).toBeVisible()
  })

  test("should have navigation links", async ({ page }) => {
    await page.goto("/")
    await expect(page.getByRole("link", { name: /Installation/i })).toBeVisible()
    await expect(page.getByRole("link", { name: /Commands/i })).toBeVisible()
  })
})

test.describe("Navigation", () => {
  test("should navigate to installation page", async ({ page }) => {
    await page.goto("/")
    await page.getByRole("link", { name: /Installation/i }).first().click()
    await expect(page).toHaveURL(/\/installation/)
    await expect(page.getByRole("heading", { name: /Installation/i })).toBeVisible()
  })

  test("should navigate to commands page", async ({ page }) => {
    await page.goto("/")
    await page.getByRole("link", { name: /Commands/i }).first().click()
    await expect(page).toHaveURL(/\/commands/)
  })

  test("should navigate to agents page", async ({ page }) => {
    await page.goto("/")
    await page.getByRole("link", { name: /Agents/i }).first().click()
    await expect(page).toHaveURL(/\/agents/)
  })
})

test.describe("Search", () => {
  test("should open search with keyboard shortcut", async ({ page }) => {
    await page.goto("/")
    // Press Cmd+K or Ctrl+K to open search
    await page.keyboard.press("Meta+k")
    // Search dialog should be visible
    await expect(page.getByRole("dialog")).toBeVisible()
  })

  test("should search and show results", async ({ page }) => {
    await page.goto("/")
    await page.keyboard.press("Meta+k")
    await page.getByRole("combobox").fill("epic")
    // Wait for search results
    await page.waitForTimeout(500)
    // Should show search results
    const results = page.getByRole("option")
    await expect(results.first()).toBeVisible()
  })

  test("should navigate to search result", async ({ page }) => {
    await page.goto("/")
    await page.keyboard.press("Meta+k")
    await page.getByRole("combobox").fill("epic")
    await page.waitForTimeout(500)
    // Click first result
    await page.getByRole("option").first().click()
    // Should navigate away from home
    await expect(page).not.toHaveURL(/^\/$/)
  })
})

test.describe("Getting Started Tutorial", () => {
  test("should display tutorial wizard", async ({ page }) => {
    await page.goto("/getting-started")
    await expect(page.getByRole("heading", { name: /Getting Started/i })).toBeVisible()
    // Should show tutorial paths
    await expect(page.getByRole("button", { name: /Beginner/i })).toBeVisible()
    await expect(page.getByRole("button", { name: /Intermediate/i })).toBeVisible()
    await expect(page.getByRole("button", { name: /Advanced/i })).toBeVisible()
  })

  test("should switch between tutorial paths", async ({ page }) => {
    await page.goto("/getting-started")
    // Click Intermediate
    await page.getByRole("button", { name: /Intermediate/i }).click()
    // Should show intermediate steps
    await expect(page.getByText(/Start Working on a Story/i)).toBeVisible()
    // Click Advanced
    await page.getByRole("button", { name: /Advanced/i }).click()
    // Should show advanced steps
    await expect(page.getByText(/Configure AgileFlow/i)).toBeVisible()
  })

  test("should copy command to clipboard", async ({ page, context }) => {
    // Grant clipboard permissions
    await context.grantPermissions(["clipboard-read", "clipboard-write"])
    await page.goto("/getting-started")
    // Find first copy button and click it
    const copyButton = page.getByRole("button", { name: /Copy command/i }).first()
    await copyButton.click()
    // Button should show checkmark (success state)
    await expect(copyButton.locator("svg")).toBeVisible()
  })

  test("should mark step as complete", async ({ page }) => {
    await page.goto("/getting-started")
    // Click "Mark Complete" on first step
    const markCompleteButton = page.getByRole("button", { name: /Mark Complete/i }).first()
    await markCompleteButton.click()
    // Button should change to "Undo"
    await expect(page.getByRole("button", { name: /Undo/i }).first()).toBeVisible()
  })
})

test.describe("Mobile Navigation", () => {
  test.use({ viewport: { width: 375, height: 667 } })

  test("should show mobile menu button", async ({ page }) => {
    await page.goto("/")
    // Mobile menu button should be visible
    await expect(page.getByRole("button", { name: /Toggle Menu/i })).toBeVisible()
  })

  test("should open mobile navigation drawer", async ({ page }) => {
    await page.goto("/")
    await page.getByRole("button", { name: /Toggle Menu/i }).click()
    // Should show navigation links
    await expect(page.getByRole("link", { name: /Introduction/i })).toBeVisible()
    await expect(page.getByRole("link", { name: /Installation/i })).toBeVisible()
  })
})

test.describe("Accessibility", () => {
  test("should have no accessibility violations on homepage", async ({ page }) => {
    await page.goto("/")
    // Basic accessibility checks
    const main = page.getByRole("main")
    await expect(main).toBeVisible()
    // All images should have alt text
    const images = page.getByRole("img")
    for (const img of await images.all()) {
      await expect(img).toHaveAttribute("alt")
    }
  })

  test("should support keyboard navigation", async ({ page }) => {
    await page.goto("/")
    // Tab through focusable elements
    await page.keyboard.press("Tab")
    await page.keyboard.press("Tab")
    // Should have visible focus indicator
    const focusedElement = page.locator(":focus")
    await expect(focusedElement).toBeVisible()
  })
})
