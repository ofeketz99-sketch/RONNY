'use strict';
// Patch 130: drag-and-drop in the schedule moves a card to a position instead of swapping two cards.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const commands=vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../scripts/src/00g-trip-state-commands.js'),'utf8')+'\nTripStateCommands');
const p=(id,type,extra={})=>({id,type,...extra});
const ids=list=>Array.from(list,x=>x.id);
const plain=()=>[p('s','start'),p('a','via'),p('b','via'),p('c','via'),p('e','end')];
const walkDay=()=>[p('s','start'),p('park','parking'),p('ws','walkStart'),p('wt','walkTurn'),p('wv','via'),p('we','walkEnd',{walkLoopSource:'ws'}),p('via','via'),p('e','end')];

test('moving down inserts before the target and shifts the others up',()=>{
 assert.deepEqual(ids(commands.planRouteMove(plain(),'a','c').ordered),['s','b','a','c','e']);
});
test('moving up inserts before the target',()=>{
 assert.deepEqual(ids(commands.planRouteMove(plain(),'c','a').ordered),['s','c','a','b','e']);
});
test('null target moves to the end',()=>{
 assert.deepEqual(ids(commands.planRouteMove(plain(),'a',null).ordered),['s','b','c','e','a']);
});
test('dropping in the same place is a no-op',()=>{
 assert.equal(commands.planRouteMove(plain(),'a','a'),null);
 assert.equal(commands.planRouteMove(plain(),'a','b'),null);
 assert.equal(commands.planRouteMove(plain(),'e',null),null);
});
test('a walk moves as one block',()=>{
 const plan=commands.planRouteMove(walkDay(),'ws','e');
 assert.deepEqual(ids(plan.ordered),['s','park','via','ws','wt','wv','we','e']);
 assert.deepEqual(plan.moved,['ws','wt','wv','we']);
});
test('a stop cannot be dropped inside a walk from outside',()=>{
 assert.ok(commands.planRouteMove(walkDay(),'via','wt').error);
});
test('a point inside a walk moves only inside its walk',()=>{
 assert.deepEqual(ids(commands.planRouteMove(walkDay(),'wv','wt').ordered),['s','park','ws','wv','wt','we','via','e']);
 assert.deepEqual(ids(commands.planRouteMove(walkDay(),'wt','we').ordered),['s','park','ws','wv','wt','we','via','e']);
 assert.ok(commands.planRouteMove(walkDay(),'wt','via').error);
 assert.ok(commands.planRouteMove(walkDay(),'wt','ws').error);
 assert.ok(commands.planRouteMove(walkDay(),'we','wt').error);
});
test('a walk cannot go before the day start',()=>{
 assert.ok(commands.planRouteMove(walkDay(),'ws','s').error);
});
test('a circular day keeps its derived finish last',()=>{
 const day=[p('s','start'),p('v','via'),p('w','via'),p('auto','end',{autoLoopEnd:true})];
 assert.deepEqual(ids(commands.planRouteMove(day,'v',null).ordered),['s','w','v','auto']);
 assert.ok(commands.planRouteMove(day,'auto','v').error);
});

// Placement by a manually typed time.
const m=t=>{const [h,mi]=t.split(':').map(Number);return h*60+mi};
const timed=()=>[p('s','start',{time:'09:00'}),p('a','via',{time:'10:00',duration:60}),p('b','via',{time:'12:00',duration:30}),p('e','end',{time:'15:00'}),p('n','via',{time:'15:30',duration:30})];
const deps={minuteOf:x=>x.time?m(x.time):null,dwellOf:x=>Number(x.duration)||0,isFixed:x=>!!x.timeLock};
test('a timed point goes between the activities around its time',()=>{
 const plan=commands.planTimedPlacement(timed(),'n',m('11:15'),deps);
 assert.equal(plan.beforeId,'b');assert.equal(plan.prev.id,'a');assert.equal(plan.moves,true);
 assert.equal(plan.overlapPrev,false);assert.equal(plan.overlapNext,false);
});
test('arriving while the previous activity is still going is a conflict',()=>{
 const plan=commands.planTimedPlacement(timed(),'n',m('10:30'),deps);
 assert.equal(plan.prev.id,'a');assert.equal(plan.overlapPrev,true);assert.equal(plan.prevDeparture,m('11:00'));
});
test('a stay that runs into a LOCKED next activity is a conflict',()=>{
 const day=timed();day[2].timeLock='12:00';
 const plan=commands.planTimedPlacement(day,'n',m('11:45'),deps);
 assert.equal(plan.next.id,'b');assert.equal(plan.overlapNext,true);
});
test('a next activity that is not locked just moves later (no conflict)',()=>{
 const plan=commands.planTimedPlacement(timed(),'n',m('11:45'),deps);
 assert.equal(plan.next.id,'b');assert.equal(plan.overlapNext,false);
 const late=commands.planTimedPlacement(timed(),'n',m('16:00'),deps);
 assert.equal(late.beforeId,'e');assert.equal(late.overlapNext,false);
});
test('a late time stays before the day finish',()=>{
 const plan=commands.planTimedPlacement(timed(),'n',m('18:00'),deps);
 assert.equal(plan.beforeId,'e');
});
test('an early time never goes before the day start',()=>{
 const plan=commands.planTimedPlacement(timed(),'n',m('07:00'),deps);
 assert.equal(plan.prev.id,'s');assert.equal(plan.beforeId,'a');assert.equal(plan.overlapPrev,true);
});
test('same position is reported as no move',()=>{
 const plan=commands.planTimedPlacement(timed(),'a',m('10:10'),deps);
 assert.equal(plan.moves,false);
});
test('walk points are not placed by time',()=>{
 assert.equal(commands.planTimedPlacement(walkDay(),'wt',m('10:00'),deps),null);
});
