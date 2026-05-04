import { test, expect } from '@playwright/test';

const URL = process.env['BASE_URL'] ?? 'https://browser-83a2l41u6-deepaks-projects-70214c28.vercel.app';

// Guard: if Vercel redirects to login, skip with a clear message
async function guardVercelAuth(page: import('@playwright/test').Page) {
  if (page.url().includes('vercel.com/login')) {
    throw new Error(
      'Redirected to Vercel login — set VERCEL_BYPASS_SECRET (Project Settings → Security → Protection Bypass for Automation)'
    );
  }
}

test.describe('GRIDwar — live deployment smoke tests', () => {

  test('page loads and shows topbar', async ({ page }) => {
    await page.goto(URL);
    await guardVercelAuth(page);
    await expect(page.locator('.logo')).toContainText('GRID');
    await expect(page.locator('.pill.green')).toBeVisible();
    await expect(page.locator('.pill.blue')).toContainText('claimed');
  });

  test('canvas renders (grid is visible)', async ({ page }) => {
    await page.goto(URL);
    await guardVercelAuth(page);
    const canvas = page.locator('canvas');
    await expect(canvas).toBeVisible();
    const box = await canvas.boundingBox();
    expect(box!.width).toBeGreaterThan(500);
    expect(box!.height).toBeGreaterThan(500);
  });

  test('SignalR connects — online count updates in topbar', async ({ page }) => {
    await page.goto(URL);
    await guardVercelAuth(page);
    // After SignalR connects the green pill updates from initial "0 online"
    await expect(page.locator('.pill.green')).not.toContainText('0 online', { timeout: 10_000 });
  });

  test('player chip appears after connection', async ({ page }) => {
    await page.goto(URL);
    await guardVercelAuth(page);
    await expect(page.locator('.me-chip')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('.me-name')).not.toBeEmpty();
  });

  test('me-sub shows cell count (integer ≥ 0)', async ({ page }) => {
    await page.goto(URL);
    await guardVercelAuth(page);
    await expect(page.locator('.me-chip')).toBeVisible({ timeout: 10_000 });
    // Text is "<n> cells" — match the pattern rather than a fixed number
    await expect(page.locator('.me-sub')).toHaveText(/^\d+ cells$/);
  });

  test('clicking a cell increments my cell count', async ({ page }) => {
    await page.goto(URL);
    await guardVercelAuth(page);
    await expect(page.locator('.me-chip')).toBeVisible({ timeout: 10_000 });

    // Read current count before click
    const before = parseInt(
      (await page.locator('.me-sub').textContent())!.replace(/\D/g, ''),
      10
    );

    const canvas = page.locator('canvas');
    const box = await canvas.boundingBox();
    await canvas.click({ position: { x: box!.width / 2, y: box!.height / 2 } });

    // Count should rise by at least 1 within 3 s (optimistic update is immediate)
    await expect(page.locator('.me-sub')).toHaveText(
      new RegExp(`^${before + 1} cells$`),
      { timeout: 5_000 }
    );
  });

  test('leaderboard row appears', async ({ page }) => {
    await page.goto(URL);
    await guardVercelAuth(page);
    await expect(page.locator('.me-chip')).toBeVisible({ timeout: 10_000 });

    const canvas = page.locator('canvas');
    const box = await canvas.boundingBox();
    // Click somewhere slightly offset so we avoid a locked cell from a previous test
    await canvas.click({ position: { x: box!.width * 0.4, y: box!.height * 0.4 } });

    await expect(page.locator('.lb-row').first()).toBeVisible({ timeout: 5_000 });
  });

  test('activity feed row appears after capture', async ({ page }) => {
    await page.goto(URL);
    await guardVercelAuth(page);
    await expect(page.locator('.me-chip')).toBeVisible({ timeout: 10_000 });

    const canvas = page.locator('canvas');
    const box = await canvas.boundingBox();
    await canvas.click({ position: { x: box!.width * 0.6, y: box!.height * 0.6 } });

    await expect(page.locator('.feed-row').first()).toBeVisible({ timeout: 5_000 });
  });

  test('real-time sync — two browsers see same capture', async ({ browser }) => {
    const ctx1 = await browser.newContext(
      process.env['VERCEL_BYPASS_SECRET']
        ? { extraHTTPHeaders: { 'x-vercel-protection-bypass': process.env['VERCEL_BYPASS_SECRET'] } }
        : {}
    );
    const ctx2 = await browser.newContext(
      process.env['VERCEL_BYPASS_SECRET']
        ? { extraHTTPHeaders: { 'x-vercel-protection-bypass': process.env['VERCEL_BYPASS_SECRET'] } }
        : {}
    );
    const p1 = await ctx1.newPage();
    const p2 = await ctx2.newPage();

    await p1.goto(URL);
    await p2.goto(URL);
    await guardVercelAuth(p1);
    await guardVercelAuth(p2);

    await expect(p1.locator('.me-chip')).toBeVisible({ timeout: 12_000 });
    await expect(p2.locator('.me-chip')).toBeVisible({ timeout: 12_000 });

    // p1 captures a cell at top-left quadrant
    const canvas = p1.locator('canvas');
    const box = await canvas.boundingBox();
    await canvas.click({ position: { x: box!.width * 0.25, y: box!.height * 0.25 } });

    // p2 should see the leaderboard update (cell captured broadcasts to all)
    await expect(p2.locator('.lb-row').first()).toBeVisible({ timeout: 10_000 });

    await ctx1.close();
    await ctx2.close();
  });

  test('reset button shows confirm text on first click', async ({ page }) => {
    await page.goto(URL);
    await guardVercelAuth(page);
    await expect(page.locator('.reset-btn')).toBeVisible({ timeout: 10_000 });
    await page.locator('.reset-btn').click();
    await expect(page.locator('.reset-btn')).toContainText('Confirm');
  });

  test('reset button reverts after 3 s without second click', async ({ page }) => {
    await page.goto(URL);
    await guardVercelAuth(page);
    await expect(page.locator('.reset-btn')).toBeVisible({ timeout: 10_000 });
    await page.locator('.reset-btn').click();
    await expect(page.locator('.reset-btn')).toContainText('Confirm');
    // After 3 s the signal auto-resets
    await expect(page.locator('.reset-btn')).toContainText('Reset grid', { timeout: 5_000 });
  });

  test('coverage ring is present and shows a percentage', async ({ page }) => {
    await page.goto(URL);
    await guardVercelAuth(page);
    await expect(page.locator('.ring-wrap')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('.ring-pct')).toBeVisible();
    // Text must be a percentage like "0%" or "12%"
    await expect(page.locator('.ring-pct')).toHaveText(/%$/);
  });

  test('coverage pills in topbar show correct format', async ({ page }) => {
    await page.goto(URL);
    await guardVercelAuth(page);
    await expect(page.locator('.pill.purple')).toHaveText(/[\d.]+% covered/);
    await expect(page.locator('.pill.blue')).toHaveText(/\d+ \/ 2500 claimed/);
  });

  test('grid label shows unclaimed cell count', async ({ page }) => {
    await page.goto(URL);
    await guardVercelAuth(page);
    await expect(page.locator('.grid-label')).toHaveText(/50 × 50/, { timeout: 10_000 });
    await expect(page.locator('.grid-label')).toHaveText(/cells unclaimed/);
  });

});
