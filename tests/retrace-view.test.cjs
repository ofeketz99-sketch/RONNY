'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const code=fs.readFileSync(path.join(__dirname,'../scripts/src/00h-route-geometry.js'),'utf8');
const geo=vm.runInNewContext(code+'\nRouteGeometry');
const equal=(actual,expected)=>assert.deepEqual(JSON.parse(JSON.stringify(actual)),expected);
const loop=(mode='draw')=>[
 {id:'walk',type:'walkStart',walkRetrace:true,lat:46,lng:8},
 {id:'turn',type:'walkTurn',lat:46.03,lng:8.04,leg:{fromId:'walk',mode,path:[[46.01,8.01],[46.02,8.025]]}},
 {id:'back',type:'walkEnd',walkLoopSource:'walk',lat:46,lng:8,leg:{fromId:'turn',mode:'draw',path:[],walkAutoRetrace:true}}
];
test('a drawn walking path is reversed exactly, including bends, not shortened to a direct connector',()=>{
 const arr=loop(),shape=geo.legCoords(1,arr,(i,stops)=>stops[i].leg);
 const result=geo.walkRetraceSegments(arr,new Map([[1,shape]]));
 equal(shape,[[46,8],[46.01,8.01],[46.02,8.025],[46.03,8.04]]);
 equal(result.returns.get(2),shape.slice().reverse());
 equal([...result.outbound],[1]);
});
test('pencil reverse follows the last freely drawn vertex, without appending the turn marker',()=>{
 const arr=loop('pencil');
 const shape=geo.legCoords(1,arr,(i,stops)=>stops[i].leg);
 const result=geo.walkRetraceSegments(arr,new Map([[1,shape]]));
 equal(shape,[[46,8],[46.01,8.01],[46.02,8.025]]);
 equal(result.returns.get(2),[[46.02,8.025],[46.01,8.01],[46,8]]);
});
test('multi-leg walking retrace includes all legs without repeating connected joins',()=>{
 const arr=[{id:'walk',type:'walkStart',walkRetrace:true},{id:'a',type:'walkTurn'},
  {id:'b',type:'via'},{id:'back',type:'walkEnd',walkLoopSource:'walk',leg:{walkAutoRetrace:true}}];
 const result=geo.walkRetraceSegments(arr,new Map([[1,[[1,1],[2,2],[3,3]]],[2,[[3,3],[4,4],[5,5]]]]));
 equal(result.returns.get(3),[[5,5],[4,4],[3,3],[2,2],[1,1]]);
 equal([...result.outbound],[1,2]);
});
test('retrace rendering is not applied to manually separate return paths',()=>{
 const arr=loop();arr[0].walkRetrace=false;
 const result=geo.walkRetraceSegments(arr,new Map([[1,[[1,1],[2,2]]]]));
 assert.equal(result.returns.size,0);assert.equal(result.outbound.size,0);
 arr[0].walkRetrace=true;arr[2].leg.walkAutoRetrace=false;
 const second=geo.walkRetraceSegments(arr,new Map([[1,[[1,1],[2,2]]]]));
 assert.equal(second.returns.size,0);assert.equal(second.outbound.size,0);
});
test('two hikes in a day retain their own independent return geometry',()=>{
 const a=loop(),b=loop().map(s=>({...s,id:'b'+s.id,walkLoopSource:s.walkLoopSource?'b'+s.walkLoopSource:undefined}));
 const result=geo.walkRetraceSegments([...a,...b],new Map([[1,[[1,1],[2,2]]],[4,[[4,4],[5,5]]]]));
 equal(result.returns.get(2),[[2,2],[1,1]]);
 equal(result.returns.get(5),[[5,5],[4,4]]);
 equal([...result.outbound],[1,4]);
});
