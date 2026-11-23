'use strict';
const {test,expect}=require('@playwright/test');

function place(name,lat,lng,extra={}){
 return {type:'Feature',geometry:{type:'Point',coordinates:[lng,lat]},
 properties:{name,state:'Scotland',country:'United Kingdom',osm_key:'tourism',osm_value:'attraction',...extra}};
}
function seedScotlandMap(page){
 return page.addInitScript(()=>{
  if(location.hostname==='127.0.0.1'){
   localStorage.setItem('ronny-global-map-settings-v1',JSON.stringify({home:{lat:56.565,lng:-3.62,zoom:10}}));
  }
 });
}

test('a biased Hermitage search retrieves broader candidates and ranks nearby The Hermitage first',async({page})=>{
 await seedScotlandMap(page);
 const requests=[];
 await page.route('https://photon.komoot.io/api/**',async route=>{
  const url=new URL(route.request().url()),biased=url.searchParams.has('lat');
  requests.push({biased,limit:Number(url.searchParams.get('limit')),q:url.searchParams.get('q')});
  const features=biased?[
   place('Hermitage Castle',55.2834,-2.7934,{osm_key:'historic',osm_value:'castle',osm_type:'W',osm_id:123}),
   place('Hermitage Water',55.16,-2.85,{osm_key:'waterway',osm_value:'river',osm_type:'W',osm_id:124})
  ]:[
   place('The Hermitage',56.55806,-3.61333,{osm_type:'W',osm_id:125,city:'Dunkeld'}),
   place('Hermitage Castle',55.2834,-2.7934,{osm_key:'historic',osm_value:'castle',osm_type:'W',osm_id:123})
  ];
  await route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({features})});
 });
 await page.goto('/index.html',{waitUntil:'domcontentloaded'});
 await expect(page.locator('#map.leaflet-container')).toBeVisible();
 await page.locator('#place-search').fill('Hermitage');
 const results=page.locator('#search-results button.result');
 await expect(results).toHaveCount(3);
 await expect(results.first()).toContainText('The Hermitage');
 await expect(results.first()).toContainText('Dunkeld');
 expect(requests).toHaveLength(2);
 expect(requests[0].biased).toBe(true);
 expect(requests[1].biased).toBe(false);
 expect(requests.every(x=>x.q==='Hermitage')).toBe(true);
 expect(requests[0].limit).toBeGreaterThanOrEqual(15);
 await results.first().click();
 await expect(page.locator('#place-search')).toHaveValue('Hermitage');
 await expect(page.locator('.ronny-search-preview-host')).toHaveCount(1);
 await expect(page.locator('#map-context')).not.toHaveClass(/open/);
});

test('a nearby exact place avoids a redundant global Photon request',async({page})=>{
 await seedScotlandMap(page);
 const requests=[];
 await page.route('https://photon.komoot.io/api/**',async route=>{
  requests.push(new URL(route.request().url()));
  await route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},
   body:JSON.stringify({features:[place('The Hermitage',56.55806,-3.61333,{city:'Dunkeld'})]})});
 });
 await page.goto('/index.html',{waitUntil:'domcontentloaded'});
 await expect(page.locator('#map.leaflet-container')).toBeVisible();
 await page.locator('#place-search').fill('Hermitage');
 await expect(page.locator('#search-results button.result')).toHaveCount(1);
 expect(requests).toHaveLength(1);
 expect(requests[0].searchParams.has('lat')).toBe(true);
});

test('numeric coordinates resolve immediately without Photon and use temporary pin',async({page})=>{
 let calls=0;
 await page.route('https://photon.komoot.io/api/**',async route=>{calls++;await route.abort();});
 await page.goto('/index.html',{waitUntil:'domcontentloaded'});
 await expect(page.locator('#map.leaflet-container')).toBeVisible();
 await page.locator('#place-search').fill('56.55806, -3.61333');
 const results=page.locator('#search-results');
 await expect(results.locator('button.result')).toHaveCount(1);
 await expect(results).toContainText('קואורדינטות');
 await expect(results).toContainText('56.55806');
 await expect(results).toContainText('-3.61333');
 await expect(page.locator('#search-box')).not.toHaveClass(/is-searching/);
 expect(calls).toBe(0);
 await results.locator('button.result').click();
 await expect(page.locator('.ronny-search-preview-host')).toHaveCount(1);
 await expect(page.locator('#map-context')).not.toHaveClass(/open/);
 await page.locator('.ronny-search-preview-host').click();
 await expect(page.locator('#map-context')).toHaveClass(/open/);
 expect(calls).toBe(0);
});

test('invalid numeric latitude or longitude shows a specific error without remote requests',async({page})=>{
 let calls=0;
 await page.route('https://photon.komoot.io/api/**',async route=>{calls++;await route.abort();});
 await page.goto('/index.html',{waitUntil:'domcontentloaded'});
 await page.locator('#place-search').fill('100, -190');
 await expect(page.locator('#search-results')).toContainText('קואורדינטות לא תקינות');
 await expect(page.locator('#search-results button.result')).toHaveCount(0);
 expect(calls).toBe(0);
});

test('a global lookup failure retains valid biased matches',async({page})=>{
 await seedScotlandMap(page);
 let calls=0;
 await page.route('https://photon.komoot.io/api/**',async route=>{
  calls++;
  if(new URL(route.request().url()).searchParams.has('lat')){
   await route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},
    body:JSON.stringify({features:[place('Hermitage Castle',55.2834,-2.7934)]})});
  }else await route.fulfill({status:503,body:'Service unavailable',headers:{'access-control-allow-origin':'*'}});
 });
 await page.goto('/index.html',{waitUntil:'domcontentloaded'});
 await page.locator('#place-search').fill('Hermitage');
 await expect(page.locator('#search-results button.result')).toHaveCount(1);
 await expect(page.locator('#search-results')).toContainText('Hermitage Castle');
 await expect(page.locator('#search-box')).not.toHaveClass(/is-searching/);
 expect(calls).toBe(2);
});
