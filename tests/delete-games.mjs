import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { freshGame, saveTemplate, validateStore } from '../src/model.ts';

const settings = { name: 'Live table', currency: 'SGD', buyin: 5000, smallBlind: 50, bigBlind: 100, settlementMode: 'tab' };
const live = freshGame(settings);
const pending = { ...freshGame({ ...settings, name: 'Unfinished night' }), endedAt: Date.now(), players: [
  { id: 'pending-marcus', name: 'Marcus', buyins: [5000], cashout: null },
] };
const finished = { ...freshGame({ ...settings, name: 'Finished night' }), endedAt: Date.now(), players: [
  { id: 'finished-marcus', name: 'Marcus', buyins: [5000], cashout: 3000 },
  { id: 'finished-julian', name: 'Julian', buyins: [5000], cashout: 7000 },
] };
const fixture = { version: 1, games: [live, pending, finished], activeId: live.id, templates: saveTemplate([], settings, 'Usual stakes') };
assert.ok(validateStore(fixture));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const appUrl = process.env.GOOD_HAND_TEST_URL || 'http://127.0.0.1:5184/';
  await page.goto(appUrl);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.evaluate(data => localStorage.setItem('good-hand-v1', JSON.stringify(data)), fixture);
  await page.reload();
  const readStore = () => page.evaluate(() => JSON.parse(localStorage.getItem('good-hand-v1')));
  const confirmation = () => page.getByRole('dialog', { name: 'Delete game?', exact: true });
  async function history() {
    await page.getByRole('button', { name: 'Open menu', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'History', exact: true }).click();
  }
  await page.getByRole('button', { name: 'Delete game', exact: true }).click();
  await expect(confirmation()).toContainText('Live table');
  await expect(confirmation()).toContainText('still in progress');
  await confirmation().getByRole('button', { name: 'Keep game', exact: true }).click();
  assert.deepEqual(await readStore(), fixture);
  await expect(page.getByRole('button', { name: 'Delete game', exact: true })).toBeFocused();
  await history();
  await page.getByRole('button', { name: 'Delete Unfinished night', exact: true }).click();
  await expect(confirmation()).toContainText('still needs settling');
  // A failed persistent write must leave the game intact and the confirmation open.
  await page.evaluate(() => {
    window.originalStorageWrite = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (key === 'good-hand-v1') throw new DOMException('Test storage failure', 'QuotaExceededError');
      return window.originalStorageWrite.call(this, key, value);
    };
  });
  await confirmation().getByRole('button', { name: 'Delete game', exact: true }).click();
  await expect(confirmation().getByRole('alert')).toContainText('Could not delete');
  assert.deepEqual(await readStore(), fixture);
  await page.evaluate(() => { Storage.prototype.setItem = window.originalStorageWrite; });
  await confirmation().getByRole('button', { name: 'Delete game', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Game history', exact: true })).toBeFocused();
  const afterPending = await readStore();
  assert.deepEqual(afterPending, { ...fixture, games: [live, finished] });
  await page.getByRole('button', { name: 'Players', exact: true }).click();
  await expect(page.locator('.players-list')).toContainText('Julian');
  await history();
  await page.locator('.history-row').filter({ hasText: 'Finished night' }).click();
  await page.getByRole('button', { name: 'Delete game', exact: true }).click();
  await confirmation().getByRole('button', { name: 'Delete game', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Game night.', exact: true })).toBeVisible();
  assert.deepEqual(await readStore(), { ...fixture, games: [live] });
  await page.getByRole('button', { name: 'Players', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'No player results yet.', exact: true })).toBeVisible();
  await page.getByRole('navigation', { name: 'Main navigation', exact: true }).getByRole('button', { name: 'Resume game', exact: true }).click();
  const otherTab = await context.newPage();
  await otherTab.goto(appUrl);
  await expect(otherTab.getByRole('heading', { name: 'Live table', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Delete game', exact: true }).click();
  await confirmation().getByRole('button', { name: 'Delete game', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Start a game', exact: true })).toBeVisible();
  await expect(otherTab.getByRole('heading', { name: 'Game night.', exact: true })).toBeVisible();
  assert.deepEqual(await readStore(), { ...fixture, games: [], activeId: null });
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Start a game', exact: true })).toBeVisible();
  assert.deepEqual(await readStore(), { ...fixture, games: [], activeId: null });
  assert.deepEqual(errors, []);
  console.log('PASS: cancel and focus; delete pending/finished/active games; storage failure leaves data intact; other games/templates preserved; player results removed; cross-tab and offline persistence.');
} finally { await browser.close(); }
