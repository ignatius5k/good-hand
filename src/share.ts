import { validateStore, type Game } from './model';
import { firebaseConfig, firebaseReady } from './firebaseConfig';

export interface SharedSnapshot { k: string; updated: number; closed?: boolean; game: Omit<Game, 'share'> }
export type WatchState =
  | { status: 'loading' }
  | { status: 'unconfigured' }
  | { status: 'missing' }
  | { status: 'error' }
  | { status: 'live'; game: Game; updated: number; closed: boolean };

// The Firebase SDK is only fetched when someone shares or watches a game.
type Db = import('firebase/database').Database;
let dbPromise: Promise<Db> | null = null;
function database(): Promise<Db> {
  if (!firebaseReady) return Promise.reject(new Error('Live sharing is not configured in this copy of the app.'));
  dbPromise ??= Promise.all([import('firebase/app'), import('firebase/database')])
    .then(([{ initializeApp }, d]) => d.getDatabase(initializeApp(firebaseConfig)));
  return dbPromise;
}

export function newShareCredentials(): { id: string; key: string } {
  return { id: crypto.randomUUID().replaceAll('-', ''), key: crypto.randomUUID().replaceAll('-', '') };
}
export function shareUrl(id: string): string {
  return `${location.origin}${location.pathname}#watch=${id}`;
}
export function watchIdFromHash(hash: string): string | null {
  return /^#watch=([A-Za-z0-9]{16,64})$/.exec(hash)?.[1] ?? null;
}

// The published payload drops host-only data: the share credentials (they
// authorise writes) and the undo stack (transient, and it doubles the size).
export function publishableGame(game: Game): Omit<Game, 'share'> {
  const { share: _share, ...rest } = game;
  return { ...rest, undo: [] };
}
export function validateSharedGame(input: unknown): Game | null {
  if (!input || typeof input !== 'object' || Array.isArray(input) || 'share' in input) return null;
  return validateStore({ version: 1, games: [input as Game], activeId: null }) ? (input as Game) : null;
}

// Games paused in this session reject late in-flight publishes that would
// otherwise reopen them after "Pause sharing" completes. resumeSharedGame
// re-enables publishing when the host resumes on the same link.
const pausedShares = new Set<string>();
export async function publishGame(id: string, key: string, game: Game, closed = false): Promise<void> {
  if (pausedShares.has(id) && !closed) return;
  const db = await database();
  const { ref, set, serverTimestamp } = await import('firebase/database');
  if (closed) pausedShares.add(id);
  await set(ref(db, `sharedGames/${id}`), { k: key, updated: serverTimestamp(), closed, game: publishableGame(game) });
}
export async function closeSharedGame(id: string, key: string, game: Game): Promise<void> {
  pausedShares.add(id);
  await publishGame(id, key, game, true);
}
export function resumeSharedGame(id: string): void {
  pausedShares.delete(id);
}

export function subscribeGame(id: string, onUpdate: (state: WatchState) => void): () => void {
  if (!firebaseReady) { onUpdate({ status: 'unconfigured' }); return () => {}; }
  let cancelled = false;
  let unsubscribe: (() => void) | undefined;
  let received = false;
  const timeout = setTimeout(() => { if (!received && !cancelled) onUpdate({ status: 'error' }); }, 15_000);
  database()
    .then(db => cancelled ? undefined : import('firebase/database').then(({ ref, onValue }) => {
      if (cancelled) return;
      unsubscribe = onValue(ref(db, `sharedGames/${id}`), snap => {
        received = true;
        const value = snap.val() as SharedSnapshot | null;
        const game = value ? validateSharedGame(value.game) : null;
        if (!value || !game) onUpdate({ status: 'missing' });
        else onUpdate({ status: 'live', game, updated: typeof value.updated === 'number' ? value.updated : Date.now(), closed: value.closed === true });
      }, () => onUpdate({ status: 'error' }));
    }))
    .catch(() => onUpdate({ status: 'error' }));
  return () => { cancelled = true; unsubscribe?.(); clearTimeout(timeout); };
}
