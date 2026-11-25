'use strict';
const { test, expect } = require('@playwright/test');
const fs = require('node:fs');

test('export then import a trip through the real browser UI without overwriting the original', async ({ page }) => {
  await page.addInitScript(() => {
    // Force standard browser download rather than an OS file picker in headless Chromium.
    Object.defineProperty(window, 'showSaveFilePicker', { value:undefined, configurable:true });
  });
  await page.goto('/index.html', { waitUntil:'domcontentloaded' });
  await expect(page.locator('#map.leaflet-container')).toBeVisible();
  await page.locator('#trip-name').fill('טיול יצוא ויבוא');
  await page.locator('#trip-name').press('Tab');
  await expect(page.locator('#ronny-local-save-status')).toHaveAttribute('data-status','saved');
  await page.locator('#data-transfer-btn').click();
  await expect(page.locator('#drawer')).toHaveClass(/open/);
  const pending = page.waitForEvent('download');
  await page.locator('#export-btn').click();
  const download = await pending;
  expect(download.suggestedFilename()).toMatch(/\.json$/);
  const exported = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
  expect(exported.title).toBe('טיול יצוא ויבוא');
  expect(exported.days.length).toBeGreaterThan(0);
  expect(exported.settings.googleKey).toBe('');
  await page.locator('#import-file').setInputFiles({
    name: 'ronny-trip-backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(exported))
  });
  await expect(page.locator('#toast')).toContainText('הטיול יובא ונשמר');
  await expect(page.locator('#ronny-local-save-status')).toHaveAttribute('data-status', 'saved');
  await page.locator('#rail-library').click();
  await expect(page.locator('.library-item')).toHaveCount(2);
  await page.reload({ waitUntil:'domcontentloaded' });
  await expect(page.locator('#map.leaflet-container')).toBeVisible();
  await expect(page.locator('#trip-name')).toHaveValue('טיול יצוא ויבוא');
});
