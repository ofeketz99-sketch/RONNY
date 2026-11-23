'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
const geo=vm.runInNewContext(read('scripts/src/00h-route-geometry.js')+'\nRouteGeometry');
const near=(a,b,epsilon=1e-6)=>assert.ok(Math.abs(a-b)<=epsilon,a+' != '+b);

test('a straight path keeps the exact requested screen gap',()=>{
 const line=Array.from({length:20},(_,i)=>({x:i*7,y:i*3}));
 const shifted=geo.offsetScreenPath(line,3.4);
 shifted.forEach((p,i)=>near(Math.hypot(p.x-line[i].x,p.y-line[i].y),3.4));
});
test('sub-pixel vertices do not turn into a staircase',()=>{
 const dense=Array.from({length:200},(_,i)=>({x:i*.31,y:i*.17}));
 const shifted=geo.offsetScreenPath(dense,3.4);
 const length=list=>list.slice(1).reduce((sum,p,i)=>sum+Math.hypot(p.x-list[i].x,p.y-list[i].y),0);
 near(length(shifted),length(dense),1e-6);
});
test('outbound and reversed return lines sit on opposite sides',()=>{
 const out=[{x:0,y:0},{x:10,y:0},{x:20,y:0}];
 const a=geo.offsetScreenPath(out,3.4)[1],b=geo.offsetScreenPath([...out].reverse(),3.4)[1];
 near(a.y,3.4);near(b.y,-3.4);
});
test('identical points stay in place and input is not changed',()=>{
 const same=[{x:5,y:5},{x:5,y:5},{x:5,y:5}],copy=JSON.stringify(same);
 assert.deepEqual(JSON.parse(JSON.stringify(geo.offsetScreenPath(same,3.4))),JSON.parse(copy));
 assert.equal(JSON.stringify(same),copy);
});
test('retrace lines no longer bake a zoom-specific offset into coordinates',()=>{
 const source=read('scripts/src/20-route-geometry.js')+read('scripts/src/30-map-tools.js');
 assert.ok(!source.includes('ronnyRetraceShift'));
 assert.match(source,/_projectLatlngs/);
});
