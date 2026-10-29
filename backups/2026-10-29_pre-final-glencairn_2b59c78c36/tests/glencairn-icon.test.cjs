'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
test('original uploaded Glencairn SVG is the icon used by the bank and generated app',()=>{
 const svg=fs.readFileSync(path.join(root,'assets/glencairn_icon.svg'));
 assert.equal(crypto.createHash('sha256').update(svg).digest('hex'),'563afe0a70a3d9ab4b09ae1d3f9e6e1517f8793ccb01b4a8e8edd15c57d0181a');
 const source=fs.readFileSync(path.join(root,'scripts/src/00-initial-state.js'),'utf8');
 const built=fs.readFileSync(path.join(root,'scripts/app.js'),'utf8');
 for(const script of [source,built]){
  assert.match(script,/"glencairn":\{"label":"כוס וויסקי גלנקרן","src":"assets\/glencairn_icon.svg"\}/);
  assert.match(script,/ronny-glencairn-icon/);
 }
});
