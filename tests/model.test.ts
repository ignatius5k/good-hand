import test from 'node:test';
import assert from 'node:assert/strict';
import { cents,canEnd,correctCashouts,transfers,paymentMessage,needsSettling,freshGame,blindsFor,normalizeStore,saveTemplate,settingsFromTemplate,mergeBackup,loadStore,STORAGE_KEY,validateStore,net,type Game } from '../src/model.ts';
function game():Game {const g=freshGame({name:'Test night',currency:'SGD',buyin:5000,smallBlind:50,bigBlind:100,settlementMode:'tab'});g.players=[{id:'a',name:'Alex',buyins:[5000,5000],cashout:4000},{id:'b',name:'Jamie',buyins:[5000],cashout:11000}];return g;}
test('parses decimal money into exact integer cents',()=>{assert.equal(cents('0.29'),29);assert.equal(cents('123.4'),12340);assert.equal(cents('0'),0);for(const v of ['-1','1e3','NaN','0.001','1,000','1000001',''])assert.throws(()=>cents(v));});
test('allows closing only complete balanced multi-player games',()=>{const g=game();assert.ok(canEnd(g));g.players[0].cashout=null;assert.ok(!canEnd(g));g.players[0].cashout=0;assert.ok(!canEnd(g));g.players=[];assert.ok(!canEnd(g));});
test('net uses every rebuy, not only the first',()=>{assert.equal(net(game().players[0]),-6000);});
test('settles net tabs exactly and never exposes unbalanced payments',()=>{const g=game();assert.deepEqual(transfers(g),[{id:'a-b',from:'Alex',to:'Jamie',amount:6000}]);g.players[0].cashout=3999;assert.deepEqual(transfers(g),[]);});
test('upfront buy-ins settle from game bank using gross cash-outs',()=>{const g=game();g.settlementMode='cash';assert.deepEqual(transfers(g).map(t=>[t.from,t.amount]),[['Game bank',4000],['Game bank',11000]]);});
test('multi-player splits preserve every cent',()=>{const g=game();g.players=[{id:'a',name:'Alex',buyins:[1000],cashout:667},{id:'b',name:'Jamie',buyins:[1000],cashout:500},{id:'c',name:'Chris',buyins:[1000],cashout:1400},{id:'d',name:'Dara',buyins:[1000],cashout:1433}];const ts=transfers(g);for(const p of g.players){const received=ts.filter(t=>t.to===p.name).reduce((n,t)=>n+t.amount,0);const sent=ts.filter(t=>t.from===p.name).reduce((n,t)=>n+t.amount,0);assert.equal(received-sent,net(p));}});
test('backup rejects invalid schema, duplicate identities, bad timers and multiple live games',()=>{const g=game();const s={version:1,games:[g],activeId:g.id};assert.ok(validateStore(s));assert.ok(!validateStore({...s,activeId:'missing'}));assert.ok(!validateStore({...s,games:[g,g]}));assert.ok(!validateStore({...s,games:[{...g,clock:{...g.clock,minutes:500}}]}));assert.ok(!validateStore({...s,games:[{...g,players:[g.players[0],g.players[0]]}]}));assert.ok(validateStore({...s,games:[{...g,endedAt:Date.now(),players:[{...g.players[0],cashout:null},g.players[1]]}]}));});
test('random balanced games settle with exact conservation',()=>{for(let i=0;i<100;i++){const g=game();const players=Array.from({length:2+i%12},(_,j)=>({id:String(j),name:'Player '+j,buyins:[10000],cashout:0}));let pool=players.length*10000;for(let j=0;j<players.length-1;j++){const value=Math.floor(pool*((i*31+j*17)%100)/100);players[j].cashout=value;pool-=value;}players.at(-1)!.cashout=pool;g.players=players;assert.ok(canEnd(g));const ts=transfers(g);for(const p of players){assert.equal(ts.filter(t=>t.to===p.name).reduce((a,t)=>a+t.amount,0)-ts.filter(t=>t.from===p.name).reduce((a,t)=>a+t.amount,0),net(p));}}});

test("stopped games can await cash-outs without producing fake payments",()=>{const g=game();g.endedAt=Date.now();g.players[0].cashout=null;assert.ok(validateStore({version:1,games:[g],activeId:g.id}));assert.deepEqual(transfers(g),[]);assert.ok(!canEnd(g));});

test('new games always use fixed blinds',()=>{const g=game();assert.equal(g.clock.enabled,false);assert.equal(g.clock.running,false);assert.deepEqual(blindsFor(g),{small:50,big:100});});
test('legacy timers stop without changing last recorded stakes or results',()=>{const g=game();g.clock={...g.clock,enabled:true,running:true,level:3,endsAt:Date.now()-999999};const s=normalizeStore({version:1,games:[g],activeId:g.id});assert.equal(s.games[0].clock.running,false);assert.equal(s.games[0].clock.enabled,false);assert.equal(s.games[0].clock.endsAt,null);assert.deepEqual(blindsFor(s.games[0]),{small:200,big:400});assert.deepEqual(s.games[0].players,g.players);assert.deepEqual(s.templates,[]);assert.ok(validateStore(s));});
test('templates save exact stakes and reuse settings without game history',()=>{const g=game();const templates=saveTemplate([],g,' Friday regulars ');assert.equal(templates[0].name,'Friday regulars');const next=freshGame(settingsFromTemplate(templates[0]));assert.equal(next.buyin,g.buyin);assert.equal(next.smallBlind,50);assert.equal(next.currency,'SGD');assert.deepEqual(next.players,[]);assert.equal(next.clock.enabled,false);assert.notEqual(next.id,g.id);});
test('editing a template preserves its ID and existing games',()=>{const g=game();const first=saveTemplate([],g,'Friday');const edited=saveTemplate(first,{...g,currency:'USD',buyin:7500,bigBlind:200},'Weekend',first[0].id);assert.equal(edited.length,1);assert.equal(edited[0].id,first[0].id);assert.equal(edited[0].buyin,7500);assert.equal(edited[0].name,'Weekend');assert.equal(g.buyin,5000);assert.equal(first[0].name,'Friday');});
test('template validation rejects duplicate names, bad stakes and unknown IDs',()=>{const g=game(),first=saveTemplate([],g,'Friday');assert.throws(()=>saveTemplate(first,g,'FRIDAY'));assert.throws(()=>saveTemplate(first,g,'new','missing'));assert.throws(()=>saveTemplate(first,{...g,buyin:0},'new'));assert.throws(()=>saveTemplate(first,{...g,smallBlind:300,bigBlind:100},'new'));assert.throws(()=>saveTemplate(first,g,'   '));assert.ok(!validateStore({version:1,games:[],activeId:null,templates:[{...first[0],buyin:-1}]}));assert.ok(!validateStore({version:1,games:[],activeId:null,templates:[first[0],first[0]]}));});
test('backup merge retains templates and resolves distinct templates with the same name',()=>{const g=game();const first=saveTemplate([],g,'Friday');const second=saveTemplate([],{...g,buyin:2500},'Friday');const current={version:1 as const,games:[],activeId:null,templates:first};const merged=mergeBackup(current,{...current,templates:second});assert.equal(merged.templatesAdded,1);assert.equal(merged.data.templates?.length,2);assert.equal(merged.data.templates?.[1].name,'Friday (2)');assert.equal(merged.data.templates?.[0].buyin,5000);assert.equal(merged.data.templates?.[1].buyin,2500);const again=mergeBackup(merged.data,{...current,templates:second});assert.equal(again.templatesAdded,0);assert.equal(again.data.templates?.length,2);});
test('legacy backups without templates keep the current templates',()=>{const g=game(),templates=saveTemplate([],g,'Friday');const result=mergeBackup({version:1,games:[],activeId:null,templates},{version:1,games:[g],activeId:g.id});assert.equal(result.data.templates?.length,1);assert.equal(result.gamesAdded,1);assert.equal(result.data.activeId,g.id);});
test('saved templates survive the storage loader',()=>{const g=game(),templates=saveTemplate([],g,'Friday');const raw=JSON.stringify({version:1,games:[g],activeId:g.id,templates});const original=Object.getOwnPropertyDescriptor(globalThis,'localStorage');Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(key:string)=>key===STORAGE_KEY?raw:null}});try{const loaded=loadStore();assert.equal(loaded.error,null);assert.deepEqual(loaded.data.templates,templates);}finally{if(original)Object.defineProperty(globalThis,'localStorage',original);else Reflect.deleteProperty(globalThis,'localStorage');}});

test('completed cash-outs can be corrected atomically and recalculate paid settlements',()=>{
  const g=game();g.endedAt=Date.now();g.paid=['a-b'];
  const next=correctCashouts(g,[6000,9000]);
  assert.ok(canEnd(next));assert.deepEqual(next.paid,[]);assert.equal(transfers(next)[0].amount,4000);
  assert.equal(g.players[0].cashout,4000);assert.deepEqual(g.paid,['a-b']);
  assert.equal(correctCashouts(g,[4000,11000]),g);
  for(const amounts of [[6000,8999],[6000],[-1,15001],[0.1,14999.9]])assert.throws(()=>correctCashouts(g,amounts));
  assert.throws(()=>correctCashouts({...g,endedAt:null},[6000,9000]));
});

test('payment messages list only exact outstanding payments and wait for final cash-outs',()=>{
  const g=game();assert.equal(paymentMessage(g),null);g.endedAt=Date.now();
  assert.equal(paymentMessage(g),'Test night (SGD)\n\nAlex pay Jamie: $60');
  g.players[0].cashout=4001;g.players[1].cashout=10999;
  assert.match(paymentMessage(g)!,/Alex pay Jamie: \$59\.99/);
  g.paid=['a-b'];assert.match(paymentMessage(g)!,/No payments outstanding/);assert.ok(!paymentMessage(g)!.includes('Alex pay'));
  g.paid=[];g.settlementMode='cash';assert.match(paymentMessage(g)!,/Game bank pay Alex: \$40\.01\nGame bank pay Jamie: \$109\.99/);
  g.players[0].cashout=null;assert.equal(paymentMessage(g),null);
  g.players[0].cashout=4000;assert.equal(paymentMessage(g),null);
  g.players[0].cashout=10000;g.players[1].cashout=5000;g.settlementMode='tab';assert.match(paymentMessage(g)!,/Everyone broke even/);
});

test('settling queue includes ended pending cash-outs and unpaid games, but not empty or live games',()=>{
  const g=game();assert.equal(needsSettling(g),false);g.endedAt=Date.now();assert.equal(needsSettling(g),true);
  g.paid=['a-b'];assert.equal(needsSettling(g),false);g.players[0].cashout=null;assert.equal(needsSettling(g),true);
  g.players=[];assert.equal(needsSettling(g),false);
});
