import test from 'node:test';
import assert from 'node:assert/strict';
import { freshGame, normalizeStore, uid, validateStore, type Game } from '../src/model.ts';
import { newShareCredentials, publishableGame, validateSharedGame, watchIdFromHash } from '../src/share.ts';

function game(): Game {
  const g = freshGame({ name: 'Test night', currency: 'SGD', buyin: 5000, smallBlind: 50, bigBlind: 100, settlementMode: 'tab' });
  g.players = [{ id: 'a', name: 'Alex', buyins: [5000, 5000], cashout: 4000 }, { id: 'b', name: 'Jamie', buyins: [5000], cashout: 11000 }];
  g.endedAt = Date.now();
  return g;
}

test('watch links parse only well-formed ids', () => {
  const { id } = newShareCredentials();
  assert.equal(watchIdFromHash(`#watch=${id}`), id);
  for (const hash of ['', '#', '#watch=', '#watch=short', '#watch=bad chars!!', '#watch=a?b=1', '#other=' + id, '#watch=' + id + 'extra?']) assert.equal(watchIdFromHash(hash), null);
});

test('share credentials are unique, unguessable and key-safe', () => {
  const a = newShareCredentials(), b = newShareCredentials();
  assert.notEqual(a.id, b.id);
  assert.notEqual(a.key, b.key);
  assert.match(a.id, /^[A-Za-z0-9]{32}$/); // No Firebase-key-illegal characters like . $ # [ ] /
  assert.match(a.key, /^[A-Za-z0-9]{32}$/);
});

test('published games drop share credentials and undo history but keep the full game', () => {
  const g = { ...game(), share: newShareCredentials() };
  g.undo = [{ players: g.players, events: g.events }];
  const pub = publishableGame(g);
  assert.ok(!('share' in pub));
  assert.deepEqual(pub.undo, []);
  assert.equal(pub.players.length, 2);
  assert.equal(pub.events.length, g.events.length);
  assert.ok(g.share && g.undo.length === 1); // The original game is untouched.
  assert.equal(validateSharedGame(pub), pub as unknown as Game);
});

test('viewer-side validation accepts published snapshots and rejects junk or leaked credentials', () => {
  const g = game();
  assert.deepEqual(validateSharedGame(publishableGame({ ...g, share: newShareCredentials() })), g);
  for (const bad of [null, undefined, 5, 'x', [], { ...g, share: { id: 'aaaaaaaaaaaaaaaa', key: 'bbbbbbbbbbbbbbbb' } }, { ...g, name: '' }, { ...g, buyin: -5 }, { ...g, players: [{ id: 'a', name: 'Alex', buyins: [], cashout: 4000 }] }]) assert.equal(validateSharedGame(bad), null);
});

test('saved games may carry share credentials but only well-formed ones', () => {
  const g = game();
  const share = newShareCredentials();
  assert.ok(validateStore({ version: 1, games: [{ ...g, share }], activeId: null }));
  assert.ok(validateStore({ version: 1, games: [{ ...g, share: { ...share, paused: true } }], activeId: null }));
  for (const bad of [{ id: 'x', key: share.key }, { id: share.id, key: 5 }, { id: share.id }, { ...share, paused: 'yes' }, 'abc', null]) assert.ok(!validateStore({ version: 1, games: [{ ...g, share: bad as Game['share'] }], activeId: null }));
});

test('paused shares survive storage normalization untouched', () => {
  const share = { ...newShareCredentials(), paused: true };
  const s = normalizeStore({ version: 1, games: [{ ...game(), share }], activeId: null });
  assert.deepEqual(s.games[0].share, share);
});

test('share credentials survive storage normalization and backup restores', () => {
  const share = newShareCredentials();
  const s = normalizeStore({ version: 1, games: [{ ...game(), share }], activeId: null });
  assert.deepEqual(s.games[0].share, share);
  const restored = JSON.parse(JSON.stringify(s));
  assert.ok(validateStore(restored));
  assert.deepEqual(restored.games[0].share, share);
});

test('a game keeps a stable id across publishing, so viewers keep watching the same record', () => {
  const g = { ...game(), share: newShareCredentials() };
  const id = g.share!.id;
  assert.equal(publishableGame({ ...g, events: [{ id: uid(), text: 'x', at: Date.now() }, ...g.events] }).id, g.id);
  assert.equal(id, g.share!.id);
});
