import { expect, test } from "@playwright/test"

/** Smoke tests for the AgileFlow v5 documentation site. */

const PAGES: Array<[string, RegExp]> = [
  ["/", /AgileFlow/],
  ["/installation", /Installation/],
  ["/quick-start", /Quick start/],
  ["/commands/init", /agileflow init/],
  ["/commands/add-remove-list", /add, remove, list/],
  ["/commands/sync-and-update", /sync vs update/],
  ["/commands/check", /agileflow check/],
  ["/commands/configure", /agileflow configure/],
  ["/commands/fork-and-diff", /fork and diff/],
  ["/commands/migrate", /agileflow migrate/],
  ["/commands/eval", /agileflow eval/],
  ["/work", /Agile Work/],
  ["/work/artifacts", /Artifacts/],
  ["/work/commands", /Commands/],
  ["/work/skills", /Skills/],
  ["/concepts/skills-and-packs", /Skills and packs/],
  ["/concepts/sources", /Skill sources/],
  ["/concepts/scopes", /Project and personal skills/],
  ["/concepts/providers", /Providers/],
  ["/concepts/question-preferences", /Question preferences/],
  ["/guides/updates-and-conflicts", /Updates and conflicts/],
  ["/guides/customizing-skills", /Customizing skills/],
  ["/guides/migrating-from-v4", /Migrating from v4/],
  ["/reference/official-skills", /Official skills and packs/],
  ["/reference/agileflow-yaml", /agileflow\.yaml/],
  ["/reference/agileflow-lock", /agileflow\.lock/],
]

for (const [url, title] of PAGES) {
  test(`renders ${url}`, async ({ page }) => {
    const response = await page.goto(url)
    expect(response?.status()).toBeLessThan(400)
    await expect(page.locator("h1").first()).toHaveText(title)
  })
}

test("sidebar lists the v5 sections", async ({ page }) => {
  await page.goto("/")
  for (const section of ["Commands", "Agile Work", "Concepts", "Guides", "Reference"]) {
    await expect(page.getByText(section, { exact: true }).first()).toBeVisible()
  }
})

test("legacy v4 documentation is only linked, clearly labeled", async ({ page }) => {
  await page.goto("/")
  await expect(page.getByRole("link", { name: /v4 branch on GitHub/ })).toHaveAttribute("href", /tree\/v4/)
})

test("dark theme and brand assets load", async ({ page }) => {
  await page.goto("/")
  await expect(page.locator("html")).toHaveClass(/dark/)
  const logo = page.locator('img[src*="agileflow-lockup"]').first()
  await expect(logo).toBeAttached()
})
