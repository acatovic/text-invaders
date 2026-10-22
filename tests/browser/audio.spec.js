import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/**', (route) => route.abort('failed'));
  await page.route('**/main.js*', async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      body: `${await response.text()}
        window.testDamageShip = () => { ship.invulnerable = 0; hitShip(); };
        window.testHitEnemy = (health) => {
          resetInput(); bullets.length = 0; enemies.splice(1);
          const target = enemies[0]; target.health = health;
          bullets.push({ x: target.x, y: target.y + target.height });
          updateGame(0);
        };
        window.testRestart = restartGame;`,
    });
  });
});

test('decodes and plays the selected sounds for shots, kills, and final player death', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    // Observe real network loads, native OGG decoding, and native playback.
    const dataUrls = new WeakMap();
    const bufferUrls = new WeakMap();
    window.audioTest = { decoded: [], played: [] };
    const fetchOriginal = window.fetch;
    window.fetch = async (...args) => {
      const response = await fetchOriginal(...args);
      if (response.url.includes('.ogg')) {
        const arrayBuffer = response.arrayBuffer.bind(response);
        response.arrayBuffer = async () => {
          const data = await arrayBuffer();
          dataUrls.set(data, new URL(response.url).pathname);
          return data;
        };
      }
      return response;
    };
    const decode = AudioContext.prototype.decodeAudioData;
    AudioContext.prototype.decodeAudioData = async function (data) {
      const buffer = await decode.call(this, data);
      bufferUrls.set(buffer, dataUrls.get(data));
      window.audioTest.decoded.push(dataUrls.get(data));
      return buffer;
    };
    const createSource = AudioContext.prototype.createBufferSource;
    AudioContext.prototype.createBufferSource = function () {
      const source = createSource.call(this);
      const start = source.start.bind(source);
      source.start = (...args) => {
        window.audioTest.played.push(bufferUrls.get(source.buffer));
        return start(...args);
      };
      return source;
    };
  });
  await page.goto('/');
  expect(await page.evaluate(() => window.audioTest.played)).toEqual([]);
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.audioTest.decoded.length)).toBe(3);
  expect(await page.evaluate(() => window.audioTest.played)).toEqual([]);

  await page.keyboard.down('Space');
  await expect.poll(() => page.evaluate(() => window.audioTest.played.length)).toBeGreaterThanOrEqual(3);
  await page.keyboard.up('Space');
  expect(await page.evaluate(() => window.audioTest.played.every((url) => url.endsWith('laserSmall_004.ogg')))).toBe(true);

  await page.evaluate(() => { window.audioTest.played.length = 0; window.testHitEnemy(2); window.testDamageShip(); });
  expect(await page.evaluate(() => window.audioTest.played)).toEqual([]);
  await page.evaluate(() => window.testHitEnemy(1));
  expect(await page.evaluate(() => window.audioTest.played)).toEqual(['/lowFrequency_explosion_000.ogg']);

  await page.evaluate(() => { window.testRestart(); window.audioTest.played.length = 0; });
  await page.evaluate(() => { window.testDamageShip(); window.testDamageShip(); });
  expect(await page.evaluate(() => window.audioTest.played)).toEqual([]);
  await page.evaluate(() => { window.testDamageShip(); window.testDamageShip(); });
  expect(await page.evaluate(() => window.audioTest.played)).toEqual(['/lowFrequency_explosion_001.ogg']);
  await expect(page.locator('.game-over')).toBeVisible();
  await page.getByRole('button', { name: 'OK', exact: true }).click();
  await page.keyboard.press('Space');
  expect(await page.evaluate(() => window.audioTest.played.at(-1))).toBe('/laserSmall_004.ogg');
  expect(await page.evaluate(() => window.audioTest.decoded.length)).toBe(3);
  expect(errors).toEqual([]);
});

test('keeps shooting and game over working when sound downloads fail', async ({ page }) => {
  const errors = [];
  let failedSounds = 0;
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/*.ogg*', (route) => {
    // Vite's ?import requests are JS modules; fail only the audio downloads.
    if (route.request().resourceType() === 'fetch') {
      failedSounds++;
      return route.abort('failed');
    }
    return route.continue();
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await expect.poll(() => failedSounds).toBe(3);
  await page.keyboard.press('Space');
  await page.evaluate(() => { for (let i = 0; i < 3; i++) window.testDamageShip(); });
  await expect(page.locator('.game-over')).toBeVisible();
  await page.getByRole('button', { name: 'OK', exact: true }).click();
  await expect(page.locator('.game-over')).toBeHidden();
  expect(errors).toEqual([]);
});
