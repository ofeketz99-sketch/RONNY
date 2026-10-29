'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const css=fs.readFileSync(path.join(__dirname,'../styles/app.css'),'utf8');
const rule=s=>{const i=css.indexOf(s+'{');assert.ok(i>=0,s+' present');const end=css.indexOf('}',i);assert.ok(end>=0);return css.slice(i,end)};
test('day-card pencil has transparent background and matching text colors',()=>{
 const defaultRule=rule('#days .ronny-day-card-edit');
 const activeRule=rule('#days .ronny-day-card:has(.day-pill.active) .ronny-day-card-edit');
 assert.match(defaultRule,/background:transparent/);
 assert.match(defaultRule,/border:0/);
 assert.match(defaultRule,/color:#405248/);
 assert.match(activeRule,/background:transparent/);
 assert.match(activeRule,/color:#fff/);
});
test('hover softens/darkens both card states without altering focus indication',()=>{
 for(const selector of ['#days .ronny-day-card-edit:hover','#days .ronny-day-card:has(.day-pill.active) .ronny-day-card-edit:hover']){
  const hover=rule(selector);
  assert.match(hover,/background:rgba\(/);
  assert.match(hover,/box-shadow:/);
 }
 assert.match(rule('#days .ronny-day-card-edit'),/border-radius:10px/);
 assert.match(rule('#days .ronny-day-card-edit:focus-visible'),/outline:/);
});
