'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
test('final uploaded Glencairn SVG is the icon used by the bank and generated app',()=>{
 const svg=fs.readFileSync(path.join(root,'assets/glencairn_icon.svg'));
 assert.equal(crypto.createHash('sha256').update(svg).digest('hex'),'621702fed57378fd08f024dc829ec68cd9db63e6f64453e665a3f1beb465cbc6');
 const source=fs.readFileSync(path.join(root,'scripts/src/00-initial-state.js'),'utf8');
 const built=fs.readFileSync(path.join(root,'scripts/app.js'),'utf8');
 for(const script of [source,built]){
  assert.match(script,/"glencairn":\{"label":"כוס וויסקי גלנקרן","src":"assets\/glencairn_icon.svg"\}/);
  assert.match(script,/ronny-glencairn-icon/);
 }
});
