import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  // Test-only access to end a run promptly, without adding debug hooks to the game.
  await page.route('**/main.js*', async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      body: `${await response.text()}\nwindow.finishTestRun = (score = 100, wave = 1) => {
        game.score = score; game.wave = wave;
        ship.health = 1; ship.invulnerable = 0; hitShip();
      };`,
    });
  });
});

test('counts actual starts and restarts, and returns to the high scores', async ({ page, request }) => {
  const before = await (await request.get('/api/leaderboard')).json();
  await page.goto('/');
  await expect(page.locator('[data-games-played]')).toHaveText(before.gamesPlayed.toLocaleString());
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await expect.poll(async () => (await (await request.get('/api/leaderboard')).json()).gamesPlayed).toBe(before.gamesPlayed + 1);
  await page.evaluate(() => window.finishTestRun(0));
  await expect(page.locator('[data-score-form]')).toBeHidden();
  await page.getByRole('button', { name: 'OK', exact: true }).click();
  await expect.poll(async () => (await (await request.get('/api/leaderboard')).json()).gamesPlayed).toBe(before.gamesPlayed + 2);
  await page.evaluate(() => window.finishTestRun(0));
  await page.getByRole('button', { name: 'High scores', exact: true }).click();
  await expect(page.locator('.start-screen')).toBeVisible();
  await expect(page.locator('[data-games-played]')).toHaveText((before.gamesPlayed + 2).toLocaleString());
});

test('saves a nickname once after a lost response and persists it after reload', async ({ page, request }) => {
  const nickname = `ACE${Date.now().toString().slice(-6)}`;
  await page.goto('/');
  const registered = page.waitForResponse((response) => response.url().endsWith('/api/runs'));
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  expect((await registered).status()).toBe(200);
  // Server timestamps use seconds; give the registered run time to be eligible.
  await page.waitForTimeout(1200);
  await page.evaluate(() => window.finishTestRun(100));
  await expect(page.locator('[data-score-form]')).toBeVisible();
  await page.getByLabel('Your name').fill(nickname);
  let first = true;
  await page.route('**/api/scores', async (route) => {
    if (first) {
      first = false;
      await route.fetch();
      await route.abort('failed');
    } else await route.continue();
  });
  await page.getByRole('button', { name: 'Save score', exact: true }).click();
  await expect(page.locator('[data-score-status]')).toContainText('Please try again');
  await expect(page.getByRole('button', { name: 'Save score', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Save score', exact: true }).click();
  await expect(page.locator('[data-score-status]')).toContainText('on the leaderboard!');
  await expect(page.locator('[data-score-form]')).toBeHidden();
  await page.reload();
  await expect(page.locator('[data-leaderboard-rows]')).toContainText(nickname);
  const board = await (await request.get('/api/leaderboard')).json();
  expect(board.entries.filter(({ name }) => name === nickname)).toHaveLength(1);
  expect(await page.context().cookies()).toEqual([]);
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
});

test('the production bundle registers games on its own origin', async ({ page, request }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const before = await (await request.get('/api/leaderboard')).json();
  await page.goto('http://127.0.0.1:8788/');
  const registered = page.waitForResponse((response) => response.url().endsWith('/api/runs'));
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  expect((await registered).status()).toBe(200);
  await expect.poll(async () => (await (await request.get('/api/leaderboard')).json()).gamesPlayed).toBe(before.gamesPlayed + 1);
  expect(errors).toEqual([]);
});

test('remains playable when the leaderboard is offline', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/api/**', (route) => route.abort('failed'));
  await page.goto('/');
  await expect(page.locator('[data-leaderboard-status]')).toContainText('You can still play');
  await expect(page.locator('[data-games-played]')).toHaveText('—');
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(page.locator('.start-screen')).toBeHidden();
  await page.evaluate(() => window.finishTestRun(100));
  await expect(page.locator('[data-score-status]')).toContainText('Scores are offline');
  await expect(page.getByRole('button', { name: 'OK', exact: true })).toBeEnabled();
});

test('renders the full top ten safely on mobile and skips nonqualifying scores', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const entries = Array.from({ length: 10 }, (_, index) => ({
    id: index + 1, name: index === 0 ? '<img src=x>' : `PLAYER${index + 1}`, score: 10000 - index * 500, wave: 3,
  }));
  await page.route('**/api/leaderboard', (route) => route.fulfill({ json: { entries, gamesPlayed: 12345 } }));
  await page.goto('/');
  await expect(page.locator('[data-leaderboard-rows] tr')).toHaveCount(10);
  await expect(page.locator('[data-leaderboard-rows] img')).toHaveCount(0);
  await expect(page.locator('[data-leaderboard-rows] tr').last()).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/title-mobile.png' });
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await page.evaluate(() => window.finishTestRun(100));
  await expect(page.locator('[data-score-status]')).toContainText('top 10 is within reach');
  await expect(page.locator('[data-score-form]')).toBeHidden();
});
