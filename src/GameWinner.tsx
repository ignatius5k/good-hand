import { biggestWinners, money, type Game } from './model';

export default function GameWinner({game}:{game:Game}) {
  if(game.endedAt===null||game.players.length===0)return null;
  const result=biggestWinners(game);
  if(!result)return <span className="game-winner pending-winner">Winner pending final cash-outs</span>;
  if(result.amount===0)return <span className="game-winner pending-winner">Everyone broke even</span>;
  const tied=result.players.length>1;
  return <span className="game-winner">
    <span className="winner-label">{tied?'Joint biggest winners':'Biggest winner'}</span>
    <span className="winner-result"><span className="winner-names">{result.players.map(p=>p.name).join(', ')}</span><span className="winner-amount">{money(result.amount,game.currency,true)}{tied?' each':''}</span></span>
  </span>;
}
