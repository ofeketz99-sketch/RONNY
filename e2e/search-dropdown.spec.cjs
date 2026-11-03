'use strict';
const {test,expect}=require('@playwright/test');

test('map search suggestions extend below the search bar and can be selected',async({page})=>{
 await page.route('https://photon.komoot.io/api/**',async route=>{
  await route.fulfill({status:200,contentType:'application/json',
   headers:{'access-control-allow-origin':'*'},
   body:JSON.stringify({features:[{type:'Feature',geometry:{type:'Point',coordinates:[8.5417,47.3769]},properties:{name:'Search Test Zurich',city:'Zurich',country:'Switzerland'}}]})});
 });
 await page.goto('/index.html',{waitUntil:'domcontentloaded'});
 await expect(page.locator('#map.leaflet-container')).toBeVisible();
 const search=page.locator('#search-box');
 await page.locator('#place-search').fill('Search Test Zurich');
 const result=page.locator('#search-results .result').first();
 await expect(result).toBeVisible();
 await expect(result).toContainText('Search Test Zurich');
 const box=await search.boundingBox();
 const resultBox=await result.boundingBox();
 expect(box).not.toBeNull();
 expect(resultBox).not.toBeNull();
 expect(resultBox.y).toBeGreaterThanOrEqual(box.y+box.height);
 expect(await result.evaluate(el=>{
  const r=el.getBoundingClientRect();
  const hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);
  return hit===el||el.contains(hit);
 })).toBe(true);
 await result.click();
 await expect(page.locator('#place-search')).toHaveValue('Search Test Zurich');
 await expect(page.locator('#search-results')).not.toHaveClass(/open/);
 await expect.poll(()=>page.evaluate(()=>{
  const map=window.document.querySelector('#map');
  return !!map?.classList.contains('leaflet-container');
 })).toBe(true);
});

test('search keeps external Google Maps fallback visible under the input',async({page})=>{
 await page.route('https://photon.komoot.io/api/**',async route=>{
  await route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({features:[]})});
 });
 await page.goto('/index.html',{waitUntil:'domcontentloaded'});
 await page.locator('#place-search').fill('Unmatched Rare Location');
 const results=page.locator('#search-results');
 await expect(results).toContainText('לא נמצאו התאמות');
 await expect(results.locator('.search-external a')).toBeVisible();
});
