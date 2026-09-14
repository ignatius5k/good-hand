import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import { chromium, expect } from '@playwright/test';

// Real service workers and successive builds, served under the GitHub Pages base.
const review = process.argv.includes('--review');
const temporary = await mkdtemp(join(tmpdir(), 'good-hand-updates-'));
const versions = ['release-a', 'release-b', 'release-c', 'release-d'];
let release = versions[0];
const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  if (review && request.method === 'POST' && url.pathname === '/__test__/release' && versions.includes(url.searchParams.get('version'))) {
    release = url.searchParams.get('version');
    response.end(release);
    return;
  }
  if (!url.pathname.startsWith('/good-hand/')) { response.writeHead(404).end(); return; }
  const relative = url.pathname.slice('/good-hand/'.length) || 'index.html';
  const root = resolve(temporary, release);
  const path = resolve(root, relative);
  if (!path.startsWith(root + '/')) { response.writeHead(403).end(); return; }
  try {
    const data = await readFile(path);
    response.writeHead(200, { 'Content-Type': types[extname(path)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    response.end(data);
  } catch { response.writeHead(404).end(); }
});
let browser;
let keepServer = false;
try {
  for (const version of versions) {
    execFileSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--outDir', join(temporary, version), '--emptyOutDir'], {
      env: { ...process.env, GOOD_HAND_BASE: '/good-hand/', GITHUB_SHA: version, GITHUB_RUN_ID: 'test', GITHUB_RUN_ATTEMPT: '1' },
      stdio: 'pipe',
    });
  }
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const appUrl = `http://127.0.0.1:${server.address().port}/good-hand/`;
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.clock.install();
  await page.goto(appUrl);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await expect(page.getByRole('button', { name: 'Update now', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Start a game', exact: true }).click();
  await page.getByLabel('Game name', { exact: true }).fill('Update check night');
  await page.getByRole('button', { name: 'Start game', exact: true }).click();
  await page.getByRole('button', { name: 'Add player', exact: true }).click();
  await page.getByLabel('Player name', { exact: true }).fill('Marcus');
  await page.getByRole('dialog').getByRole('button', { name: 'Add player', exact: true }).click();
  const savedGame = await page.evaluate(() => localStorage.getItem('good-hand-v1'));
  await page.getByRole('button', { name: 'Manage Marcus', exact: true }).click();
  await page.getByLabel('Rebuy amount (SGD)', { exact: true }).fill('37.50');

  release = 'release-b';
  await page.clock.fastForward(60_000);
  await expect.poll(() => page.locator('.app-update-notice').count(), { timeout: 15_000 }).toBe(1);
  assert.match(await page.locator('meta[name="app-version"]').getAttribute('content'), /^release-a-/);
  await expect(page.getByLabel('Rebuy amount (SGD)', { exact: true })).toHaveValue('37.50');
  assert.equal(await page.evaluate(() => localStorage.getItem('good-hand-v1')), savedGame);
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Update now', exact: true })).toBeVisible();
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    const button = await page.getByRole('button', { name: 'Update now', exact: true }).boundingBox();
    assert.ok(button.height >= 44);
  }
  await page.screenshot({ path: '/tmp/good-hand-update-prompt-390.png', fullPage: true });
  // An ignored update should be replaced by the latest deployment, not strand a stale build.
  await page.evaluate(async () => { window.firstWaitingWorker = (await navigator.serviceWorker.getRegistration()).waiting; });
  release = 'release-c';
  await page.clock.fastForward(60_000);
  await expect.poll(() => page.evaluate(async () => {
    const waiting = (await navigator.serviceWorker.getRegistration()).waiting;
    return !!waiting && waiting !== window.firstWaitingWorker;
  }), { timeout: 15_000 }).toBe(true);
  await page.getByRole('button', { name: 'Update now', exact: true }).click();
  await expect(page.locator('meta[name="app-version"]')).toHaveAttribute('content', /^release-c-/);
  await expect(page.getByRole('heading', { name: 'Update check night', exact: true })).toBeVisible();
  assert.equal(await page.evaluate(() => localStorage.getItem('good-hand-v1')), savedGame);
  await expect(page.getByRole('button', { name: 'Update now', exact: true })).toHaveCount(0);

  // A deployment while offline waits until connection returns, without a manual reload.
  await context.setOffline(true);
  release = 'release-d';
  await page.clock.fastForward(120_000);
  await expect(page.getByRole('button', { name: 'Update now', exact: true })).toHaveCount(0);
  await context.setOffline(false);
  await expect(page.getByRole('button', { name: 'Update now', exact: true })).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Update now', exact: true }).click();
  await expect(page.locator('meta[name="app-version"]')).toHaveAttribute('content', /^release-d-/);
  assert.equal(await page.evaluate(() => localStorage.getItem('good-hand-v1')), savedGame);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Update check night', exact: true })).toBeVisible();
  assert.equal(await page.evaluate(() => localStorage.getItem('good-hand-v1')), savedGame);
  assert.deepEqual(errors, []);
  console.log('PASS: deployment detected without reload; typed rebuy preserved until update; ignored update replaced with latest release; saved game survives updates; offline/reconnect recovery; 320/390px prompt and 44px target; no runtime errors.');
  keepServer = review;
  if (review) {
    release = 'release-a';
    console.log(`Review server: ${appUrl}`);
    console.log(`Switch release: POST http://127.0.0.1:${server.address().port}/__test__/release?version=release-b`);
  }
} finally {
  await browser?.close();
  if (!keepServer) {
    await new Promise(resolve => server.close(resolve));
    await rm(temporary, { recursive: true, force: true });
  }
}
