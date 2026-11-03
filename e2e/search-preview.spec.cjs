'use strict';
const {test,expect}=require('@playwright/test');

function searchFeature(name,lat,lng,other={}){
 return {type:'Feature',geometry:{type:'Point',coordinates:[lng,lat]},properties:{name,city:'Edinburgh',county:'Midlothian',state:'Scotland',country:'United Kingdom',...other}};
}
async function mockPhoton(page,features){
 await page.route('https://photon.komoot.io/api/**',async route=>{
  await route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({features})});
 });
}

test('search shows meaningful place details, verifies location, and waits for pin click to offer adding',async({page})=>{
 await mockPhoton(page,[
  searchFeature('Hermitage Castle',55.2834,-2.7934,{osm_key:'historic',osm_value:'castle',street:'Castle Road',postcode:'TD9'}),
  searchFeature('Hermitage Water',55.2854,-2.7902,{osm_key:'waterway',osm_value:'river'})
 ]);
 await page.goto('/index.html',{waitUntil:'domcontentloaded'});
 await expect(page.locator('#map.leaflet-container')).toBeVisible();
 await page.locator('#place-search').fill('Hermitage');
 const results=page.locator('#search-results');
 await expect(results.locator('button.result')).toHaveCount(2);
 await expect(results).toContainText('טירה');
 await expect(results).toContainText('Castle Road');
 await expect(results).toContainText('Midlothian');
 await expect(results).toContainText('55.28340');
 const verification=results.locator('.ronny-search-verify').first();
 await expect(verification).toBeVisible();
 await expect(verification).toHaveAttribute('href',/google\.com\/maps\/search/);
 await expect(verification).toHaveAttribute('target','_blank');
 await results.locator('button.result').first().click();
 await expect(results).not.toHaveClass(/open/);
 const preview=page.locator('.ronny-search-preview-host');
 await expect(preview).toHaveCount(1);
 await expect(page.locator('#map-context')).not.toHaveClass(/open/);
 await expect(page.locator('#drawer')).not.toHaveClass(/open/);
 await preview.click();
 await expect(preview).toHaveCount(0);
 await expect(page.locator('#map-context')).toHaveClass(/open/);
});

test('temporary search pin disappears on unrelated map click and is not added to trip',async({page})=>{
 await mockPhoton(page,[searchFeature('Hermitage Castle',55.2834,-2.7934,{osm_key:'historic',osm_value:'castle'})]);
 await page.goto('/index.html',{waitUntil:'domcontentloaded'});
 await expect(page.locator('#map.leaflet-container')).toBeVisible();
 await page.locator('#place-search').fill('Hermitage');
 await page.locator('#search-results button.result').first().click();
 await expect(page.locator('.ronny-search-preview-host')).toHaveCount(1);
 const pane=await page.locator('#map').boundingBox();
 await page.locator('#map').click({position:{x:Math.min(150,pane.width/4),y:Math.min(210,pane.height/3)}});
 await expect(page.locator('.ronny-search-preview-host')).toHaveCount(0);
 await expect(page.locator('#map-context')).not.toHaveClass(/open/);
 await page.locator('#place-search').fill('Hermitage Castle');
 await expect(page.locator('#search-results button.result').first()).toBeVisible();
 await page.locator('#search-results button.result').first().click();
 await expect(page.locator('.ronny-search-preview-host')).toHaveCount(1);
 await page.locator('#place-search').fill('Other');
 await expect(page.locator('.ronny-search-preview-host')).toHaveCount(0);
});

test('spinner is visible during debounce and Photon request; hover keeps search icon centered',async({page})=>{
 let release;
 await page.route('https://photon.komoot.io/api/**',async route=>{
  await new Promise(resolve=>{release=resolve;});
  await route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({features:[searchFeature('Hermitage',55.2834,-2.7934)]})});
 });
 await page.goto('/index.html',{waitUntil:'domcontentloaded'});
 await expect(page.locator('#map.leaflet-container')).toBeVisible();
 const button=page.locator('#search-btn');
 await button.hover();
 const clipped=await button.evaluate(el=>{
  const b=el.getBoundingClientRect(),icon=el.querySelector('svg')?.getBoundingClientRect();
  return !!icon&&(icon.left<b.left||icon.right>b.right||icon.top<b.top||icon.bottom>b.bottom);
 });
 expect(clipped).toBe(false);
 await page.locator('#place-search').fill('Hermitage');
 await expect(page.locator('#search-box')).toHaveClass(/is-searching/);
 await expect(page.locator('#search-results')).toContainText('מחפש מקומות');
 await expect(button).toHaveAttribute('aria-busy','true');
 await expect.poll(()=>typeof release).toBe('function');
 release();
 await expect(page.locator('#search-results button.result')).toHaveCount(1);
 await expect(page.locator('#search-box')).not.toHaveClass(/is-searching/);
 await expect(button).toHaveAttribute('aria-busy','false');
});
