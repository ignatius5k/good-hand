import { useRef, useState } from 'react';
import QRCode from 'react-qr-code';
import { Copy, Pause, Play, ShareNetwork } from '@phosphor-icons/react';
import { shareUrl, coHostUrl } from './share';
import type { Game } from './model';

export default function ShareDialog({ game, ready, onStart, onPause, onResume, onEnd, onToast }: {
  game: Game;
  ready: boolean;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onEnd: () => void;
  onToast: (message: string) => void;
}) {
  const url = game.share ? shareUrl(game.share.id) : '';
  const cohostUrl = game.share ? coHostUrl(game.share.id, game.share.key) : '';
  const [manualCoCopy, setManualCoCopy] = useState(false);
  const field = useRef<HTMLInputElement>(null);
  const [manualCopy, setManualCopy] = useState(false);
  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  async function copy() {
    setManualCopy(false);
    try {
      await navigator.clipboard.writeText(url);
      onToast('Link copied. Send it to your friends.');
    } catch {
      setManualCopy(true);
      requestAnimationFrame(() => { field.current?.focus(); field.current?.select(); });
    }
  }
  async function nativeShare() {
    try {
      await navigator.share({ title: game.name, text: `Follow ${game.name} live on Good Hand`, url });
    } catch { /* Dismissed sheets and cancelled shares need no message. */ }
  }
  async function copyCoHost() {
    setManualCoCopy(false);
    try {
      await navigator.clipboard.writeText(cohostUrl);
      onToast('Co-host link copied. It can edit the game.');
    } catch {
      setManualCoCopy(true);
    }
  }

  if (!ready) return <>
    <p className="dialog-copy">Live sharing needs a free Firebase project — it keeps everyone’s view of the table updated in real time.</p>
    <ol className="setup-steps">
      <li>Create a project at <a href="https://console.firebase.google.com" target="_blank" rel="noreferrer">console.firebase.google.com</a>, then add a web app to get its config values.</li>
      <li>Build → Realtime Database → Create database, and start in locked mode.</li>
      <li>Paste the rules from <code>firebase.rules.json</code> into the Rules tab and publish.</li>
      <li>Fill in <code>src/firebaseConfig.ts</code> with your web app config, then rebuild or restart the app.</li>
    </ol>
    <p className="field-hint">Full steps are in the README under “Live sharing”. No billing account is needed.</p>
    {game.share && <button className="text-button share-stop" onClick={onEnd}>This game was shared from a configured copy — remove its stored share link</button>}
  </>;

  if (!game.share) return <>
    <p className="dialog-copy">Share a live link so friends can follow {game.name} from their own phones — players, buy-ins, cash-outs and who pays whom, updated as you record them.</p>
    <button className="button primary full" onClick={onStart}><ShareNetwork size={18} />Share this game live</button>
  </>;

  if (game.share.paused) return <>
    <p className="dialog-copy">Sharing is paused. Friends with the link see your last update — resume to keep the same link, or end sharing and start a new link next time.</p>
    <button className="button primary full" onClick={onResume}><Play size={17} />Resume sharing</button>
    <button className="text-button share-stop" onClick={onEnd}>End sharing for this game</button>
  </>;

  return <>
    <p className="dialog-copy">{game.endedAt ? 'Friends see this game’s results and payments live at the link below.' : 'This game is live at the link below. Updates appear on your friends’ screens as you record them.'}</p>
    <div className="share-link">
      <input ref={field} aria-label="Live game link" readOnly value={url} onFocus={e => e.target.select()} />
      <button className="icon-button bordered" onClick={copy} aria-label="Copy live link"><Copy size={18} /></button>
    </div>
    {manualCopy && <p className="copy-help" role="status">Copy wasn’t available. The link is selected — press and hold to copy, or use Ctrl/Cmd+C.</p>}
    <div className="share-qr"><QRCode value={url} size={150} bgColor="#ffffff" fgColor="#161616" /><span>Friends at the table can scan this</span></div>
    <p className="field-hint">Anyone with the link can watch this game, including player names and amounts.</p>
    <div className={canNativeShare ? 'form-grid' : undefined}>
      {canNativeShare && <button className="button secondary" onClick={nativeShare}><ShareNetwork size={17} />Share via…</button>}
      <button className="button secondary" onClick={copy}><Copy size={17} />Copy link</button>
    </div>
    <button className="text-button cohost-link" onClick={copyCoHost}><Copy size={14} />Copy co-host link</button>
    <p className="field-hint">The co-host link lets someone else keep score too. Only share it with someone you trust.</p>
    {manualCoCopy && <p className="copy-help" role="status">Copy not available. Co-host link: <code className="link-code">{cohostUrl}</code></p>}
    <button className="text-button share-stop" onClick={onPause}><Pause size={14} />Pause sharing</button>
  </>;
}
