import { test, expect, Page } from "@playwright/test";
import * as path from "path";

const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:5173";

// ── Helpers ──────────────────────────────────────────────────────────────────

async function screenshot(page: Page, name: string) {
  const dir = path.join(__dirname, "screenshots");
  await page.screenshot({ path: path.join(dir, `${name}.png`), fullPage: false });
}

// ── Dashboard tests ───────────────────────────────────────────────────────────

test.describe("Dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
  });

  test("page loads without console errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", msg => { if (msg.type() === "error") errors.push(msg.text()); });
    await page.goto(BASE_URL);
    await page.waitForLoadState("networkidle");
    expect(errors.filter(e => !e.includes("favicon"))).toHaveLength(0);
  });

  test("all 5 KPI cards render with numeric values", async ({ page }) => {
    await page.waitForLoadState("networkidle");
    const kpiIds = ["kpi-total", "kpi-open", "kpi-resolved", "kpi-week", "kpi-depts"];
    for (const id of kpiIds) {
      const el = page.locator(`#${id} .kpi-value`);
      await expect(el).toBeVisible();
      const text = await el.textContent();
      expect(text).not.toBe("—");
    }
  });

  test("all 6 chart canvases are present", async ({ page }) => {
    await page.waitForLoadState("networkidle");
    const ids = ["chart-status", "chart-timeline", "chart-state", "chart-dept", "chart-gender", "chart-age"];
    for (const id of ids) {
      await expect(page.locator(`#${id}`)).toBeVisible();
    }
  });

  test("grievance table renders rows", async ({ page }) => {
    await page.waitForSelector("#grievances-tbody tr");
    const rows = page.locator("#grievances-tbody tr");
    await expect(rows.first()).toBeVisible();
  });

  test("chatbot bubble trigger visible bottom-right", async ({ page }) => {
    await expect(page.locator("#bubble-trigger")).toBeVisible();
  });

  test("clicking bubble trigger opens chat panel", async ({ page }) => {
    await page.locator("#bubble-trigger").click();
    await expect(page.locator("#bubble-panel")).toBeVisible();
  });

  test("screenshot desktop", async ({ page }) => {
    await page.waitForLoadState("networkidle");
    await screenshot(page, "dashboard-desktop");
  });

  test("screenshot mobile 375px", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(BASE_URL);
    await page.waitForLoadState("networkidle");
    await screenshot(page, "dashboard-mobile");
  });
});

// ── Submission Modal ──────────────────────────────────────────────────────────

test.describe("Submission Modal", () => {
  test("Submit Grievance button opens modal", async ({ page }) => {
    await page.goto(BASE_URL);
    await page.locator("[data-open-modal='submit']").first().click();
    await expect(page.locator("#submit-modal")).toBeVisible();
  });

  test("submitting text shows confirmation card", async ({ page }) => {
    await page.goto(BASE_URL);
    await page.locator("[data-open-modal='submit']").first().click();
    await page.locator("#submission-text").fill(
      "My name is Test User, 35, female, from Bengaluru, Karnataka. The streetlights near my house are broken for 2 weeks. BBMP has not responded."
    );

    await Promise.all([
      page.waitForSelector(".confirm-card", { timeout: 30000 }),
      page.locator("#submit-btn").click(),
    ]);

    await expect(page.locator(".confirm-card")).toBeVisible();
    await screenshot(page, "submission-confirm");
  });
});

// ── Chatbot Page ──────────────────────────────────────────────────────────────

test.describe("Chatbot Page", () => {
  test("chat page loads without errors", async ({ page }) => {
    await page.goto(`${BASE_URL}/chat.html`);
    await expect(page.locator("#chat-messages")).toBeVisible();
  });

  test("example chips visible on load", async ({ page }) => {
    await page.goto(`${BASE_URL}/chat.html`);
    await expect(page.locator(".example-chips")).toBeVisible();
    const chips = page.locator(".chip");
    await expect(chips.first()).toBeVisible();
  });

  test("clicking a chip submits question and response appears", async ({ page }) => {
    await page.goto(`${BASE_URL}/chat.html`);
    await page.locator(".chip").first().click();
    await page.waitForSelector(".chat-msg.analyst", { timeout: 30000 });
    await expect(page.locator(".chat-msg.analyst")).toBeVisible();
  });

  test("SQL details block present below response", async ({ page }) => {
    await page.goto(`${BASE_URL}/chat.html`);
    await page.locator(".chip").first().click();
    await page.waitForSelector(".sql-details", { timeout: 30000 });
    await expect(page.locator(".sql-details")).toBeVisible();
  });

  test("screenshot chat desktop", async ({ page }) => {
    await page.goto(`${BASE_URL}/chat.html`);
    await page.waitForLoadState("networkidle");
    await screenshot(page, "chat-desktop");
  });
});

// ── Admin Page ────────────────────────────────────────────────────────────────

test.describe("Admin Page", () => {
  const password = process.env.ADMIN_PASSWORD || "test-admin-pw";

  test("shows login form without cookie", async ({ page }) => {
    await page.goto(`${BASE_URL}/admin.html`);
    await expect(page.locator("#login-screen")).toBeVisible();
  });

  test("wrong password shows error", async ({ page }) => {
    await page.goto(`${BASE_URL}/admin.html`);
    await page.locator("#admin-password").fill("wrongpassword");
    await page.locator("#login-form button[type=submit]").click();
    await expect(page.locator("#login-error")).toBeVisible();
    const text = await page.locator("#login-error").textContent();
    expect(text?.trim().length).toBeGreaterThan(0);
  });

  test("correct password shows admin dashboard", async ({ page }) => {
    await page.goto(`${BASE_URL}/admin.html`);
    await page.locator("#admin-password").fill(password);
    await page.locator("#login-form button[type=submit]").click();
    await expect(page.locator("#admin-dashboard")).toBeVisible();
  });

  test("sidebar shows grievance list after login", async ({ page }) => {
    await page.goto(`${BASE_URL}/admin.html`);
    await page.locator("#admin-password").fill(password);
    await page.locator("#login-form button[type=submit]").click();
    await page.waitForSelector(".sidebar-item", { timeout: 10000 });
    await expect(page.locator(".sidebar-item").first()).toBeVisible();
  });

  test("clicking a row shows detail panel", async ({ page }) => {
    await page.goto(`${BASE_URL}/admin.html`);
    await page.locator("#admin-password").fill(password);
    await page.locator("#login-form button[type=submit]").click();
    await page.waitForSelector(".sidebar-item", { timeout: 10000 });
    await page.locator(".sidebar-item").first().click();
    await expect(page.locator("#detail-panel")).toBeVisible();
  });

  test("screenshot admin desktop", async ({ page }) => {
    await page.goto(`${BASE_URL}/admin.html`);
    await page.locator("#admin-password").fill(password);
    await page.locator("#login-form button[type=submit]").click();
    await page.waitForSelector(".sidebar-item", { timeout: 10000 });
    await screenshot(page, "admin-desktop");
  });

  test("screenshot admin mobile 375px", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${BASE_URL}/admin.html`);
    await page.locator("#admin-password").fill(password);
    await page.locator("#login-form button[type=submit]").click();
    await page.waitForLoadState("networkidle");
    await screenshot(page, "admin-mobile");
  });
});
