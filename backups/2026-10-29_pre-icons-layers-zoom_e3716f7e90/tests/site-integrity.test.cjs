'use strict';
const{test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const html=read('index.html');
test('HTML loads existing local assets without relying on an old monolith',()=>{
 for(const asset of ['styles/app.css','scripts/app.js','assets/favicon.png']){
  assert.ok(html.includes(asset),asset+' referenced');assert.ok(fs.existsSync(path.join(root,asset)),asset+' exists');
 }
 assert.match(html,/<html\s+lang="he"\s+dir="rtl">/);
});
test('HTML contains no duplicate element identifiers',()=>{
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
 assert.equal(new Set(ids).size,ids.length);
});
test('all numbered patch files exist and match the manifest',()=>{
 const manifest=JSON.parse(read('PATCH NOTES/index.json'));
 assert.equal(manifest.schemaVersion,1);
 assert.equal(new Set(manifest.files).size,manifest.files.length);
 const numbers=manifest.files.map(name=>Number(name.replace(/\.json$/,'')));
 assert.deepEqual(numbers,[...numbers].sort((a,b)=>b-a));
 for(const name of manifest.files){
  assert.match(name,/^\d+\.json$/);
  const file=path.join(root,'PATCH NOTES',name);
  assert.ok(fs.existsSync(file),'Missing '+name);
  const note=JSON.parse(fs.readFileSync(file,'utf8'));
  assert.equal(String(note.version),name.replace(/\.json$/,''));
  assert.match(note.date,/^\d{4}-\d\d-\d\d$/);
  assert.ok(Array.isArray(note.notes)&&note.notes.length>0);
 }
});
test('release history is dynamically loaded with visible error handling',()=>{
 const app=read('scripts/app.js');
 assert.ok(app.includes('RONNY_PATCH_INDEX_URL'));
 assert.ok(app.includes('PATCH%20NOTES/index.json'));
 assert.ok(app.includes('לא ניתן לטעון את היסטוריית הגרסאות'));
});
