'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../scripts/src/00e-trip-storage.js'),'utf8');
const storage=vm.runInNewContext(source+'\nTripStorage');

test('fallback round-trip uses the existing JSON-array payload',()=>{
 const values=new Map();
 const write=v=>values.set('trips',v);
 storage.writeFallback(write,[{id:'abc',trip:{days:[]}}]);
 assert.equal(values.get('trips'),JSON.stringify([{id:'abc',trip:{days:[]}}]));
 assert.equal(JSON.stringify(storage.readFallback(()=>values.get('trips'))),values.get('trips'));
});
test('malformed fallback or denied reads recover to an empty list',()=>{
 assert.equal(JSON.stringify(storage.readFallback(()=>'{broken')),'[]');
 assert.equal(JSON.stringify(storage.readFallback(()=>null)),'[]');
 assert.equal(JSON.stringify(storage.readFallback(()=>{throw Error('SecurityError')})),'[]');
});
test('fallback write failures propagate (do not acknowledge unsaved data)',()=>{
 assert.throws(()=>storage.writeFallback(()=>{throw Error('QuotaExceededError')},[{id:1}]),/QuotaExceededError/);
});
test('IndexedDB availability and upgrade create the original store',async()=>{
 await assert.rejects(storage.open(null,'ronny','trips'),/IndexedDB/);
 let request,created;
 const engine={open:(name,version)=>{assert.equal(name,'ronny');assert.equal(version,1);request={result:{objectStoreNames:{contains:()=>false},createObjectStore:(store,opt)=>{created=[store,opt.keyPath]}}};return request}};
 const pending=storage.open(engine,'ronny','trips');
 request.onupgradeneeded();
 request.onsuccess();
 assert.equal(await pending,request.result);
 assert.equal(JSON.stringify(created),JSON.stringify(['trips','id']));
});
test('blocked database open rejects',async()=>{
 let request;
 const pending=storage.open({open:()=>request={}},'ronny','trips');
 request.onblocked();
 await assert.rejects(pending,/נעול/);
});
test('getAll is readonly and resolves on transaction completion',async()=>{
 let transaction,request;
 const database={transaction:(store,mode)=>{assert.equal(store,'trips');assert.equal(mode,'readonly');request={result:[{id:'one'}]};transaction={objectStore:()=>({getAll:()=>request})};return transaction}};
 const pending=storage.transact(database,'trips','getAll');
 request.onsuccess();
 transaction.oncomplete();
 assert.equal(JSON.stringify(await pending),'[{"id":"one"}]');
});
test('put and delete use readwrite transactions and preserve their arguments',async()=>{
 for(const [method,record] of [['put',{id:'a'}],['delete','a']]){
  let transaction,request,passed;
  const database={transaction:(_,mode)=>{assert.equal(mode,'readwrite');transaction={objectStore:()=>({put:r=>{passed=r;request={result:'ok'};return request},delete:r=>{passed=r;request={result:'ok'};return request}})};return transaction}};
  const pending=storage.transact(database,'trips',method,record);
  assert.equal(passed,record);
  request.onsuccess();
  transaction.oncomplete();
  assert.equal(await pending,'ok');
 }
});
test('transaction abort and unavailable DB reject',async()=>{
 await assert.rejects(storage.transact(null,'trips','put',{id:'a'}),/אינו זמין/);
 let transaction,request;
 const database={transaction:()=>{transaction={objectStore:()=>({put:()=>request={}})};return transaction}};
 const pending=storage.transact(database,'trips','put',{id:'b'});
 transaction.onabort();
 await assert.rejects(pending,/בוטלה/);
});
