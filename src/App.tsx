import { useState, useEffect, useRef, type ReactNode, type FormEvent } from 'react';
import { Spade, Plus, ArrowUpRight, ArrowRight, Clock as ClockIcon, Users, Check, X, GearSix, DownloadSimple, ArrowCounterClockwise, CaretRight, Trophy, Notebook, WifiSlash, DeviceMobile, UploadSimple, CheckCircle, Info, House, ArrowLeft, List, Play, BookmarkSimple, Trash, ShareNetwork } from '@phosphor-icons/react';
import GameSetup from './GameSetup';
import Home from './Home';
import GameWinner from './GameWinner';
import PaymentMessage from './PaymentMessage';
import ShareDialog from './ShareDialog';
import WatchGame from './WatchGame';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { watchForAppUpdates } from './appUpdates';
import { type Game, type Player, type Store, type Currency, type GameSettings, uid, totalIn, gameIn, gameOut, net, cents, money, transfers, needsSettling, paymentMessage, canEnd, freshGame, demoGame, blindsFor, loadStore, validateStore, saveTemplate, mergeBackup, correctCashouts, deleteGame, STORAGE_KEY } from './model';
import { closeSharedGame, newShareCredentials, publishGame, publishableGame, resumeSharedGame, subscribeGame, watchUrlFromHash, type WatchUrl } from './share';
import { firebaseReady } from './firebaseConfig';

type Modal = {type:'menu'|'new'|'add'|'settings'|'install'|'end'|'blinds'|'templates'|'correct'|'share'} | {type:'player';id:string;intent?:'rebuy'|'cashout'} | {type:'delete';id:string} | null;
type InstallEvent=Event & {prompt:()=>Promise<void>;userChoice:Promise<{outcome:string}>};
const date=(at:number)=>new Date(at).toLocaleDateString('en-SG',{day:'numeric',month:'short',year:'numeric'});
function Avatar({name,index=0}:{name:string;index?:number}){return <span className={`avatar tone-${index%6}`}>{name.split(' ').map(s=>s[0]).slice(0,2).join('').toUpperCase()}</span>;}
function Dialog({title,subtitle,onClose,children,setup=false,playerSheet=false,side=false}:{title:string;subtitle?:string;onClose:()=>void;children:ReactNode;setup?:boolean;playerSheet?:boolean;side?:boolean}){
  const ref=useRef<HTMLDialogElement>(null);
  useEffect(()=>{const d=ref.current!;const prev=document.activeElement as HTMLElement;d.showModal();return()=>{d.close();prev?.focus();};},[]);
  useEffect(()=>{const d=ref.current;if(d?.open&&!d.contains(document.activeElement))d.querySelector<HTMLButtonElement>('.dialog-header button')?.focus();},[title]);
  useEffect(()=>{if(!side)return;const previous=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{document.body.style.overflow=previous;};},[side]);
  return <dialog ref={ref} id={side?'side-menu':undefined} className={side?'side-menu-dialog':setup?'setup-dialog':playerSheet?'player-dialog':undefined} onCancel={onClose} onClick={e=>{if(e.target!==e.currentTarget)return;const r=e.currentTarget.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)onClose();}} aria-labelledby="dialog-title"><div className="dialog-inner"><header className="dialog-header"><div><h2 id="dialog-title">{title}</h2>{subtitle&&<p>{subtitle}</p>}</div><button className="icon-button" onClick={onClose} aria-label="Close dialog"><X size={21}/></button></header>{children}</div></dialog>;
}
function Field({label,children}:{label:string;children:ReactNode}){return <label className="field"><span>{label}</span>{children}</label>;}
function NumberField({label,name,value,min='0',step='0.01'}:{label:string;name:string;value:number;min?:string;step?:string}){return <Field label={label}><input name={name} type="number" min={min} max="1000000" step={step} inputMode="decimal" defaultValue={value} required/></Field>;}
function AmountPicker({label,name,value,currency='SGD',min=0,rangeMax=250,onChange}:{label:string;name:string;value:number;currency?:Currency;min?:number;rangeMax?:number;onChange?:(value:string)=>void}){
  const [amount,setAmount]=useState(String(value));
  function changeAmount(next:string){setAmount(next);onChange?.(next);}
  const sliding=useRef(false);
  const parsed=Number(amount),valid=Number.isFinite(parsed)&&parsed>=0;
  const max=Math.max(Math.round(rangeMax*100),valid?Math.round(parsed*100):0,100);
  const sliderValue=valid?Math.max(Math.round(min*100),Math.min(max,Math.round(parsed*100))):Math.round(min*100);
  return <div className="amount-picker"><label className="amount-title" htmlFor={`amount-${name}`}>{label}</label><div className="amount-display"><span>{currency}</span><input id={`amount-${name}`} name={name} value={amount} onChange={e=>changeAmount(e.target.value)} type="text" inputMode="decimal" autoComplete="off" required maxLength={12} onFocus={e=>e.target.select()}/></div><input className="amount-slider" type="range" min={Math.round(min*100)} max={max} step={1} value={sliderValue} onPointerDown={()=>{sliding.current=true;}} onPointerUp={()=>{sliding.current=false;}} onPointerCancel={()=>{sliding.current=false;}} onBlur={()=>{sliding.current=false;}} onKeyDown={()=>{sliding.current=false;}} onChange={e=>{const raw=Number(e.target.value);const snap=max<=100?1:100;const next=sliding.current?Math.min(max,Math.max(Math.round(min*100),Math.round(raw/snap)*snap)):raw;changeAmount((next/100).toFixed(2).replace(/\.00$/,''));}} aria-label={`${label} slider`} aria-valuetext={money(sliderValue,currency)} style={{'--range-fill':`${((sliderValue-Math.round(min*100))/(max-Math.round(min*100)))*100}%`} as React.CSSProperties}/><div className="slider-labels"><span>{money(Math.round(min*100),currency)}</span><span>Slide or tap the amount</span><span>{money(max,currency)}</span></div></div>;
}
function CashoutCorrections({game,onSubmit}:{game:Game;onSubmit:(e:FormEvent<HTMLFormElement>)=>void}){
  const [values,setValues]=useState(()=>game.players.map(p=>String((p.cashout??0)/100)));
  let counted:number|null=null;
  try{counted=values.reduce((total,value)=>total+cents(value),0);}catch{/* Incomplete typed values are checked on save. */}
  const difference=counted===null?null:gameIn(game)-counted;
  const m=(value:number)=>money(value,game.currency);
  return <form className="setup-form" onSubmit={onSubmit}><div className="setup-scroll cashout-corrections"><p className="dialog-copy">Slide or tap each final chip value. They must add up to {m(gameIn(game))}.</p>{game.paid.length>0&&<p className="form-note">Changing cash-outs resets payment checkmarks. Account for money already paid before using the new split.</p>}{game.players.map((p,i)=><AmountPicker key={p.id} label={`${p.name} cash-out (${game.currency})`} name={`cashout-${p.id}`} value={(p.cashout??0)/100} currency={game.currency} rangeMax={Math.max(gameIn(game)/100,1)} onChange={value=>setValues(previous=>previous.map((old,index)=>index===i?value:old))}/>)}</div><div className="setup-footer"><div className="correction-total" role="status"><span>{counted===null?'Enter valid amounts':`${m(counted)} counted`}</span><strong>{difference===null?'':difference===0?'Balanced':`${m(Math.abs(difference))} ${difference>0?'left':'over'}`}</strong></div><button className="button primary full" type="submit">Save corrections<Check size={17}/></button></div></form>;
}
function download(content:string,name:string,type='application/json'){const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function BlindPanel({game,onEdit}:{game:Game;onEdit:()=>void}){
  const stakes=blindsFor(game);
  return <section className="blind-panel"><div className="panel-heading"><h2>Blinds</h2><button className="text-button" onClick={onEdit}>Edit<ArrowUpRight size={14}/></button></div><div className="blind-values"><div><span>Small blind</span><strong>{money(stakes.small,game.currency)}</strong></div><span className="slash">/</span><div><span>Big blind</span><strong>{money(stakes.big,game.currency)}</strong></div></div><p className="fixed-blind-note">Fixed for the night.</p></section>;
}
function App(){
  const [loaded]=useState(loadStore);
  const [data,setData]=useState<Store>(loaded.data);
  const dataRef=useRef(data);dataRef.current=data;
  const subscribers=useRef<Map<string,()=>void>>(new Map());
  const lastPublished=useRef<Map<string,{game:Omit<Game,'share'>;closed:boolean}>>(new Map());
  const [storageError,setStorageError]=useState(loaded.error);
  const [demo,setDemo]=useState<Game|null>(()=>new URLSearchParams(location.search).has('demo')?demoGame():null);
  const [tab,setTab]=useState(()=>new URLSearchParams(location.search).has('demo')||loaded.data.games.some(g=>g.id===loaded.data.activeId&&g.endedAt===null)?'game':'home');
  const [gameView,setGameView]=useState('players');
  const [historyMode,setHistoryMode]=useState<'all'|'unsettled'>('all');
  const [selectedId,setSelectedId]=useState<string|null>(null);
  const [modal,setModal]=useState<Modal>(null);
  const [error,setError]=useState('');
  const [toast,setToast]=useState('');
  const [offline,setOffline]=useState(!navigator.onLine);
  const [installEvent,setInstallEvent]=useState<InstallEvent|null>(null);
  const [watchUrl,setWatchUrl]=useState<WatchUrl>(()=>watchUrlFromHash(location.hash));
  const fileInput=useRef<HTMLInputElement>(null);
  const [swRegistration,setSwRegistration]=useState<ServiceWorkerRegistration>();
  const {needRefresh:[needRefresh],offlineReady:[offlineReady],updateServiceWorker}=useRegisterSW({
    onRegisteredSW(_url,registration){setSwRegistration(registration);},
  });
  useEffect(()=>swRegistration?watchForAppUpdates(swRegistration):undefined,[swRegistration]);
  const active=data.games.find(g=>g.id===data.activeId)??null;
  const game=demo??(selectedId?data.games.find(g=>g.id===selectedId)??active:active);
  const gameRef=useRef<Game|null>(game);gameRef.current=tab==='game'?game:null;
  const liveGame=active?.endedAt===null?active:null;
  useEffect(()=>{
    const context=(document as Document & {modelContext?:{registerTool:(tool:unknown,options:{signal:AbortSignal})=>void|Promise<void>}}).modelContext;
    if(!context?.registerTool)return;
    const lifecycle=new AbortController();
    const tool={name:'get_game_summary',title:'Read poker game summary',description:'Read the currently displayed poker game, player chip totals and settlement payments without changing it.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute(input:unknown){
      if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length)throw Error('Expected an empty object.');
      const g=gameRef.current;if(!g)return {game:null};
      return {name:g.name,currency:g.currency,status:g.endedAt?(canEnd(g)?'finished':'cashouts_pending'):'open',totalBuyinsCents:gameIn(g),totalCashoutsCents:gameOut(g),players:g.players.map(p=>({name:p.name,buyinCents:totalIn(p),cashoutCents:p.cashout,netCents:net(p)})),settlements:transfers(g)};
    }};
    try{void Promise.resolve(context.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch{}
    return()=>lifecycle.abort();
  },[]);
  const playingGame=demo?.endedAt===null?demo:liveGame;
  useEffect(()=>{if(tab==='game'&&!game){setTab('home');setSelectedId(null);}},[tab,game]);
  const current=game&&!game.endedAt;
  const pending=!!game?.endedAt&&!canEnd(game);
  const completed=!!game?.endedAt&&canEnd(game);
  const editable=!!game&&!completed;
  const m=(n:number,signed=false)=>money(n,game?.currency??'SGD',signed);
  useEffect(()=>{const on=()=>setOffline(false),off=()=>setOffline(true),install=(e:Event)=>{e.preventDefault();setInstallEvent(e as InstallEvent);};window.addEventListener('online',on);window.addEventListener('offline',off);window.addEventListener('beforeinstallprompt',install);return()=>{window.removeEventListener('online',on);window.removeEventListener('offline',off);window.removeEventListener('beforeinstallprompt',install);};},[]);
  useEffect(()=>{if(!toast)return;const t=setTimeout(()=>setToast(''),4000);return()=>clearTimeout(t);},[toast]);
  useEffect(()=>{setError('');},[modal]);
  useEffect(()=>{const sync=(e:StorageEvent)=>{if(e.key!==STORAGE_KEY)return;const next=loadStore();if(!next.error){setData(next.data);setToast('Game updated from another tab.');}else setStorageError(next.error);};window.addEventListener('storage',sync);return()=>window.removeEventListener('storage',sync);},[]);
  useEffect(()=>{const on=()=>setWatchUrl(watchUrlFromHash(location.hash));window.addEventListener('hashchange',on);return()=>window.removeEventListener('hashchange',on);},[]);
  const shareSnapshot=(g:Game)=>({game:publishableGame(g),closed:!!g.share?.paused});
  useEffect(()=>{const shared=data.games.filter(g=>g.share&&!g.share.paused);if(!shared.length)return;const t=setTimeout(()=>{for(const g of shared){const {id,key}=g.share!;const snap=shareSnapshot(g);const last=lastPublished.current.get(id);if(last&&JSON.stringify(last)===JSON.stringify(snap))continue;lastPublished.current.set(id,snap);publishGame(id,key,g,snap.closed).catch(()=>{});}},350);return()=>clearTimeout(t);},[data]);
  useEffect(()=>{
    const ids=data.games.filter(g=>g.share).map(g=>g.share!.id);
    const added=ids.filter(id=>!subscribers.current.has(id));
    const removed=[...subscribers.current.keys()].filter(id=>!ids.includes(id));
    for(const id of removed){subscribers.current.get(id)!();subscribers.current.delete(id);lastPublished.current.delete(id);}
    for(const id of added){
      const unsub=subscribeGame(id,(state)=>{
        if(state.status!=='live'||!state.game)return;
        const local=dataRef.current.games.find(g=>g.share?.id===id);
        if(!local)return;
        const nextGame:Game={...state.game,id:local.id,share:{...local.share!,paused:state.closed},undo:[]};
        const snap=shareSnapshot(nextGame);
        const last=lastPublished.current.get(id);
        if(last&&JSON.stringify(last)===JSON.stringify(snap))return;
        lastPublished.current.set(id,snap);
        setData(prev=>({...prev,games:prev.games.map(g=>g.id===local.id?nextGame:g)}));
      });
      subscribers.current.set(id,unsub);
    }
    return()=>{for(const unsub of subscribers.current.values())unsub();subscribers.current.clear();};
  },[data.games.filter(g=>g.share).map(g=>g.share!.id).join(',')]);
  function commit(next:Store){
    if(loaded.error&&storageError)throw new Error('Export and restore your saved data in Settings first.');
    try{localStorage.setItem(STORAGE_KEY,JSON.stringify(next));setStorageError(null);}catch{setStorageError('Changes are in memory only. Device storage is full or unavailable. Export a backup before closing this app.');}
    setData(next);
  }
  function update(g:Game){if(demo){setDemo(g);return;}commit({...data,games:data.games.map(x=>x.id===g.id?g:x)});}
  function transaction(players:Player[],text:string){if(!game)return;update({...game,players,undo:[...game.undo,{players:game.players,events:game.events}].slice(-20),events:[{id:uid(),text,at:Date.now()},...game.events]});}
  function open(m:Modal){setError('');setModal(m);}
  function showError(message:string){setError(message);requestAnimationFrame(()=>{const notice=document.querySelector<HTMLParagraphElement>('dialog .form-error');notice?.scrollIntoView({block:'center'});notice?.focus({preventScroll:true});});}
  function submit(e:FormEvent<HTMLFormElement>,fn:(f:FormData)=>void){e.preventDefault();try{fn(new FormData(e.currentTarget));setModal(null);setError('');}catch(e){showError(e instanceof Error?e.message:'Something went wrong. Please try again.');}}
  function navigate(next:string){setToast('');setHistoryMode('all');setTab(next);setGameView('players');setSelectedId(null);window.scrollTo({top:0,behavior:'instant'});if(next==='home')requestAnimationFrame(()=>document.querySelector<HTMLHeadingElement>('.home-heading h1')?.focus({preventScroll:true}));}
  function openGame(g:Game){if(demo?.id!==g.id){setDemo(null);historyReplace();}setSelectedId(g.id);setTab('game');setGameView('players');window.scrollTo({top:0,behavior:'instant'});}
  function startDemo(){setDemo(demoGame());setSelectedId(null);setTab('game');setGameView('players');window.scrollTo({top:0,behavior:'instant'});}
  function startGame(settings:GameSettings,save?:{name:string;id?:string}){
    if(active&&!active.endedAt)throw Error('End your current game before starting another.');
    const g=freshGame(settings);
    const templates=save?saveTemplate(data.templates??[],settings,save.name,save.id):data.templates??[];
    commit({...data,activeId:g.id,games:[...data.games,g],templates});
    setDemo(null);historyReplace();setSelectedId(null);setTab('game');setGameView('players');setModal(null);setToast(save?'Game started and template saved.':'Table open. Add your first player.');
  }
  function continueSharedGame(shared:Game,id:string,key:string,closed:boolean){
    if(demo)setDemo(null);
    const existing=dataRef.current.games.find(g=>g.share?.id===id);
    const activeOpen=dataRef.current.games.find(g=>g.id===dataRef.current.activeId&&g.endedAt===null);
    if(activeOpen&&(!existing||activeOpen.id!==existing.id)){setToast('End your current game before continuing this one.');return;}
    let nextGame:Game={...shared,id:existing?existing.id:shared.id,share:{id,key,paused:closed||undefined},undo:[]};
    if(dataRef.current.games.some(g=>g.id===nextGame.id&&g.share?.id!==id))nextGame={...nextGame,id:uid()};
    lastPublished.current.set(id,shareSnapshot(nextGame));
    if(existing){
      commit({...dataRef.current,games:dataRef.current.games.map(g=>g.id===existing.id?nextGame:g),activeId:existing.id});
    }else{
      commit({...dataRef.current,games:[...dataRef.current.games,nextGame],activeId:nextGame.id});
    }
    window.history.replaceState(null,'',location.pathname);
    setWatchUrl(null);setSelectedId(null);setTab('game');setGameView('players');setModal(null);
    setToast(closed?'Game imported. Sharing is paused — resume to sync.':'Game continued on this device. Your changes will sync with the table.');
  }
  function confirmDeleteGame(){
    if(modal?.type!=='delete')return;
    try{
      if(loaded.error&&storageError)throw Error('Restore your saved data in Settings before deleting a game.');
      const doomed=data.games.find(g=>g.id===modal.id);
      if(doomed?.share)closeSharedGame(doomed.share.id,doomed.share.key,doomed).catch(()=>{});
      const next=deleteGame(data,modal.id);
      localStorage.setItem(STORAGE_KEY,JSON.stringify(next));
      setData(next);setStorageError(null);setModal(null);
      if(tab==='game')navigate('home');
      else requestAnimationFrame(()=>document.querySelector<HTMLHeadingElement>('main h1')?.focus({preventScroll:true}));
      setToast('Game deleted.');
    }catch{showError('Could not delete this game. Your saved games are unchanged. Try again.');}
  }
  function endNow(){if(!game)return;update({...game,endedAt:Date.now(),clock:{...game.clock,enabled:false,running:false,endsAt:null}});navigate('home');setModal(null);}
  function finish(){if(!game||!canEnd(game))return;update({...game,endedAt:Date.now(),clock:{...game.clock,enabled:false,running:false,endsAt:null},undo:[]});navigate('home');setModal(null);}
  const history=data.games.filter(g=>g.endedAt!==null).sort((a,b)=>b.createdAt-a.createdAt);
  const visibleHistory=historyMode==='unsettled'?history.filter(needsSettling):history;
  const gameToDelete=modal?.type==='delete'?data.games.find(g=>g.id===modal.id):undefined;
  const player=modal?.type==='player'?game?.players.find(p=>p.id===modal.id):null;
  const activePlayers=game?.players.filter(p=>p.cashout===null)??[];
  
  function backup(){const raw=loaded.error?localStorage.getItem(STORAGE_KEY):null;download(raw??JSON.stringify(data,null,2),`good-hand-backup-${new Date().toISOString().slice(0,10)}.json`);setToast('Backup downloaded.');}
  const tally=new Map<string,{name:string;currency:Currency;net:number;games:number}>();
  history.filter(canEnd).forEach(g=>g.players.forEach(p=>{const k=`${p.name.toLowerCase()}-${g.currency}`,old=tally.get(k);tally.set(k,{name:p.name,currency:g.currency,net:(old?.net??0)+net(p)!,games:(old?.games??0)+1});}));
  if(watchUrl)return <WatchGame id={watchUrl.id} onExit={()=>{window.history.replaceState(null,'',location.pathname+location.search);setWatchUrl(null);}} onContinue={watchUrl.key?(shared:Game,share:{id:string;key:string;closed:boolean})=>continueSharedGame(shared,share.id,share.key,share.closed):undefined}/>;
  return <><div className="app-shell" data-game-view={tab==='game'&&editable?gameView:undefined}>
  <header className="topbar">
    <button className="icon-button menu-toggle" aria-label="Open menu" aria-expanded={modal?.type==='menu'} aria-controls="side-menu" onClick={()=>open({type:'menu'})}><List size={24}/></button>
    <button className="brand" onClick={()=>navigate('home')} aria-label="Good Hand home"><Spade size={27} weight="fill"/><span>good hand<span className="brand-period">.</span></span></button>
    <nav className="bottom-navigation" aria-label="Main navigation">
      <button className={`nav-item ${tab==='home'?'active':''}`} aria-current={tab==='home'?'page':undefined} onClick={()=>navigate('home')}><House size={23} weight={tab==='home'?'fill':'regular'}/><span>Home</span></button>
      <button className="nav-start" aria-label={playingGame?'Resume game':'Start a game'} onClick={()=>playingGame?openGame(playingGame):open({type:'new'})}><Play size={19} weight="fill"/><span>{playingGame?'Resume':'Start'}</span></button>
      <button className={`nav-item ${tab==='players'?'active':''}`} aria-current={tab==='players'?'page':undefined} onClick={()=>navigate('players')}><Users size={23} weight={tab==='players'?'fill':'regular'}/><span>Players</span></button>
    </nav>
  </header>
  <main id="main-content">
    {storageError&&<div className="notice warning" role="alert"><Info size={20}/>{storageError}<button className="text-button" onClick={()=>open({type:'settings'})}>Settings</button></div>}
    {offline&&<div className="notice"><WifiSlash size={18}/> You’re offline. Keep playing; your game stays on this device.</div>}
    {needRefresh&&<div className="notice app-update-notice" role="status">An app update is ready.<button className="text-button" onClick={()=>updateServiceWorker(true)}>Update now</button></div>}
    {demo&&<div className="demo-banner"><div><span className="demo-label">SAMPLE GAME</span><span>Take a seat. Try it out.</span></div><button onClick={()=>{setDemo(null);historyReplace();if(liveGame)openGame(liveGame);else open({type:'new'});}}>Start your own <ArrowRight size={16}/></button></div>}
    {tab==='home'&&<Home games={demo?[...data.games,demo]:data.games} activeGame={demo&&demo.endedAt===null?demo:liveGame} onOpen={openGame} onHistory={()=>navigate('history')} onUnsettled={()=>{navigate('history');setHistoryMode('unsettled');}} onTemplates={()=>open({type:'templates'})}/>}
    {tab==='game'&&game&&<>
      <button className="text-button back-home" onClick={()=>navigate('home')}><ArrowLeft size={16}/>Home</button>
      <div className="game-heading"><div><div className="heading-meta"><span className={`status-chip ${game.endedAt?'finished':'live'}`}>{game.endedAt?<Check size={12} weight="bold"/>:<span className="live-dot"/>}{pending?'Cash-outs pending':completed?'Finished':'In progress'}</span><span>{date(game.createdAt)}</span></div><h1>{game.name}</h1><p>{date(game.createdAt)} <span>·</span> Cash game <span>·</span> {game.currency}</p></div><div className="heading-actions">{!demo&&<button className={`button secondary share-button${game.share&&!game.share.paused?' live':''}`} onClick={()=>open({type:'share'})}>{game.share&&!game.share.paused?<span className="share-dot"/>:<ShareNetwork size={15}/>}{game.share?(game.share.paused?'Paused':'Sharing'):'Share'}</button>}{current?<button className="button secondary" onClick={()=>open({type:'end'})}>End game <ArrowUpRight size={16}/></button>:<><button aria-label="Export results" className="button secondary export-results" disabled={!completed} onClick={()=>{const rows=['Player,Buy-ins,Cash-out,Net',...game.players.map(p=>[JSON.stringify(p.name),totalIn(p)/100,p.cashout!/100,net(p)!/100].join(','))];download(rows.join('\n'),'good-hand-results.csv','text/csv');}}><span className="export-label">Export results</span> <DownloadSimple size={17}/></button>{(!active||active.endedAt)&&<button className="button primary" onClick={()=>open({type:'new'})}><Plus size={17}/>New game</button>}</>}</div></div>
      {(gameView==='players'||completed)&&<section className="game-stats" aria-label="Game statistics"><div><span>Total buy-ins</span><strong>{m(gameIn(game))}</strong></div><div><span>{completed?'Cashed out':pending?'Chips uncounted':'Chips in play'}</span><strong>{m(completed?gameOut(game):gameIn(game)-gameOut(game))}</strong></div><div><span>{completed?'Players':pending?'Cash-outs left':'Still playing'}</span><strong>{completed?game.players.length:activePlayers.length}<small>{!completed?`/ ${game.players.length}`:''}</small></strong></div></section>}
      {editable&&<div className="game-controls">{gameView==='players'?<>{current&&<button className="button secondary" onClick={()=>setGameView('blinds')}><ClockIcon size={17}/>{m(blindsFor(game).small)} / {m(blindsFor(game).big)} blinds</button>}<button className="button secondary" onClick={()=>setGameView('settle')}>Who pays whom<ArrowRight size={16}/></button></>:<button className="text-button" onClick={()=>setGameView('players')}><ArrowRight size={15} style={{transform:'rotate(180deg)'}}/>Back to players</button>}</div>}
      <div id="game-panel"  className={`game-layout mobile-view-${gameView} ${completed?'closed-layout':''}`}>
<div className="ledger-column">{pending&&gameView==='players'&&<p className="pending-note">Game ended. Tap a player to record their cash-out. Your payment message will be ready once all chip totals balance.</p>}<section className="ledger-panel"><div className="section-heading"><div><h2>Players</h2></div>{editable&&<button className="button primary small" disabled={game.players.length>=30} onClick={()=>open({type:'add'})}><Plus size={16} weight="bold"/>Add player</button>}</div>
      {game.players.length?<div className="player-rows">{game.players.map(p=><button className="player-row" key={p.id} disabled={!editable} onClick={()=>open({type:'player',id:p.id,intent:p.cashout===null&&current?'rebuy':'cashout'})} aria-label={`Manage ${p.name}`}><div><h3>{p.name}</h3><span className="player-buyins"><span>{p.buyins.length} {p.buyins.length===1?'buy-in':'buy-ins'} · {m(totalIn(p))} in</span>{p.cashout!==null&&<span>{m(p.cashout)} out</span>}</span></div><div className="row-result">{net(p)===null?<span>{pending?'Cash-out needed':'Playing'}</span>:<strong>{m(net(p)!,true)}</strong>}{editable&&<CaretRight size={16}/>}</div></button>)}</div>:<div className="empty-table"><Users size={32} weight="duotone"/><h3>Add your first player.</h3><p>Add your first player and their buy-in.</p></div>}
      <div className="ledger-footer">{editable&&game.undo.length>0&&<button className="text-button" onClick={()=>{const last=game.undo.at(-1)!;update({...game,...last,undo:game.undo.slice(0,-1)});setToast('Last player change undone.');}}><ArrowCounterClockwise size={15}/>Undo last change</button>}</div></section>
      {completed?<section className="settlement-panel"><div className="section-heading"><div><h2>Settle up</h2><p>{game.settlementMode==='tab'?'Who pays whom, calculated for you.':'Pay these cash-outs from the game bank.'}</p></div><span className="settlement-count">{game.paid.length}/{transfers(game).length} paid</span></div>{transfers(game).length?transfers(game).map(t=><div className={`transfer-row ${game.paid.includes(t.id)?'paid':''}`} key={t.id}><div className="transfer-route"><strong>{t.from}</strong><span className="pays-label">pays</span><strong>{t.to}</strong></div><strong>{m(t.amount)}</strong><button className={`button small ${game.paid.includes(t.id)?'paid-button':'secondary'}`} onClick={()=>update({...game,paid:game.paid.includes(t.id)?game.paid.filter(id=>id!==t.id):[...game.paid,t.id]})}>{game.paid.includes(t.id)?<><Check size={15}/>Paid</>:'Mark paid'}</button></div>):<p className="all-even">Everyone broke even. No payments needed.</p>}<PaymentMessage message={paymentMessage(game)!} onCopyStart={()=>setToast('')} onCopied={()=>setToast('Payment message copied. Ready to paste.')}/><div className="settlement-footer"><button className="text-button" onClick={()=>open({type:'correct'})}>Correct cash-outs</button></div></section>:<section className="activity-panel"><div className="section-heading compact"><h2>Tonight’s activity</h2><span>{game.events.length} updates</span></div><div className="activity-list">{game.events.slice(0,4).map((e,i)=><div className="activity-row" key={e.id}><span className="activity-marker"><span/></span><p>{e.text}</p><time>{new Date(e.at).toLocaleTimeString('en-SG',{hour:'2-digit',minute:'2-digit',hour12:false})}</time></div>)}</div></section>}
      {editable&&gameView==='settle'&&<section className="live-settlement"><div className="section-heading"><div><h2>Who pays whom</h2><p>Calculated from everyone’s final chip value.</p></div></div><div className="close-check"><div><span>Total buy-ins</span><strong>{m(gameIn(game))}</strong></div><div><span>Final chips recorded</span><strong>{m(gameOut(game))}</strong></div><div><span>Still to account for</span><strong>{m(gameIn(game)-gameOut(game))}</strong></div></div>{canEnd(game)?<><p className="settle-ready"><CheckCircle size={18}/>All chips accounted for.</p><div className="draft-transfers">{transfers(game).length?transfers(game).map(t=><div className="transfer-row" key={t.id}><div className="transfer-route"><strong>{t.from}</strong><span className="pays-label">pays</span><strong>{t.to}</strong></div><strong>{m(t.amount)}</strong></div>):<p className="all-even">Everyone broke even. No payments needed.</p>}</div><p className="field-hint settlement-explanation">{game.settlementMode==='tab'?'Buy-ins are deducted from cash-outs. Only the net differences need to change hands.':'Buy-ins were paid up front. These cash-outs come from the game bank.'}</p><button className="button primary full" onClick={finish}>Finish game & save payments<Check size={17}/></button></>:<><p className="settlement-help">{activePlayers.length?`${activePlayers.length} ${activePlayers.length===1?'player still needs':'players still need'} a cash-out. Enter their remaining chip values to work out the payments.`:game.players.length<2?'Add at least two players to calculate payments.':'The cash-outs don’t match the buy-ins yet. Correct the chip values to calculate payments.'}</p>{activePlayers.length>0&&<div className="pending-cashouts">{activePlayers.map((p,i)=><button key={p.id} onClick={()=>open({type:'player',id:p.id,intent:'cashout'})}><Avatar name={p.name} index={i}/><span>{p.name}</span><span>Cash out<ArrowUpRight size={16}/></span></button>)}</div>}{game.players.length<2&&<button className="button secondary full" onClick={()=>open({type:'add'})}><Plus size={16}/>Add player</button>}{activePlayers.length===0&&game.players.length>=2&&<button className="button secondary full" onClick={()=>setGameView('players')}>Review cash-outs<ArrowRight size={16}/></button>}{demo&&activePlayers.length>0&&<button className="text-button sample-fill" onClick={()=>{const available=gameIn(game)-gameOut(game);const denominator=activePlayers.length*(activePlayers.length+1)/2;let left=available;const values=new Map(activePlayers.map((p,i)=>{const amount=i===activePlayers.length-1?left:Math.floor(available*(i+1)/denominator);left-=amount;return [p.id,amount];}));transaction(game.players.map(p=>p.cashout===null?{...p,cashout:values.get(p.id)!}:p),'Sample final chip values filled in.');}}>Fill sample chip values<ArrowRight size={15}/></button>}</>}</section>}
      </div><aside>{current?<BlindPanel game={game} onEdit={()=>open({type:'blinds'})}/>:<section className="night-card"><Trophy size={35} weight="duotone"/><p>Top result</p><h2>{[...game.players].sort((a,b)=>net(b)!-net(a)!)[0]?.name}</h2><strong className="positive">{m(Math.max(...game.players.map(p=>net(p)!)),true)}</strong><span>Game complete.</span></section>}</aside></div>
      {!demo&&<button className="text-button delete-game-link" onClick={()=>open({type:'delete',id:game.id})}><Trash size={17}/>Delete game</button>}
    </>}
    {tab==='history'&&<>
      <div className="page-heading"><h1 tabIndex={-1}>{historyMode==='unsettled'?'Games to settle':'Game history'}</h1><p>{historyMode==='unsettled'?'Cash-outs and payments still to finish.':'Every table. Every result.'}</p></div>
      {historyMode==='unsettled'&&<button className="text-button history-filter-reset" onClick={()=>setHistoryMode('all')}><ArrowLeft size={16}/>View all games</button>}
      {visibleHistory.length?<div className="history-list">{visibleHistory.map(g=><div className="history-entry" key={g.id}><button className="history-row" onClick={()=>openGame(g)}><div className="history-icon"><Spade size={25} weight="fill"/></div><div><h2>{g.name}</h2><p>{date(g.createdAt)} · {g.players.length} players · {g.currency}</p></div><div className="history-money"><strong>{money(gameIn(g),g.currency)}</strong><span>{g.players.length===0?'No players recorded':!canEnd(g)?(g.players.some(p=>p.cashout===null)?'Cash-outs pending':'Check chip totals'):`${transfers(g).filter(t=>!g.paid.includes(t.id)).length} ${transfers(g).filter(t=>!g.paid.includes(t.id)).length===1?'payment':'payments'} left`}</span></div><GameWinner game={g}/><CaretRight size={20}/></button><button className="icon-button history-delete" aria-label={`Delete ${g.name}`} onClick={()=>open({type:'delete',id:g.id})}><Trash size={18}/></button></div>)}</div>:historyMode==='unsettled'?<div className="empty-view"><CheckCircle size={42}/><h2>All settled.</h2><p>No cash-outs or payments left to finish.</p></div>:<div className="empty-view"><Notebook size={42} weight="duotone"/><h2>No finished games yet.</h2><p>Finished games and their settlements will live here.</p><button className="button primary" onClick={()=>{if(liveGame)openGame(liveGame);else open({type:'new'});}}>{liveGame?'Back to your game':'Start a game'}<ArrowRight size={17}/></button></div>}
    </>}

    {tab==='players'&&<><div className="page-heading"><p className="eyebrow"></p><h1>Players</h1><p>Lifetime results from your finished games. Same names count together.</p></div>{tally.size?<section className="players-list">{[...tally.values()].sort((a,b)=>a.currency.localeCompare(b.currency)||b.net-a.net).map((p,i)=><div className="regular-row" key={`${p.name}-${p.currency}`}><Avatar name={p.name} index={i}/><div><h2>{p.name}</h2><p>{p.games} {p.games===1?'game':'games'} · {p.currency}</p></div><strong className={p.net>=0?'positive':'negative'}>{money(p.net,p.currency,true)}</strong></div>)}</section>:<div className="empty-view"><Users size={42} weight="duotone"/><h2>No player results yet.</h2><p>Finish a game to start tracking everyone’s results.</p><button className="button secondary" onClick={()=>navigate('home')}>Back to home<ArrowRight size={17}/></button></div>}</>}
  </main>{tab!=='home'&&<footer className="app-footer"><span><Spade weight="fill" size={14}/> For the love of the home game.</span><span><span className="save-dot"/>{demo?'Sample data · changes stay in this preview':storageError?'Changes need a backup':offlineReady?'Saved on this device · offline ready':'Saved on this device'}</span></footer>}</div>
  {toast&&<div className="toast" role="status"><CheckCircle weight="fill" size={20}/>{toast}</div>}
  {modal&&<Dialog side={modal.type==='menu'} playerSheet={modal.type==='player'} setup={modal.type==='new'||modal.type==='templates'||modal.type==='correct'} title={modal.type==='delete'?'Delete game?':modal.type==='menu'?'Menu':modal.type==='correct'?'Correct cash-outs':modal.type==='new'?'New game':modal.type==='templates'?'Saved templates':modal.type==='add'?'Add player':modal.type==='player'?player?.name??'Player':modal.type==='blinds'?'Blind settings':modal.type==='end'?'End game?':modal.type==='share'?'Share game':modal.type==='install'?'Install Good Hand':'Settings'} subtitle={modal.type==='add'?'Enter their name and starting buy-in.':modal.type==='player'?(modal.intent==='rebuy'?(pending?'Record a missing buy-in.':'Record a rebuy.'):modal.intent==='cashout'?'Record the value of their remaining chips.':'Review or correct their cash-out.'):undefined} onClose={()=>setModal(null)}>
    {error&&<p className="form-error" role="alert" tabIndex={-1}>{error}</p>}
    {modal.type==='menu'&&<nav className="side-menu-links" aria-label="More navigation">
      <button className={tab==='history'?'selected':''} aria-current={tab==='history'?'page':undefined} onClick={()=>{setModal(null);navigate('history');}}><Notebook size={22}/><span>History</span><CaretRight size={17}/></button>
      <button onClick={()=>open({type:'templates'})}><BookmarkSimple size={22}/><span>Saved templates</span><CaretRight size={17}/></button>
      <button onClick={()=>open({type:'settings'})}><GearSix size={22}/><span>Settings & backups</span><CaretRight size={17}/></button>
    </nav>}

    {(modal.type==='new'||modal.type==='templates')&&<GameSetup templates={data.templates??[]} mode={modal.type==='templates'?'templates':'game'} onStart={startGame} onSave={(settings,name,id)=>{commit({...data,templates:saveTemplate(data.templates??[],settings,name,id)});setToast('Template saved.');}} onDelete={id=>{commit({...data,templates:(data.templates??[]).filter(t=>t.id!==id)});setToast('Template removed.');}}/>}
    {modal.type==='add'&&game&&<form onSubmit={e=>submit(e,f=>{const name=String(f.get('name')).trim();if(!name)throw Error('Enter a player name.');if(game.players.some(p=>p.name.toLowerCase()===name.toLowerCase()))throw Error('That name is already at the table. Add a surname or nickname.');const amount=cents(String(f.get('amount')));if(!amount)throw Error('The buy-in must be greater than zero.');transaction([...game.players,{id:uid(),name,buyins:[amount],cashout:null}],`${name} joined with ${m(amount)}.`);setToast(`${name} is at the table.`);})}><Field label="Player name"><input name="name" maxLength={32} placeholder="e.g. Alex" required autoFocus list="regular-names"/><datalist id="regular-names">{[...new Set([...tally.values()].map(x=>x.name))].map(n=><option key={n} value={n}/>)}</datalist></Field><AmountPicker label={`Buy-in (${game.currency})`} name="amount" value={game.buyin/100} currency={game.currency} min={0.01} rangeMax={Math.max(game.buyin*5/100,100)}/><button className="button primary full" type="submit"><Plus size={17}/>Add player</button></form>}
    {modal.type==='player'&&player&&game&&<>{player.cashout===null&&<div className="amount-mode"><button className={modal.intent==='rebuy'?'selected':''} onClick={()=>open({type:'player',id:player.id,intent:'rebuy'})}>{pending?'Missing buy-in':'Buy-in / rebuy'}</button><button className={modal.intent==='cashout'?'selected':''} onClick={()=>open({type:'player',id:player.id,intent:'cashout'})}>Cash out</button></div>}<div className="player-summary"><div><span>Total buy-ins</span><strong>{m(totalIn(player))}</strong></div><div><span>Buy-in count</span><strong>{player.buyins.length}</strong></div></div>{player.cashout===null&&modal.intent!=='cashout'&&<form onSubmit={e=>submit(e,f=>{const amount=cents(String(f.get('amount')));if(!amount)throw Error('Enter a rebuy greater than zero.');transaction(game.players.map(p=>p.id===player.id?{...p,buyins:[...p.buyins,amount]}:p),`${player.name} added a ${m(amount)} rebuy.`);setToast(pending?'Missing buy-in recorded.':'Rebuy recorded.');})}><AmountPicker key={`rebuy-${player.id}`} label={`${pending?'Missing buy-in':'Rebuy amount'} (${game.currency})`} name="amount" value={game.buyin/100} currency={game.currency} min={0.01} rangeMax={Math.max(game.buyin*5/100,100)}/><button className="button primary full" type="submit"><Plus size={17}/>{pending?'Add missing buy-in':'Add rebuy'}</button></form>}{modal.intent!=='rebuy'&&<form className={`cashout-form ${modal.intent==='cashout'?'only-form':''}`} onSubmit={e=>submit(e,f=>{const amount=cents(String(f.get('cashout')));const available=gameIn(game)-gameOut(game)+(player.cashout??0);if(amount>available)throw Error(`Only ${m(available)} in chips remain unaccounted for. Check the cash-outs or missing buy-ins.`);transaction(game.players.map(p=>p.id===player.id?{...p,cashout:amount}:p),`${player.name} ${player.cashout===null?'cashed out for':'updated their cash-out to'} ${m(amount)}.`);setToast('Cash-out recorded.');})}><AmountPicker key={`cashout-${player.id}`} label={`Final chip value (${game.currency})`} name="cashout" value={(player.cashout??0)/100} currency={game.currency} rangeMax={Math.max((gameIn(game)-gameOut(game)+(player.cashout??0))/100,1)}/><p className="field-hint">Count all remaining chips. Enter 0 if they’re out. {game.settlementMode==='tab'?'Payments are calculated once all cash-outs are recorded.':'This records chips only; mark bank payments after ending the game.'}</p><button className="button secondary full" type="submit">{player.cashout===null?'Cash out player':'Update cash-out'}<ArrowUpRight size={17}/></button></form>}{player.cashout!==null&&<button className="text-button return-button" onClick={()=>{transaction(game.players.map(p=>p.id===player.id?{...p,cashout:null}:p),`${player.name}’s cash-out was removed.`);setModal(null);}}><ArrowCounterClockwise size={16}/>{pending?'Remove cash-out':'Return to table and remove cash-out'}</button>}</>}
    {modal.type==='correct'&&game&&<CashoutCorrections game={game} onSubmit={e=>submit(e,f=>{update(correctCashouts(game,game.players.map(p=>cents(String(f.get(`cashout-${p.id}`))))));setToast('Cash-outs updated. Payments recalculated.');})}/>}
    {modal.type==='blinds'&&game&&<form onSubmit={e=>submit(e,f=>{const small=cents(String(f.get('small'))),big=cents(String(f.get('big')));if(!small||big<small)throw Error('Use positive blinds with the big blind at least the small blind.');update({...game,smallBlind:small,bigBlind:big,clock:{...game.clock,level:0,enabled:false,running:false,endsAt:null}});setToast('Fixed blinds updated.');})}><div className="form-grid"><NumberField label="Small blind" name="small" value={blindsFor(game).small/100} min="0.01"/><NumberField label="Big blind" name="big" value={blindsFor(game).big/100} min="0.01"/></div><p className="field-hint">These stakes stay fixed throughout the game.</p><button className="button primary full" type="submit">Save blinds<Check size={17}/></button></form>}
    {modal.type==='delete'&&<>{gameToDelete?<><div className="delete-game-summary"><h3>{gameToDelete.name}</h3><p>{date(gameToDelete.createdAt)} · {gameToDelete.players.length} players · {money(gameIn(gameToDelete),gameToDelete.currency)} in</p></div><p className="dialog-copy">{gameToDelete.endedAt===null?'This game is still in progress. ':needsSettling(gameToDelete)?'This game still needs settling. ':''}Deleting it removes all its buy-ins, cash-outs and player results from this device. This can’t be undone.</p><button className="button secondary full" onClick={()=>setModal(null)}>Keep game</button><button className="button primary full mt" onClick={confirmDeleteGame}><Trash size={17}/>Delete game</button></>:<p className="dialog-copy">This game has already been deleted.</p>}</>}
    {modal.type==='share'&&game&&<ShareDialog game={game} ready={firebaseReady} onStart={()=>{update({...game,share:newShareCredentials()});setToast('Game is live. Share the link with friends.');}} onPause={()=>{const s=game.share;if(s){update({...game,share:{...s,paused:true}});closeSharedGame(s.id,s.key,game).catch(()=>{});setToast('Sharing paused. Friends keep the last update on the same link.');}}} onResume={()=>{const s=game.share;if(s){resumeSharedGame(s.id);update({...game,share:{id:s.id,key:s.key}});setToast('Sharing resumed on the same link.');}}} onEnd={()=>{const s=game.share;if(s){update({...game,share:undefined});closeSharedGame(s.id,s.key,game).catch(()=>{});setToast('Sharing ended. A new link is needed to share again.');}}} onToast={setToast}/>}
    {modal.type==='end'&&game&&<><p className="dialog-copy">End the game and return home. All buy-ins and cash-outs stay saved, ready to finish whenever you like.</p>{!canEnd(game)&&<p className="end-note">{activePlayers.length?`${activePlayers.length} cash-outs still to record.`:'Payments can be calculated after the chip totals balance.'}</p>}<button className="button primary full" onClick={endNow}>End now<Check size={17}/></button><button className="button quiet full mt" onClick={()=>setModal(null)}>Keep playing</button></>}
    {modal.type==='install'&&<><div className="install-art"><Spade weight="fill" size={42}/></div><p className="dialog-copy">Keep Good Hand on your home screen. Once loaded, the app works offline and keeps your games on this device.</p>{installEvent?<button className="button primary full" onClick={async()=>{await installEvent.prompt();const c=await installEvent.userChoice;if(c.outcome==='accepted'){setInstallEvent(null);setModal(null);setToast('Good Hand is ready for your home screen.');}}}><DownloadSimple size={18}/>Install Good Hand</button>:<div className="install-instructions"><h3>On iPhone or iPad</h3><p>Open this page in Safari, tap Share, then Add to Home Screen.</p><h3>On Android or desktop</h3><p>Open your browser menu and choose Install app or Add to Home screen. If it’s already installed, open it from your home screen.</p></div>}<p className="field-hint">Use the same browser to see your saved games. Installing doesn’t sync your data to other devices.</p></>}
    {modal.type==='settings'&&<><div className="settings-section"><button className="button secondary full" onClick={()=>open({type:'install'})}><DeviceMobile size={18}/>Install Good Hand</button></div><div className="settings-section"><h3>Game templates</h3><p>Your usual stakes, ready for the next game.</p><button className="button secondary full" onClick={()=>open({type:'templates'})}>Saved templates <span>({(data.templates??[]).length})</span><ArrowRight size={16}/></button></div><div className="settings-section"><h3>Games & templates</h3><p>They’re stored in this browser, on this device. Back up before clearing browser data or switching devices.</p><div className="form-grid"><button className="button secondary" onClick={backup}><DownloadSimple size={18}/>Export backup</button><button className="button secondary" onClick={()=>fileInput.current?.click()}><UploadSimple size={18}/>Restore backup</button></div><input ref={fileInput} type="file" accept=".json,application/json" hidden onChange={async e=>{try{const file=e.target.files?.[0];if(!file)return;if(file.size>5_000_000)throw Error('Choose a backup under 5 MB.');const next:unknown=JSON.parse(await file.text());if(!validateStore(next))throw Error('This is not a valid Good Hand backup.');const result=mergeBackup(data,next);localStorage.setItem(STORAGE_KEY,JSON.stringify(result.data));setData(result.data);setStorageError(null);setToast(`${result.gamesAdded} games and ${result.templatesAdded} templates restored.`);setError('');}catch(err){setError(err instanceof Error?err.message:'Could not restore backup.');}finally{e.target.value='';}}}/></div><div className="settings-section"><h3>Sample game</h3><p>Explore a sample game. Your own games stay untouched.</p><button className="button secondary" onClick={()=>{startDemo();setModal(null);}}>Open sample game <ArrowUpRight size={17}/></button></div><div className="settings-section help-copy"><h3>How settlements work</h3><p>Good Hand tracks cash games. For games on a tab, settlements use each player’s net result. For buy-ins paid up front, pay each cash-out from the bank. No rake or fees are deducted.</p></div></>}
  </Dialog>}</>;
}
function historyReplace(){if(location.search)window.history.replaceState(null,'',location.pathname);}
export default App;
