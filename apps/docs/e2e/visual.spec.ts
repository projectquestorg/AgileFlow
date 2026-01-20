import { test, expect } from "@playwright/test"

/**
 * Visual regression tests for AgileFlow Docs.
 * These tests capture screenshots and compare against baselines.
 *
 * To update snapshots: pnpm test:e2e -- --update-snapshots
 */

test.describe("Visual Regression - Desktop", () => {
  test.use({ viewport: { width: 1280, height: 720 } })

  test("homepage visual", async ({ page }) => {
    await page.goto("/")
    // Wait for animations and images to load
    await page.waitForLoadState("networkidle")
    await page.waitForTimeout(500)
    await expect(page).toHaveScreenshot("homepage-desktop.png", {
      fullPage: true,
      animations: "disabled",
    })
  })

  test("installation page visual", async ({ page }) => {
    await page.goto("/installation")
    await page.waitForLoadState("networkidle")
    await page.waitForTimeout(500)
    await expect(page).toHaveScreenshot("installation-desktop.png", {
      fullPage: true,
      animations: "disabled",
    })
  })

  test("getting started page visual", async ({ page }) => {
    await page.goto("/getting-started")
    await page.waitForLoadState("networkidle")
    await page.waitForTimeout(500)
    await expect(page).toHaveScreenshot("getting-started-desktop.png", {
      fullPage: true,
      animations: "disabled",
    })
  })

  test("commands page visual", async ({ page }) => {
    await page.goto("/commands")
    await page.waitForLoadState("networkidle")
    await page.waitForTimeout(500)
    await expect(page).toHaveScreenshot("commands-desktop.png", {
      fullPage: true,
      animations: "disabled",
    })
  })

  test("search dialog visual", async ({ page }) => {
    await page.goto("/")
    await page.keyboard.press("Meta+k")
    await page.waitForTimeout(500)
    await expect(page).toHaveScreenshot("search-dialog-desktop.png", {
      animations: "disabled",
    })
  })
})

test.describe("Visual Regression - Mobile", () => {
  test.use({ viewport: { width: 375, height: 667 } })

  test("homepage mobile visual", async ({ page }) => {
    await page.goto("/")
    await page.waitForLoadState("networkidle")
    await page.waitForTimeout(500)
    await expect(page).toHaveScreenshot("homepage-mobile.png", {
      fullPage: true,
      animations: "disabled",
    })
  })

  test("mobile navigation drawer visual", async ({ page }) => {
    await page.goto("/")
    await page.getByRole("button", { name: /Toggle Menu/i }).click()
    await page.waitForTimeout(500)
    await expect(page).toHaveScreenshot("mobile-nav-drawer.png", {
      animations: "disabled",
    })
  })

  test("getting started mobile visual", async ({ page }) => {
    await page.goto("/getting-started")
    await page.waitForLoadState("networkidle")
    await page.waitForTimeout(500)
    await expect(page).toHaveScreenshot("getting-started-mobile.png", {
      fullPage: true,
      animations: "disabled",
    })
  })
})

test.describe("Visual Regression - Dark Mode", () => {
  test.use({
    viewport: { width: 1280, height: 720 },
    colorScheme: "dark",
  })

  test("homepage dark mode visual", async ({ page }) => {
    await page.goto("/")
    await page.waitForLoadState("networkidle")
    await page.waitForTimeout(500)
    await expect(page).toHaveScreenshot("homepage-dark.png", {
      fullPage: true,
      animations: "disabled",
    })
  })

  test("getting started dark mode visual", async ({ page }) => {
    await page.goto("/getting-started")
    await page.waitForLoadState("networkidle")
    await page.waitForTimeout(500)
    await expect(page).toHaveScreenshot("getting-started-dark.png", {
      fullPage: true,
      animations: "disabled",
    })
  })
})

test.describe("Component Visual Regression", () => {
  test.use({ viewport: { width: 800, height: 600 } })

  test("tutorial step cards visual", async ({ page }) => {
    await page.goto("/getting-started")
    await page.waitForLoadState("networkidle")
    // Scroll to first step
    const firstStep = page.locator("[data-slot='card']").first()
    await firstStep.scrollIntoViewIfNeeded()
    await page.waitForTimeout(300)
    await expect(firstStep).toHaveScreenshot("tutorial-step-card.png")
  })

  test("completed step visual", async ({ page }) => {
    await page.goto("/getting-started")
    // Mark first step as complete
    await page.getByRole("button", { name: /Mark Complete/i }).first().click()
    await page.waitForTimeout(300)
    const firstStep = page.locator("[data-slot='card']").first()
    await expect(firstStep).toHaveScreenshot("tutorial-step-completed.png")
  })

  test("code block visual", async ({ page }) => {
    await page.goto("/installation")
    await page.waitForLoadState("networkidle")
    // Find first code block
    const codeBlock = page.locator("pre").first()
    await codeBlock.scrollIntoViewIfNeeded()
    await page.waitForTimeout(300)
    await expect(codeBlock).toHaveScreenshot("code-block.png")
  })
})
