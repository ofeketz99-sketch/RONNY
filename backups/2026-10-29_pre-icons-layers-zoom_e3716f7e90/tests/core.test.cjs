'use strict';
const {test}=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const src=['00a-core-time','00b-core-geo','00c-core-leg-timing','00d-core-format'].map(n=>fs.readFileSync(path.join(__dirname,'../scripts/src',n+'.js'),'utf8')).join('\n');
const {CoreTime:t,CoreGeo:g,CoreLegTiming:l,CoreFormat:f}=vm.runInNewContext(src+'\n({CoreTime,CoreGeo,CoreLegTiming,CoreFormat})');
test('time edge cases',()=>{assert.equal(t.clockMinutes('x'),540);assert.equal(t.clockAt(-1),'23:59');assert.equal(t.ronnyValidate24('24:00'),null);assert.equal(t.ronnyNormalize24('930'),'09:30')});
test('distance and polygons',()=>{assert.equal(g.kmBetween([0,0],[0,0]),0);assert.ok(Math.abs(g.kmBetween([0,0],[0,1])-111195)<2);assert.equal(g.ronnyPolyContains(.5,.5,[[0,0],[1,0],[1,1],[0,1]]),true);assert.equal(g.parseCoordinatePair('91,2'),null)});
test('leg override',()=>{assert.equal(l.resolveLegDuration({mode:'auto',minutesMode:'extra',minutes:10},600),1200);assert.equal(l.legTimingSnapshot({mode:'draw',minutes:30},600).duration,1800)});
test('format',()=>{assert.equal(f.minsFmt(90),'1 ש׳ 30 ד׳');assert.equal(f.money(1250),'₪1,250')});
