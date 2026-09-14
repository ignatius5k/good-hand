export type Currency = 'SGD' | 'USD' | 'EUR' | 'GBP' | 'AUD';
export interface Player { id: string; name: string; buyins: number[]; cashout: number | null }
export interface GameEvent { id: string; text: string; at: number }
export interface Clock { level: number; minutes: number; running: boolean; remaining: number; endsAt: number | null; enabled: boolean }
export interface Game { id: string; name: string; createdAt: number; endedAt: number | null; currency: Currency; buyin: number; smallBlind: number; bigBlind: number; settlementMode: 'tab' | 'cash'; players: Player[]; clock: Clock; events: GameEvent[]; paid: string[]; undo: {players: Player[]; events: GameEvent[]}[] }
export interface Store { version: 1; games: Game[]; activeId: string | null }
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
export const MULTIPLIERS=[1,2,3,4,6,8,12,16];
export function clockAt(clock: Clock, now: number): Clock {
  if(!clock.enabled || !clock.running || clock.endsAt===null) return clock;
  let endsAt=clock.endsAt,level=clock.level;
  while(now>=endsAt && level<MULTIPLIERS.length-1){level++;endsAt+=clock.minutes*60_000;}
  if(now>=endsAt) return {...clock,level,remaining:0,running:false,endsAt:null};
  return {...clock,level,endsAt,remaining:Math.ceil((endsAt-now)/1000)};
}
export function freshGame(input: Pick<Game,'name'|'currency'|'buyin'|'smallBlind'|'bigBlind'|'settlementMode'> & {minutes:number;timed:boolean}): Game {
  return {...input,id:uid(),createdAt:Date.now(),endedAt:null,players:[],paid:[],undo:[],clock:{level:0,minutes:input.minutes,enabled:input.timed,running:false,remaining:input.minutes*60,endsAt:null},events:[{id:uid(),at:Date.now(),text:'The table is open. Good luck, everyone.'}]};
}
export function demoGame(): Game {
  const g=freshGame({name:'Friday night poker',currency:'SGD',buyin:5000,smallBlind:50,bigBlind:100,settlementMode:'tab',minutes:20,timed:true});
  g.createdAt=Date.now()-72*60_000;
  g.players=[['Alex',[5000,5000],null],['Jamie',[5000],null],['Marcus',[5000,5000],null],['Sarah',[5000],null],['Daniel',[5000],8500],['Rachel',[5000],3500]].map(([name,buyins,cashout])=>({id:uid(),name:name as string,buyins:buyins as number[],cashout:cashout as number|null}));
  g.clock={...g.clock,level:1,remaining:14*60+32};
  g.events=[{id:uid(),text:'Rachel cashed out for $35.',at:Date.now()-3*60_000},{id:uid(),text:'Daniel cashed out for $85.',at:Date.now()-8*60_000},{id:uid(),text:'Marcus added a $50 rebuy.',at:Date.now()-12*60_000},{id:uid(),text:'Alex added a $50 rebuy.',at:Date.now()-25*60_000}];
  return g;
}
const validAmount=(v:unknown): v is number=>Number.isSafeInteger(v)&&Number(v)>=0&&Number(v)<=100_000_000;
export function validateStore(input: unknown): input is Store {
  if(!input||typeof input!=='object')return false;
  const s=input as Store;
  if(s.version!==1 || !Array.isArray(s.games) || s.games.length>500 || !(s.activeId===null||typeof s.activeId==='string'))return false;
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
  try {const raw=localStorage.getItem(STORAGE_KEY);if(!raw)return {data:{version:1,games:[],activeId:null},error:null};const data=JSON.parse(raw);if(!validateStore(data))throw Error();return {data:{...data,games:data.games.map(g=>({...g,undo:[]}))},error:null};}
  catch{return {data:{version:1,games:[],activeId:null},error:'Your saved data could not be read. Export the stored data from Settings before starting a new game.'};}
}
