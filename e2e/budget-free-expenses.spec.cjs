'use strict';
const {test,expect}=require('@playwright/test');
const point=(id,type,cost,lat,lng)=>({id,type,name:id,time:'09:00',duration:0,cost,lat,lng});
const fixture={version:3,title:'בדיקת תקציב חופשי',startDate:'2026-10-29',settings:{travelMode:'driving',mapStyle:'streets',planningResolution:'day'},days:[
 {dayId:'budget-day-a',label:'היום הראשון',stops:[point('start','start',80,46.04,7.8),point('end','end',20,46.05,7.81)]},
 {dayId:'budget-day-b',label:'היום השני',stops:[point('other','via',60,46.06,7.82)]}
]};
test('custom budget expenses are editable, day-allocatable, persisted and category section is gone',async({page})=>{
 await page.addInitScript(data=>{
  if(location.hostname==='127.0.0.1'&&!localStorage.getItem('ronny-budget-fixture')){
   localStorage.setItem('roam-trip-v2',JSON.stringify(data));
   localStorage.setItem('ronny-budget-fixture','1');
  }
 },fixture);
 await page.goto('/index.html',{waitUntil:'domcontentloaded'});
 await expect(page.locator('#map.leaflet-container')).toBeVisible();
 await page.locator('#rail-budget').click();
 const drawer=page.locator('#drawer-body');
 await expect(drawer.locator('#ronny-expense-add')).toBeVisible();
 await expect(drawer.locator('#budget-days-title')).toBeVisible();
 await expect(drawer).not.toContainText('חלוקה לפי סוג');
 const form=drawer.locator('#ronny-expense-add');
 await form.locator('[name=name]').fill('השכרת רכב');
 await form.locator('[name=amount]').fill('350');
 await form.locator('[name=dayId]').selectOption('budget-day-b');
 await form.locator('button[type=submit]').click();
 await expect(drawer.locator('[data-budget-row]')).toHaveCount(1);
 await expect(drawer.locator('.ronny-budget-day').nth(1)).toContainText('410');
 await expect(drawer.locator('[data-budget-total]')).toContainText('510');
 await form.locator('[name=name]').fill('דלק');
 await form.locator('[name=amount]').fill('70');
 await form.locator('button[type=submit]').click();
 await expect(drawer.locator('[data-budget-row]')).toHaveCount(2);
 await expect(drawer.locator('[data-budget-total]')).toContainText('580');
 await expect(drawer.locator('.ronny-budget-general')).toContainText('70');
 const row=drawer.locator('[data-budget-row]').first();
 await row.locator('[data-budget-field=amount]').fill('400');
 await row.locator('[data-budget-field=amount]').dispatchEvent('change');
 await expect(drawer.locator('[data-budget-total]')).toContainText('630');
 await drawer.locator('[data-budget-row]').last().locator('[data-budget-delete]').click();
 await expect(drawer.locator('[data-budget-total]')).toContainText('560');
 await expect(drawer.locator('[data-budget-row]')).toHaveCount(1);
 await expect.poll(async()=>page.locator('#ronny-local-save-status').getAttribute('data-status')).toBe('saved');
 await page.reload({waitUntil:'domcontentloaded'});
 await page.locator('#rail-budget').click();
 await expect(page.locator('#drawer-body [data-budget-row]')).toHaveCount(1);
 await expect(page.locator('#drawer-body [data-budget-field=name]').first()).toHaveValue('השכרת רכב');
 await expect(page.locator('#drawer-body [data-budget-field=amount]').first()).toHaveValue('400');
 await expect(page.locator('#drawer-body [data-budget-total]')).toContainText('560');
});
