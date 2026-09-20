// End-to-end co-host test: a viewer with the co-host URL continues the game,
// makes edits, and both host and read-only viewers see the updates.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const appUrl = process.env.GOOD_HAND_TEST_URL ?? 'http://127.0.0.1:5181/';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

const dbModule = `
const bc=new BroadcastChannel('mock-rtdb');
const data=new Map(JSON.parse(localStorage.getItem('mock-rtdb')||'[]'));
const listeners=new Set();
function save(){localStorage.setItem('mock-rtdb',JSON.stringify([...data]))}
function emit(){for(const l of[...listeners]){const v=data.get(l.path)??null;l.cb({val:()=>v})}}
bc.onmessage=e=>{data.set(e.data.path,e.data.v);save();emit()};
export function ref(db,path){return{path}}
export function serverTimestamp(){return Date.now()}
export function getDatabase(){return{}}
export async function set(r,v){data.set(r.path,v);save();emit();bc.postMessage({path:r.path,v})}
export function onValue(r,cb){const l={path:r.path,cb};listeners.add(l);cb({val:()=>data.get(r.path)??null});return()=>listeners.delete(l)}
`;
await context.route(/firebase_app/, route => route.fulfill({ contentType: 'text/javascript', body: 'export function initializeApp(){return{}}' }));
await context.route(/firebase_database/, route => route.fulfill({ contentType: 'text/javascript', body: dbModule }));

const host = await context.newPage();
const errors = []; host.on('pageerror', e => errors.push(e.message));
await host.goto(appUrl);
await host.getByRole('button', { name: 'Start a game', exact: true }).click();
await host.getByLabel('Game name', { exact: true }).fill('Saturday deep stack');
await host.getByRole('button', { name: 'Start game', exact: true }).click();
await host.getByRole('button', { name: 'Add player', exact: true }).click();
await host.getByLabel('Player name', { exact: true }).fill('Alex');
await host.getByRole('dialog').getByRole('button', { name: 'Add player', exact: true }).click();
await host.getByRole('button', { name: 'Add player', exact: true }).click();
await host.getByLabel('Player name', { exact: true }).fill('Jamie');
await host.getByRole('dialog').getByRole('button', { name: 'Add player', exact: true }).click();

await host.getByRole('button', { name: 'Share', exact: true }).click();
await host.getByRole('button', { name: 'Share this game live', exact: true }).click();
const link = await host.getByLabel('Live game link', { exact: true }).inputValue();
await host.getByRole('button', { name: 'Close dialog', exact: true }).click();
const url = new URL(link);
const id = url.hash.replace('#watch=', '');

// Wait for the host to publish, then pull the secret key out of the mock RTDB
await host.waitForTimeout(700);
const record = await host.evaluate(() => {
  const raw = localStorage.getItem('mock-rtdb');
  return raw ? JSON.parse(raw) : null;
});
const key = record ? Object.fromEntries(record)[`sharedGames/${id}`]?.k : null;
assert.ok(key, 'mock RTDB did not contain a share key');
const coHostUrl = `${url.origin}${url.pathname}#watch=${id}&k=${key}`;

const viewer = await context.newPage();
const verrors = []; viewer.on('pageerror', e => verrors.push(e.message));
await viewer.goto(link);
await viewer.locator('.watch-shell').waitFor();

const coHost = await context.newPage();
const cErrors = []; coHost.on('pageerror', e => cErrors.push(e.message));
await coHost.goto(coHostUrl);
await coHost.locator('.watch-shell').waitFor();
await coHost.getByText('Continue this game on my device').click();
await coHost.getByRole('heading', { name: 'Saturday deep stack', exact: true }).waitFor();

// Co-host records a rebuy for Alex → both host and viewer should update
await coHost.getByRole('button', { name: 'Manage Alex', exact: true }).click();
await coHost.getByLabel('Rebuy amount (SGD)', { exact: true }).fill('50');
await coHost.getByRole('dialog').getByRole('button', { name: 'Add rebuy', exact: true }).click();
await coHost.waitForTimeout(900);

const htext = await host.locator('.app-shell').innerText();
assert.match(htext, /Total buy-ins[\s\S]*\$150/, 'host did not see co-host rebuy');
assert.match(htext, /Alex[\s\S]*2 buy-ins[\s\S]*\$100 in/, 'host did not see Alex rebuy');

const vtext = await viewer.locator('.watch-shell').innerText();
assert.match(vtext, /Total buy-ins[\s\S]*\$150/, 'viewer did not see co-host rebuy');
assert.match(vtext, /Alex[\s\S]*2 buy-ins[\s\S]*\$100 in/, 'viewer did not see Alex rebuy');

// Host then records a cash-out for Jamie → co-host sees it
await host.getByRole('button', { name: 'Manage Jamie', exact: true }).click();
await host.getByRole('dialog').getByRole('button', { name: 'Cash out', exact: true }).click();
await host.getByLabel('Final chip value (SGD)', { exact: true }).fill('35');
await host.getByRole('dialog').getByRole('button', { name: 'Cash out player', exact: true }).click();
await host.waitForTimeout(900);
const ctext = await coHost.locator('.app-shell').innerText();
assert.match(ctext, /Jamie[\s\S]*\$35 out/, 'co-host did not see host cash-out');

console.log('E2E COHOST OK; host errors:', errors, 'viewer errors:', verrors, 'cohost errors:', cErrors);
await browser.close();
