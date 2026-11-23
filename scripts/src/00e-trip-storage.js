// Persistence transport only. Queue order and trip state stay with the library controller.
const TripStorage=(()=>{
function open(indexedDBApi,dbName,storeName){return new Promise((resolve,reject)=>{
 if(!indexedDBApi){reject(Error('IndexedDB לא זמין'));return}
 const req=indexedDBApi.open(dbName,1);
 req.onupgradeneeded=()=>{const database=req.result;if(!database.objectStoreNames.contains(storeName))database.createObjectStore(storeName,{keyPath:'id'})};
 req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error||Error('פתיחת הספרייה נכשלה'));
 req.onblocked=()=>reject(Error('מסד הנתונים נעול בטאב אחר'));
})}
function transact(database,storeName,method,record){return new Promise((resolve,reject)=>{
 if(!database)return reject(Error('מסד הנתונים אינו זמין'));
 const tx=database.transaction(storeName,method==='getAll'||method==='get'?'readonly':'readwrite');
 const store=tx.objectStore(storeName);let req;
 if(method==='getAll')req=store.getAll();else if(method==='get')req=store.get(record);else if(method==='delete')req=store.delete(record);else req=store.put(record);
 let output;req.onsuccess=()=>{output=req.result};req.onerror=()=>reject(req.error||Error('שמירת טיול נכשלה'));
 tx.oncomplete=()=>resolve(output);tx.onerror=()=>reject(tx.error||Error('פעולת שמירה נכשלה'));tx.onabort=()=>reject(tx.error||Error('פעולת שמירה בוטלה'));
})}
// Writes only when no other tab advanced this trip since it was loaded.
function putIfCurrent(database,storeName,record,expectedRev){return new Promise((resolve,reject)=>{
 if(!database)return reject(Error('מסד הנתונים אינו זמין'));
 const expected=Number(expectedRev)||0,tx=database.transaction(storeName,'readwrite'),store=tx.objectStore(storeName);
 let outcome={conflict:false,rev:expected+1};
 const read=store.get(record.id);
 read.onerror=()=>reject(read.error||Error('קריאת טיול נכשלה'));
 read.onsuccess=()=>{
  const stored=read.result,storedRev=Number(stored?.rev)||0;
  if(storedRev>expected||(!stored&&expected>0)){outcome={conflict:true,rev:storedRev};return}
  try{
   const write=store.put({...record,rev:outcome.rev});
   write.onerror=()=>reject(write.error||Error('שמירת טיול נכשלה'));
  }catch(error){reject(error);try{tx.abort()}catch(_){}}
 };
 tx.oncomplete=()=>resolve(outcome);tx.onerror=()=>reject(tx.error||Error('פעולת שמירה נכשלה'));tx.onabort=()=>reject(tx.error||Error('פעולת שמירה בוטלה'));
})}
function readFallback(read){try{return JSON.parse(read()||'[]')}catch(e){return []}}
function writeFallback(write,records){write(JSON.stringify(records))}
return Object.freeze({open,transact,putIfCurrent,readFallback,writeFallback});
})();
