import test from 'node:test';
import assert from 'node:assert/strict';
import {biggestWinners,correctCashouts,freshGame,type Game} from '../src/model';

function finishedGame():Game {
  return {...freshGame({name:'Friday night',currency:'SGD',buyin:5000,smallBlind:50,bigBlind:100,settlementMode:'tab'}),endedAt:Date.now(),players:[
    {id:'marcus',name:'Marcus',buyins:[5000,5000],cashout:15000},
    {id:'julian',name:'Julian',buyins:[2000],cashout:9000},
    {id:'morgan',name:'Morgan',buyins:[12000],cashout:0},
  ]};
}
test('biggest winner uses net profit after every buy-in rather than the largest cash-out',()=>{
  const game=finishedGame();
  for(const settlementMode of ['tab','cash'] as const){
    const result=biggestWinners({...game,settlementMode})!;
    assert.deepEqual(result.players.map(p=>p.name),['Julian']);assert.equal(result.amount,7000);
  }
});
test('winner changes with corrected cash-outs and preserves exact tied results',()=>{
  const game=finishedGame();
  const corrected=biggestWinners(correctCashouts(game,[12000,0,12000]))!;
  assert.deepEqual(corrected.players.map(p=>p.name),['Marcus']);assert.equal(corrected.amount,2000);
  const tied=biggestWinners(correctCashouts(game,[15000,7000,2000]))!;
  assert.deepEqual(tied.players.map(p=>p.name),['Marcus','Julian']);assert.equal(tied.amount,5000);
  const even=biggestWinners(correctCashouts(game,[10000,2000,12000]))!;
  assert.equal(even.amount,0);
});
test('live, missing and unbalanced cash-outs never produce a final winner',()=>{
  const game=finishedGame();
  assert.equal(biggestWinners({...game,endedAt:null}),null);
  assert.equal(biggestWinners({...game,players:[]}),null);
  assert.equal(biggestWinners({...game,players:game.players.map((p,i)=>i===0?{...p,cashout:null}:p)}),null);
  assert.equal(biggestWinners({...game,players:game.players.map((p,i)=>i===0?{...p,cashout:14999}:p)}),null);
});
