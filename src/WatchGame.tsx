import { useEffect, useState } from 'react';
import { ArrowRight, Check, Info, Spade, Users, WifiSlash } from '@phosphor-icons/react';
import { canEnd, gameIn, gameOut, money, net, needsSettling, totalIn, transfers, type Game } from './model';
import { subscribeGame, type WatchState } from './share';

const date = (at: number) => new Date(at).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' });
function ago(at: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  if (seconds < 45) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  return `on ${date(at)}`;
}

function PlayerList({ game }: { game: Game }) {
  const m = (n: number, signed = false) => money(n, game.currency, signed);
  const pending = !!game.endedAt && !canEnd(game);
  return <section className="ledger-panel">
    <div className="section-heading"><div><h2>Players</h2></div><span className="count-badge">{game.players.length}</span></div>
    {game.players.length ? <div className="player-rows">{game.players.map(p => <div className="player-row" key={p.id}>
      <div><h3>{p.name}</h3><span className="player-buyins"><span>{p.buyins.length} {p.buyins.length === 1 ? 'buy-in' : 'buy-ins'} · {m(totalIn(p))} in</span>{p.cashout !== null && <span>{m(p.cashout)} out</span>}</span></div>
      <div className="row-result">{net(p) === null ? <span>{pending ? 'Cash-out needed' : 'Playing'}</span> : <strong>{m(net(p)!, true)}</strong>}</div>
    </div>)}</div> : <div className="empty-table"><Users size={32} weight="duotone" /><h3>No players yet.</h3><p>Players appear here as the host adds them.</p></div>}
  </section>;
}

function Settlement({ game }: { game: Game }) {
  const m = (n: number) => money(n, game.currency);
  const list = transfers(game);
  if (!canEnd(game)) return null;
  return <section className="settlement-panel">
    <div className="section-heading"><div><h2>Who pays whom</h2><p>{game.settlementMode === 'tab' ? 'Net positions, calculated from the chips.' : 'Cash-outs paid from the game bank.'}</p></div><span className="settlement-count">{game.paid.length}/{list.length} paid</span></div>
    {list.length ? list.map(t => <div className={`transfer-row ${game.paid.includes(t.id) ? 'paid' : ''}`} key={t.id}>
      <div className="transfer-route"><strong>{t.from}</strong><span className="pays-label">pays</span><strong>{t.to}</strong></div>
      <strong>{m(t.amount)}</strong>
      {game.paid.includes(t.id) && <span className="watch-paid"><Check size={14} weight="bold" />Paid</span>}
    </div>) : <p className="all-even">Everyone broke even. No payments needed.</p>}
  </section>;
}

function Activity({ game }: { game: Game }) {
  if (!game.events.length) return null;
  return <section className="activity-panel">
    <div className="section-heading compact"><h2>Activity</h2><span>{game.events.length} updates</span></div>
    <div className="activity-list">{game.events.slice(0, 8).map(e => <div className="activity-row" key={e.id}><span className="activity-marker"><span /></span><p>{e.text}</p><time>{new Date(e.at).toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit', hour12: false })}</time></div>)}</div>
  </section>;
}

function WatchMessage({ icon, title, children }: { icon: React.ReactNode; title: string; children?: React.ReactNode }) {
  return <div className="watch-message">{icon}<h1>{title}</h1>{children}</div>;
}

export default function WatchGame({ id, onExit }: { id: string; onExit: () => void }) {
  const [state, setState] = useState<WatchState>({ status: 'loading' });
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => subscribeGame(id, setState), [id]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 15_000); return () => clearInterval(t); }, []);

  const game = state.status === 'live' ? state.game : null;
  const closed = state.status === 'live' && state.closed;
  const pending = !!game?.endedAt && !canEnd(game);
  const completed = !!game?.endedAt && canEnd(game);
  const settling = !!game && needsSettling(game);
  return <div className="app-shell watch-shell">
    <header className="topbar">
      <button className="brand" onClick={onExit} aria-label="Open my Good Hand"><Spade size={27} weight="fill" /><span>good hand<span className="brand-period">.</span></span></button>
      <span className={`watch-chip ${state.status === 'live' && !closed ? 'live' : ''}`}>{state.status === 'live' ? (closed ? 'Paused' : 'Live') : state.status === 'error' ? 'Offline' : state.status === 'missing' ? 'Unavailable' : 'Shared game'}</span>
    </header>
    <main id="main-content">
      {state.status === 'loading' && <WatchMessage icon={<Info size={30} weight="duotone" />} title="Connecting to the live game…" />}
      {state.status === 'unconfigured' && <WatchMessage icon={<Info size={30} weight="duotone" />} title="Live sharing isn’t set up in this copy of the app." />}
      {state.status === 'missing' && <WatchMessage icon={<Info size={30} weight="duotone" />} title="This shared game isn’t available."><p>The link may be mistyped, or the game was removed.</p></WatchMessage>}
      {state.status === 'error' && <WatchMessage icon={<WifiSlash size={30} weight="duotone" />} title="Couldn’t reach the live game."><p>Check your connection, then reopen the link.</p></WatchMessage>}
      {state.status !== 'live' && <button className="button secondary full watch-exit" onClick={onExit}>Open my Good Hand<ArrowRight size={16} /></button>}
      {game && <>
        <div className="game-heading"><div><div className="heading-meta"><span className={`status-chip ${game.endedAt ? 'finished' : 'live'}`}>{game.endedAt ? <Check size={12} weight="bold" /> : <span className="live-dot" />}{pending ? 'Cash-outs pending' : completed ? 'Finished' : 'In progress'}</span><span>{date(game.createdAt)}</span></div><h1>{game.name}</h1><p>{date(game.createdAt)} <span>·</span> Cash game <span>·</span> {game.currency}</p></div></div>
        {closed && <div className="notice"><Info size={18} />The host paused sharing. This is the last update they sent.</div>}
        <section className="game-stats" aria-label="Game statistics">
          <div><span>Total buy-ins</span><strong>{money(gameIn(game), game.currency)}</strong></div>
          <div><span>{completed ? 'Cashed out' : 'Chips in play'}</span><strong>{money(completed ? gameOut(game) : gameIn(game) - gameOut(game), game.currency)}</strong></div>
          <div><span>{completed ? 'Players' : 'Still playing'}</span><strong>{completed ? game.players.length : game.players.filter(p => p.cashout === null).length}<small>{!completed ? `/ ${game.players.length}` : ''}</small></strong></div>
        </section>
        <Settlement game={game} />
        {settling && !completed && <p className="settlement-help watch-help">The host is still recording cash-outs — payments appear here once every chip is counted.</p>}
        <PlayerList game={game} />
        <Activity game={game} />
        <p className="watch-meta">{state.status === 'live' && `Updated ${ago(state.updated, now)} · `}Shared live from a friend’s Good Hand.</p>
        <button className="button secondary full watch-exit" onClick={onExit}>Open my Good Hand<ArrowRight size={16} /></button>
      </>}
    </main>
    <footer className="app-footer"><span><Spade weight="fill" size={14} /> For the love of the home game.</span><span>Watch links show games read-only. Yours stay on your own device.</span></footer>
  </div>;
}
