'use strict';
const{test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
test('unused time-segment UI is absent from document and scripts',()=>{
 const html=read('index.html'),src=read('scripts/src/66-event-bindings.js'),timeline=read('scripts/src/24-timeline-scheduling.js'),bundle=read('scripts/app.js');
 for(const text of [html,src,timeline,bundle]){
  assert.doesNotMatch(text,/segments-btn|segment-chips|renderSegmentChips|manageSegments|segment-heading|segmentFor\(/);
 }
 assert.match(html,/id="ronny-day-summary"/);
 assert.match(html,/id="auto-time"/);
 assert.match(timeline,/function renderCompactDaySummary\(/);
 assert.match(src,/\$\('auto-time'\)\.onclick=autoSchedule/);
});
test('legacy segment metadata stays compatible for existing saved trips',()=>{
 const source=read('scripts/src/00-initial-state.js');
 assert.match(source,/d\.segments=Array\.isArray\(d\.segments\)\?d\.segments:\[\]/);
});
