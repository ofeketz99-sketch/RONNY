// RONNY as an installable phone app (patch 137). Separate from scripts/app.js on purpose:
// it only registers the offline service worker and offers "install to home screen" on phones.
(function(){
 'use strict';
 if('serviceWorker' in navigator&&/^https?:$/.test(location.protocol)){
  addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{}));
 }
 const KEY='ronny-install-dismissed-v1';
 const standalone=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
 const phone=()=>matchMedia('(max-width: 760px)').matches;
 const dismissed=()=>{try{return localStorage.getItem(KEY)==='1'}catch(e){return false}};
 const isIOS=/iphone|ipad|ipod/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
 let deferred=null;
 if(standalone())document.documentElement.classList.add('ronny-standalone');
 function remove(){document.getElementById('ronny-install')?.remove()}
 function show(){
  if(standalone()||!phone()||dismissed()||document.getElementById('ronny-install'))return;
  if(!deferred&&!isIOS)return;
  const bar=document.createElement('div');bar.id='ronny-install';bar.className='ronny-install';bar.setAttribute('role','region');bar.setAttribute('aria-label','התקנת RONNY');
  bar.innerHTML='<img src="assets/app/icon-192.png" alt="" width="34" height="34"><div class="ronny-install-copy"><strong>RONNY כאפליקציה</strong><span></span></div><button type="button" class="ronny-install-go"></button><button type="button" class="ronny-install-close" aria-label="לא עכשיו">✕</button>';
  const hint=bar.querySelector('span'),go=bar.querySelector('.ronny-install-go');
  if(deferred){hint.textContent='מסך מלא, פתיחה מהירה, עובד גם בלי קליטה';go.textContent='התקנה'}
  else{hint.textContent='בספארי: כפתור השיתוף ← ״הוספה למסך הבית״';go.textContent='הבנתי'}
  go.onclick=async()=>{
   if(deferred){deferred.prompt();try{await deferred.userChoice}catch(e){}deferred=null;remove();return}
   try{localStorage.setItem(KEY,'1')}catch(e){}remove();
  };
  bar.querySelector('.ronny-install-close').onclick=()=>{try{localStorage.setItem(KEY,'1')}catch(e){}remove()};
  document.body.appendChild(bar);
 }
 addEventListener('beforeinstallprompt',event=>{event.preventDefault();deferred=event;show()});
 addEventListener('appinstalled',()=>{deferred=null;remove();try{localStorage.setItem(KEY,'1')}catch(e){}});
 addEventListener('load',()=>setTimeout(show,2500));
})();
