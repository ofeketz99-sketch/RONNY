function ronnyReleaseNotes(r){
 return '<ul class="ronny-release-notes">'+(r.notes||[]).map(n=>'<li>'+esc(String(n))+'</li>').join('')+'</ul>';
}
async function ronnyLoadPatchNotes(){
 if(ronnyPatchNotesCache)return ronnyPatchNotesCache;
 if(ronnyPatchNotesPromise)return ronnyPatchNotesPromise;
 ronnyPatchNotesPromise=(async()=>{
  const response=await fetch(RONNY_PATCH_INDEX_URL,{cache:'no-cache'});
  if(!response.ok)throw new Error('לא ניתן לטעון את אינדקס הגרסאות');
  const manifest=await response.json();
  if(!Array.isArray(manifest.files)||!manifest.files.length)throw new Error('אינדקס הגרסאות ריק או אינו תקין');
  const filenames=manifest.files;
  if(filenames.some(n=>typeof n!=='string'||!/^\d+\.json$/.test(n)))throw new Error('שמות קובצי גרסה לא תקינים');
  const releases=await Promise.all(filenames.map(async(filename)=>{
   const response=await fetch('./PATCH%20NOTES/'+encodeURIComponent(filename),{cache:'no-cache'});
   if(!response.ok)throw new Error('קובץ גרסה חסר: '+filename);
   const entry=await response.json();
   if(!entry||!/^\d+(?:\.\d+)?$/.test(String(entry.version))||!Array.isArray(entry.notes)||entry.notes.some(n=>typeof n!=='string'))throw new Error('תוכן קובץ גרסה אינו תקין: '+filename);
   if(String(parseInt(filename,10))!==String(parseInt(entry.version,10)))throw new Error('מספר קובץ גרסה אינו תואם: '+filename);
   return entry;
  }));
  releases.sort((a,b)=>Number(b.version)-Number(a.version));
  ronnyPatchNotesCache=releases;
  return releases;
 })();
 try{return await ronnyPatchNotesPromise}finally{ronnyPatchNotesPromise=null}
}
async function ronnyRenderPatchNotes(){
 const target=document.getElementById('ronny-patch-content');
 if(!target)return;
 try{
  const releases=await ronnyLoadPatchNotes();
  if(!target.isConnected)return;
  const current=releases[0];
  const archive=releases.slice(1).map(r=>'<details class="ronny-about-archive-entry"><summary>גרסה '+esc(String(r.version))+' <span>'+esc(String(r.date||''))+'</span></summary>'+ronnyReleaseNotes(r)+'</details>').join('');
  target.innerHTML='<div class="ronny-about-version-stats"><div><small>גרסה נוכחית</small><strong dir="ltr">'+esc(String(current.version))+'</strong></div><div><small>מספר פאצ׳ים</small><strong>'+esc(String(current.version))+'</strong></div></div><h3>הערות עדכון — גרסה '+esc(String(current.version))+'</h3>'+ronnyReleaseNotes(current)+'<h3>ארכיון גרסאות</h3>'+archive;
 }catch(error){
  if(target.isConnected)target.innerHTML='<p class="footnote" role="alert">לא ניתן לטעון את היסטוריית הגרסאות: '+esc(String(error.message||''))+'</p><button type="button" class="btn" id="ronny-patch-retry">נסה שוב</button>';
  const retry=document.getElementById('ronny-patch-retry');
  if(retry)retry.onclick=()=>{target.textContent='טוען גרסאות…';ronnyRenderPatchNotes()};
 }
}
function help(){const body=`<div class="ronny-about-root"><details class="ronny-about-section"><summary>עזרה</summary><div class="ronny-about-content"><div class="shortcut-note"><strong>תכנון מפה ויומן</strong><p>חפש יעד ובחר תוצאה כדי ליצור עצירה. אפשר גם ללחוץ ישירות על המפה, להוסיף קואורדינטות, להגדיר שעה, משך שהייה והוצאה ולשמור.</p><strong>הנסיעות</strong><p>לחץ על שורת הדרך בין שתי עצירות או על הקו במפה כדי לבחור ״מצא נתיב״, ״שרטט נתיב״ או ״קו אווירי״. במצב שרטוט בוחרים נקודות ביניים ישירות על המפה. אפשר להוסיף כיתוב על הקו ומשך מעבר ידני, למשל לרכבל.</p><p>לאחר הוספת שתי נקודות, האתר מחשב זמן ומרחק באמצעות שירותי ניתוב ציבוריים. ניתן לגרור עצירות כדי לשנות את הסדר וללחוץ על "תזמון אוטומטי" לחישוב שעות משוער.</p><strong>מפות ותצוגת רחוב</strong><p>לחץ על ״סטריט ויו״ בסרגל המפה ולאחר מכן על נקודה כדי לפתוח את גוגל בטאב חדש — ללא מפתח API. בתפריט הפעולות של נקודה יש גם קיצור דרך ישיר. שכבת ״כיסוי (API)״ היא אפשרות מתקדמת שדורשת מפתח Google. אפשר לבחור בין תצוגת יום לתצוגת כל הטיול, ולהחליף מפות רגילות, טופוגרפיות ולוויין. סקירת כל הטיול מציגה קווים סכמטיים; בעת בחירת יום יחושב נתיב בדרך. פתיחה של Street View בטאב חדש אינה דורשת מפתח, והטמעה בתוך האתר דורשת מפתח Google בלבד.</p><strong>שמירה</strong><p>הכל נשמר אוטומטית בדפדפן, וניתן לייצא ולייבא קובץ JSON בלי מפתחות השירות. נדרש חיבור לאינטרנט לטעינת מפות, לחיפוש ולחישוב מסלולים. בפתיחה מקומית של HTML ייתכן שמפתחות המוגבלים לדומיין לא יעבדו.</p></div></div></details><details class="ronny-about-section" open><summary>גרסאות</summary><div class="ronny-about-content" id="ronny-patch-content" aria-live="polite">טוען גרסאות…</div></details></div>`;openDrawer('אודות','ABOUT RONNY','מדריך שימוש והיסטוריית גרסאות',body,'<button class="btn btn-primary" id="help-close">סגור</button>');$('help-close').onclick=closeDrawer;ronnyRenderPatchNotes()}


/* RONNY 35.7 — geographic outline / day assignment + integrated dashboard */
