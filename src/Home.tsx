import {ArrowRight,BookmarkSimple,CaretRight,CheckCircle,Clock} from '@phosphor-icons/react';
import {canEnd,gameIn,money,transfers,needsSettling,type Game} from './model';

const date=(at:number)=>new Date(at).toLocaleDateString('en-SG',{day:'numeric',month:'short'});
function nextStep(game:Game){
  if(game.endedAt===null)return {label:'In progress',action:'Resume game'};
  if(game.players.length===0)return {label:'No players recorded',action:'View game'};
  if(!canEnd(game)){
    const left=game.players.filter(p=>p.cashout===null).length;
    return {label:left?`${left} ${left===1?'cash-out':'cash-outs'} left`:'Check chip totals',action:left?'Finish cash-outs':'Review cash-outs'};
  }
  const unpaid=transfers(game).filter(t=>!game.paid.includes(t.id));
  return unpaid.length?{label:`${unpaid.length} ${unpaid.length===1?'payment':'payments'} left`,action:'View payments'}:{label:'All settled',action:'View results'};
}

export default function Home({games,activeGame,templateCount,onOpen,onHistory,onUnsettled,onTemplates,onSample}:{
  games:Game[];activeGame:Game|null;templateCount:number;
  onOpen:(game:Game)=>void;onHistory:()=>void;onUnsettled:()=>void;onTemplates:()=>void;onSample:()=>void;
}){
  const ended=games.filter(g=>g.endedAt!==null).sort((a,b)=>b.endedAt!-a.endedAt!);
  const featured=activeGame??ended[0];
  const step=featured?nextStep(featured):null;
  const recent=ended.filter(g=>g.id!==featured?.id).slice(0,3);
  const otherUnfinished=ended.filter(g=>g.id!==featured?.id&&needsSettling(g)).length;
  return <div className="home-page">
    <header className="home-heading">
      <h1 tabIndex={-1}>Game night.</h1>
      <p>{activeGame?'Your table is still open.':ended.length?'Your games, all in one place.':'Start a table with your usual setup.'}</p>
    </header>
    {featured&&step&&<section className="home-last-game" aria-label={activeGame?'Current game':'Last game'}>
      <div className="home-card-label"><span>{activeGame?'IN PROGRESS':'LAST GAME'}</span></div>
      <h2>{featured.name}</h2>
      <p className="home-game-meta">{date(featured.createdAt)} · {featured.players.length} {featured.players.length===1?'player':'players'} · {featured.currency}</p>
      <div className="home-game-status"><span>{featured.players.length>0&&(step.label==='All settled'?<CheckCircle size={16}/>:<Clock size={16}/>)}<span>{step.label}</span></span><span>{money(gameIn(featured),featured.currency)} in</span></div>
      {<button className="home-card-action" onClick={()=>onOpen(featured)}>{step.action}<ArrowRight size={17}/></button>}
    </section>}
    {otherUnfinished>0&&<button className="home-followup text-button" onClick={onUnsettled}>{otherUnfinished} other {otherUnfinished===1?'game needs':'games need'} settling<CaretRight size={15}/></button>}
    <button className="home-template-link" onClick={onTemplates}><BookmarkSimple size={21}/><span>Saved templates<small>{templateCount?`${templateCount} ${templateCount===1?'setup':'setups'} ready to use`:'Save your usual stakes'}</small></span><CaretRight size={17}/></button>
    {recent.length>0&&<section className="home-recent" aria-label="Recent games"><div className="home-section-heading"><h2>Recently played</h2><button className="text-button" onClick={onHistory}>View all<ArrowRight size={15}/></button></div><div>{recent.map(g=><button className="home-history-row" key={g.id} onClick={()=>onOpen(g)}><span><strong>{g.name}</strong><small>{date(g.createdAt)} · {g.players.length} players · {g.currency}</small></span><span>{nextStep(g).label}<CaretRight size={15}/></span></button>)}</div></section>}
    {!featured&&<div className="home-empty"><p>Your game nights will appear here.</p><button className="text-button" onClick={onSample}>Explore a sample<ArrowRight size={15}/></button></div>}
  </div>;
}
