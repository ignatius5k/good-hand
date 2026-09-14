export type Currency = 'SGD' | 'USD' | 'EUR' | 'GBP' | 'AUD';
export interface Player { id: string; name: string; buyins: number[]; cashout: number | null }
export interface GameEvent { id: string; text: string; at: number }
export interface Clock { level: number; minutes: number; running: boolean; remaining: number; endsAt: number | null; enabled: boolean }
export interface Game { id: string; name: string; createdAt: number; endedAt: number | null; currency: Currency; buyin: number; smallBlind: number; bigBlind: number; settlementMode: 'tab' | 'cash'; players: Player[]; clock: Clock; events: GameEvent[]; paid: string[]; undo: {players: Player[]; events: GameEvent[]}[] }
export type GameSettings = Pick<Game,'name'|'currency'|'buyin'|'smallBlind'|'bigBlind'|'settlementMode'>;
export interface GameTemplate extends Omit<GameSettings,'name'> { id:string; name:string; gameName:string }
export interface Store { version: 1; games: Game[]; activeId: string | null; templates?:GameTemplate[] }
export interface Transfer { id: string; from: string; to: string; amount: number }
export const uid = () => crypto.randomUUID();
export const totalIn = (p: Player) => p.buyins.reduce((a,b)=>a+b,0);
export const gameIn = (g: Game) => g.players.reduce((s,p)=>s+totalIn(p),0);
export const gameOut = (g: Game) => g.players.reduce((s,p)=>s+(p.cashout??0),0);
export const net = (p: Player) => p.cashout === null ? null : p.cashout-totalIn(p);
export function cents(value: string): number {
  if (!/^\d+(\.\d{1,2})?$/.test(value.trim())) throw new Error('Enter an amount with up to two decimal places.');
  const [whole,decimal='']=value.trim().split('.');
  const result=Number(whole)*100+Number(decimal.padEnd(2,'0'));
  if(!Number.isSafeInteger(result)||result>100_000_000) throw new Error('Enter an amount no greater than 1,000,000.');
  return result;
}
export const money = (v: number, currency: Currency='SGD', signed=false) => new Intl.NumberFormat('en-SG',{style:'currency',currency,currencyDisplay:'narrowSymbol',minimumFractionDigits:v%100===0?0:2,maximumFractionDigits:2,signDisplay:signed?'exceptZero':'auto'}).format(v/100);
export function canEnd(g: Game) { return g.players.length>=2 && g.players.every(p=>p.cashout!==null) && gameIn(g)===gameOut(g); }
export function correctCashouts(g:Game,amounts:number[]):Game {
  if(!g.endedAt||!canEnd(g))throw Error('Finish recording the game before correcting its results.');
  if(amounts.length!==g.players.length||!amounts.every(validAmount))throw Error('Enter a valid cash-out for every player.');
  if(amounts.reduce((a,b)=>a+b,0)!==gameIn(g))throw Error(`Cash-outs must add up to ${money(gameIn(g),g.currency)}.`);
  if(amounts.every((n,i)=>n===g.players[i].cashout))return g;
  return {...g,players:g.players.map((p,i)=>({...p,cashout:amounts[i]})),paid:[],undo:[],events:[{id:uid(),at:Date.now(),text:'Final cash-outs corrected. Payment checkmarks reset.'},...g.events]};
}
export function transfers(g: Game): Transfer[] {
  if(!canEnd(g)) return [];
  if(g.settlementMode==='cash') return g.players.filter(p=>p.cashout!>0).map(p=>({id:`bank-${p.id}`,from:'Game bank',to:p.name,amount:p.cashout!}));
  const debts=g.players.filter(p=>net(p)!<0).map(p=>({id:p.id,name:p.name,amount:-net(p)!}));
  const credits=g.players.filter(p=>net(p)!>0).map(p=>({id:p.id,name:p.name,amount:net(p)!}));
  debts.sort((a,b)=>b.amount-a.amount);credits.sort((a,b)=>b.amount-a.amount);
  const result: Transfer[]=[];let i=0,j=0;
  while(i<debts.length&&j<credits.length){const d=debts[i],c=credits[j],amount=Math.min(d.amount,c.amount);result.push({id:`${d.id}-${c.id}`,from:d.name,to:c.name,amount});d.amount-=amount;c.amount-=amount;if(!d.amount)i++;if(!c.amount)j++;}
  return result;
}
export function paymentMessage(g:Game):string|null {
  if(g.endedAt===null||!canEnd(g))return null;
  const all=transfers(g),unpaid=all.filter(t=>!g.paid.includes(t.id));
  const lines=unpaid.length?unpaid.map(t=>`${t.from} pay ${t.to}: ${money(t.amount,g.currency)}`).join('\n'):all.length?'Everyone is settled up. No payments outstanding.':'Everyone broke even. No payments needed.';
  return `${g.name} (${g.currency})\n\n${lines}`;
}
export const MULTIPLIERS=[1,2,3,4,6,8,12,16];
// Preserve the last recorded stakes of older timed games without advancing them.
export const blindsFor = (game:Game) => ({small:game.smallBlind*MULTIPLIERS[game.clock.level],big:game.bigBlind*MULTIPLIERS[game.clock.level]});
export function freshGame(input: GameSettings): Game {
  assertSettings(input);
  return {...input,id:uid(),createdAt:Date.now(),endedAt:null,players:[],paid:[],undo:[],clock:{level:0,minutes:20,enabled:false,running:false,remaining:1200,endsAt:null},events:[{id:uid(),at:Date.now(),text:'The table is open. Good luck, everyone.'}]};
}
export function demoGame(): Game {
  const g=freshGame({name:'Friday night poker',currency:'SGD',buyin:5000,smallBlind:50,bigBlind:100,settlementMode:'tab'});
  g.createdAt=Date.now()-72*60_000;
  g.players=[['Alex',[5000,5000],null],['Jamie',[5000],null],['Marcus',[5000,5000],null],['Sarah',[5000],null],['Daniel',[5000],8500],['Rachel',[5000],3500]].map(([name,buyins,cashout])=>({id:uid(),name:name as string,buyins:buyins as number[],cashout:cashout as number|null}));
  g.events=[{id:uid(),text:'Rachel cashed out for $35.',at:Date.now()-3*60_000},{id:uid(),text:'Daniel cashed out for $85.',at:Date.now()-8*60_000},{id:uid(),text:'Marcus added a $50 rebuy.',at:Date.now()-12*60_000},{id:uid(),text:'Alex added a $50 rebuy.',at:Date.now()-25*60_000}];
  return g;
}
const validAmount=(v:unknown): v is number=>Number.isSafeInteger(v)&&Number(v)>=0&&Number(v)<=100_000_000;
export function validateStore(input: unknown): input is Store {
  if(!input||typeof input!=='object')return false;
  const s=input as Store;
  if(s.version!==1 || !Array.isArray(s.games) || s.games.length>500 || !(s.activeId===null||typeof s.activeId==='string'))return false;
  if(s.templates!==undefined&&(!Array.isArray(s.templates)||s.templates.length>50||!s.templates.every(validTemplate)||new Set(s.templates.map(t=>t.id)).size!==s.templates.length||new Set(s.templates.map(t=>t.name.toLowerCase())).size!==s.templates.length))return false;
  const ids=new Set<string>();
  for(const g of s.games){
    if(!g||typeof g.id!=='string'||ids.has(g.id)||typeof g.name!=='string'||!g.name.trim()||g.name.length>80||!['SGD','USD','EUR','GBP','AUD'].includes(g.currency)||!validAmount(g.buyin)||g.buyin===0||!validAmount(g.smallBlind)||!validAmount(g.bigBlind)||g.smallBlind===0||g.bigBlind<g.smallBlind||!['tab','cash'].includes(g.settlementMode)||!Number.isFinite(g.createdAt)||!(g.endedAt===null||Number.isFinite(g.endedAt)))return false;
    ids.add(g.id);
    if(!Array.isArray(g.players)||g.players.length>30||!Array.isArray(g.events)||!g.events.every(e=>e&&typeof e.id==='string'&&typeof e.text==='string'&&Number.isFinite(e.at))||!Array.isArray(g.paid)||!g.paid.every(x=>typeof x==='string')||!Array.isArray(g.undo))return false;
    const playerIds=new Set<string>();const names=new Set<string>();
    for(const p of g.players){if(!p||typeof p.id!=='string'||playerIds.has(p.id)||typeof p.name!=='string'||!p.name.trim()||p.name.length>32||names.has(p.name.toLowerCase())||!Array.isArray(p.buyins)||!p.buyins.length||!p.buyins.every(x=>validAmount(x)&&x>0)||!(p.cashout===null||validAmount(p.cashout)))return false;playerIds.add(p.id);names.add(p.name.toLowerCase());}
    const c=g.clock;
    if(!c||!Number.isInteger(c.level)||c.level<0||c.level>=MULTIPLIERS.length||!Number.isInteger(c.minutes)||c.minutes<1||c.minutes>180||typeof c.enabled!=='boolean'||typeof c.running!=='boolean'||!Number.isFinite(c.remaining)||c.remaining<0||c.remaining>c.minutes*60||!(c.endsAt===null||Number.isFinite(c.endsAt))||c.running&&c.endsAt===null)return false;
  }
  return (s.activeId===null||s.games.some(g=>g.id===s.activeId)) && s.games.filter(g=>g.endedAt===null).length<=1;
}
export const STORAGE_KEY='good-hand-v1';
export function loadStore(): {data:Store;error:string|null} {
  try {const raw=localStorage.getItem(STORAGE_KEY);if(!raw)return {data:{version:1,games:[],activeId:null,templates:[]},error:null};const data=JSON.parse(raw);if(!validateStore(data))throw Error();return {data:normalizeStore(data),error:null};}
  catch{return {data:{version:1,games:[],activeId:null,templates:[]},error:'Your saved data could not be read. Export the stored data from Settings before starting a new game.'};}
}

export function assertSettings(s:GameSettings):void {
  if(typeof s.name!=='string'||!s.name.trim()||s.name.length>80)throw Error('Give your game a name of up to 80 characters.');
  if(!['SGD','USD','EUR','GBP','AUD'].includes(s.currency))throw Error('Choose a supported currency.');
  if(!validAmount(s.buyin)||s.buyin===0)throw Error('Enter a buy-in greater than zero.');
  if(!validAmount(s.smallBlind)||!validAmount(s.bigBlind)||s.smallBlind===0||s.bigBlind<s.smallBlind)throw Error('Use positive blinds. The big blind must be at least the small blind.');
  if(!['tab','cash'].includes(s.settlementMode))throw Error('Choose how to settle payments.');
}
export function validTemplate(value:unknown): value is GameTemplate {
  if(!value||typeof value!=='object')return false;
  const t=value as GameTemplate;
  if(typeof t.id!=='string'||!t.id||typeof t.name!=='string'||!t.name.trim()||t.name!==t.name.trim()||t.name.length>40)return false;
  try{assertSettings({...t,name:t.gameName});return true;}catch{return false;}
}
export const settingsFromTemplate=(t:GameTemplate):GameSettings=>({name:t.gameName,currency:t.currency,buyin:t.buyin,smallBlind:t.smallBlind,bigBlind:t.bigBlind,settlementMode:t.settlementMode});
export function saveTemplate(templates:GameTemplate[],settings:GameSettings,name:string,id?:string):GameTemplate[] {
  assertSettings(settings);name=name.trim();
  if(!name||name.length>40)throw Error('Give your template a name of up to 40 characters.');
  if(id&&!templates.some(t=>t.id===id))throw Error('This template no longer exists. Save it as a new template.');
  if(templates.some(t=>t.id!==id&&t.name.toLowerCase()===name.toLowerCase()))throw Error('A template with that name already exists. Choose another name.');
  if(!id&&templates.length>=50)throw Error('You can save up to 50 templates. Remove one before adding another.');
  const t:GameTemplate={id:id??uid(),name,gameName:settings.name.trim(),currency:settings.currency,buyin:settings.buyin,smallBlind:settings.smallBlind,bigBlind:settings.bigBlind,settlementMode:settings.settlementMode};
  return id?templates.map(old=>old.id===id?t:old):[...templates,t];
}
export function normalizeStore(s:Store):Store {
  return {...s,templates:s.templates??[],games:s.games.map(g=>({...g,undo:[],clock:{...g.clock,enabled:false,running:false,endsAt:null}}))};
}
export function mergeBackup(current:Store,incoming:Store):{data:Store;gamesAdded:number;templatesAdded:number} {
  if(!validateStore(incoming))throw Error('This is not a valid Good Hand backup.');
  const normalized=normalizeStore(incoming),existingIds=new Set(current.games.map(g=>g.id));
  const added=normalized.games.filter(g=>!existingIds.has(g.id));
  if(current.games.some(g=>!g.endedAt)&&added.some(g=>!g.endedAt))throw Error('Finish your current game before importing another open game.');
  const templates=[...(current.templates??[])],ids=new Set(templates.map(t=>t.id));let templatesAdded=0;
  for(const source of normalized.templates??[]){
    if(ids.has(source.id))continue;
    let name=source.name,n=2;
    while(templates.some(t=>t.name.toLowerCase()===name.toLowerCase())){const suffix=` (${n++})`;name=source.name.slice(0,40-suffix.length)+suffix;}
    templates.push({...source,name});ids.add(source.id);templatesAdded++;
  }
  const data={...current,games:[...current.games,...added],templates,activeId:current.activeId??incoming.activeId};
  if(!validateStore(data))throw Error('This backup exceeds the saved game or template limit.');
  return {data,gamesAdded:added.length,templatesAdded};
}
