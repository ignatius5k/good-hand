// End-to-end share test: intercepts the firebase dynamic-import chunks with a
// BroadcastChannel-backed fake RTDB, so two pages in one context truly sync.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const appUrl = 'http://127.0.0.1:5181/';
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
const url = await host.getByLabel('Live game link', { exact: true }).inputValue();
await host.getByRole('button', { name: 'Close dialog', exact: true }).click();

// Give the debounced publish a moment, then open the viewer page
await host.waitForTimeout(700);
const viewer = await context.newPage();
const verrors = []; viewer.on('pageerror', e => verrors.push(e.message));
await viewer.goto(url);
await viewer.locator('.watch-shell').waitFor();
await viewer.getByRole('heading', { name: 'Saturday deep stack', exact: true }).waitFor();
let vtext = await viewer.locator('.watch-shell').innerText();
assert.match(vtext, /In progress/);
assert.match(vtext, /Alex/);
assert.match(vtext, /Jamie/);
assert.match(vtext, /Live/);
await viewer.screenshot({ path: '/tmp/watch-live-1.png' });

// Host records a rebuy → viewer should update without a reload
await host.getByRole('button', { name: 'Manage Alex', exact: true }).click();
await host.getByLabel('Rebuy amount (SGD)', { exact: true }).fill('25');
await host.getByRole('button', { name: 'Add rebuy', exact: true }).click();
await host.waitForTimeout(700);
vtext = await viewer.locator('.watch-shell').innerText();
assert.match(vtext, /2 buy-ins/, 'viewer did not see the live rebuy update');
assert.match(vtext, /\$75 in/);
await viewer.screenshot({ path: '/tmp/watch-live-2.png' });

// Host cashes everyone out and finishes → viewer sees who pays whom
await host.getByRole('button', { name: 'End game', exact: true }).click();
await host.getByRole('button', { name: 'End now', exact: true }).click();
await host.getByRole('button', { name: 'Finish cash-outs', exact: true }).click();
async function cash(name, value) {
  await host.getByRole('button', { name: `Manage ${name}`, exact: true }).click();
  await host.getByLabel('Final chip value (SGD)', { exact: true }).fill(value);
  await host.getByRole('button', { name: 'Cash out player', exact: true }).click();
}
await cash('Alex', '80');
await cash('Jamie', '45');
await host.waitForTimeout(700);
vtext = await viewer.locator('.watch-shell').innerText();
assert.match(vtext, /Finished/);
assert.match(vtext, /Jamie[\s\S]*pays[\s\S]*Alex[\s\S]*\$5/, 'viewer did not see settlement');
await viewer.screenshot({ path: '/tmp/watch-live-3.png' });

// Host pauses sharing → viewer sees paused state on the SAME link
await host.getByRole('button', { name: 'Sharing', exact: true }).click();
await host.getByRole('button', { name: 'Pause sharing', exact: true }).click();
await host.waitForTimeout(700);
vtext = await viewer.locator('.watch-shell').innerText();
assert.match(vtext, /paused sharing|Paused/);
await viewer.screenshot({ path: '/tmp/watch-paused.png' });

// Resume on the same link → viewer goes live again
await host.getByRole('button', { name: 'Resume sharing', exact: true }).click();
await host.getByRole('button', { name: 'Close dialog', exact: true }).click();
assert.equal(await host.getByRole('button', { name: 'Sharing', exact: true }).count(), 1);
await host.waitForTimeout(700);
vtext = await viewer.locator('.watch-shell').innerText();
assert.match(vtext, /Live/);
assert.doesNotMatch(vtext, /paused sharing/);

// End sharing → link clears; re-share creates a new link
await host.getByRole('button', { name: 'Sharing', exact: true }).click();
await host.getByRole('button', { name: 'Pause sharing', exact: true }).click();
await host.getByRole('button', { name: 'End sharing for this game', exact: true }).click();
await host.getByRole('button', { name: 'Share this game live', exact: true }).waitFor();
await host.getByRole('button', { name: 'Close dialog', exact: true }).click();
assert.equal(await host.getByRole('button', { name: 'Share', exact: true }).count(), 1);

console.log('E2E SHARE SYNC OK; host errors:', errors, 'viewer errors:', verrors);
await browser.close();
