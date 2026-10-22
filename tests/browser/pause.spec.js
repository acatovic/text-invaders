import { test, expect } from '@playwright/test';

test('Escape and Resume freeze and restore gameplay, audio, and wave countdowns', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/api/**', (route) => route.abort('failed'));
  await page.addInitScript(() => {
    const NativeAudioContext = window.AudioContext;
    window.AudioContext = class extends NativeAudioContext {
      constructor(...args) {
        super(...args);
        window.pauseAudioContext = this;
      }
    };
  });
  await page.route('**/main.js*', async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      body: `${await response.text()}
        window.pauseSnapshot = () => JSON.stringify({ game, ship, bullets, enemies, enemyBullets, explosions, letter: letters[0] });
        window.testClearWave = () => { enemies.length = 0; updateGame(0); };`,
    });
  });

  await page.goto('/');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'PAUSED', exact: true })).toBeHidden();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await page.keyboard.down('Space');
  await page.keyboard.down('ArrowRight');
  await page.keyboard.down('Escape');
  const dialog = page.getByRole('dialog', { name: 'PAUSED', exact: true });
  await expect(dialog).toBeVisible();
  await expect(page.getByRole('button', { name: 'Resume', exact: true })).toBeFocused();
  await expect.poll(() => page.evaluate(() => window.pauseAudioContext.state)).toBe('suspended');
  const frozen = await page.evaluate(() => window.pauseSnapshot());
  // Holding Escape must not repeatedly toggle the pause state.
  await page.keyboard.down('Escape');
  await page.keyboard.up('Escape');
  await page.keyboard.up('ArrowRight');
  await page.keyboard.up('Space');
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(250);
  expect(await page.evaluate(() => window.pauseSnapshot())).toBe(frozen);
  await page.screenshot({ path: 'test-results/pause-desktop.png' });

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect.poll(() => page.evaluate(() => window.pauseAudioContext.state)).toBe('running');
  await expect.poll(() => page.evaluate(() => window.pauseSnapshot())).not.toBe(frozen);
  await page.evaluate(() => window.testClearWave());
  await expect(page.locator('.wave-clear')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  const intermission = await page.evaluate(() => window.pauseSnapshot());
  await page.waitForTimeout(250);
  expect(await page.evaluate(() => window.pauseSnapshot())).toBe(intermission);
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(() => page.evaluate(() => window.pauseSnapshot())).not.toBe(intermission);
  expect(errors).toEqual([]);
});
