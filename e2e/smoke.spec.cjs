'use strict';
const { test, expect } = require('@playwright/test');

async function openSite(page) {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#map.leaflet-container')).toBeVisible();
  await expect(page.locator('#trip-name')).toHaveValue(/.+/);
}

test('browser initializes Leaflet and planning tools without a startup crash', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await openSite(page);
  await expect(page.locator('#days')).not.toBeEmpty();
  await expect(page.locator('#schedule')).toBeAttached();
  await expect(page.locator('#map')).not.toContainText('אירעה שגיאה בהפעלת האתר');
  expect(errors).toEqual([]);
});

test('Versions drawer loads current JSON patch history over HTTP', async ({ page, request }) => {
  const manifestResponse = await request.get('/PATCH%20NOTES/index.json');
  expect(manifestResponse.ok()).toBeTruthy();
  const manifest = await manifestResponse.json();
  const current = manifest.files[0].replace(/\.json$/, '');
  await openSite(page);
  await page.locator('#rail-help').click();
  await expect(page.locator('#drawer')).toHaveClass(/open/);
  await expect(page.locator('#ronny-patch-content')).toContainText('גרסה נוכחית');
  await expect(page.locator('#ronny-patch-content strong[dir="ltr"]').first()).toHaveText(current);
  await expect(page.locator('#ronny-patch-content')).not.toContainText('לא ניתן לטעון את היסטוריית הגרסאות');
});

test('editing a trip title persists in real IndexedDB across browser reload', async ({ page }) => {
  await openSite(page);
  const title = 'בדיקת שמירה בדפדפן';
  await page.locator('#trip-name').fill(title);
  await page.locator('#trip-name').press('Tab');
  await expect(page.locator('#ronny-local-save-status')).toHaveAttribute('data-status', 'saved');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#map.leaflet-container')).toBeVisible();
  await expect(page.locator('#trip-name')).toHaveValue(title);
});

test('saved walking loop ends before the day endpoint and remains closed after reload', async ({ page }) => {
  const stop = (id, type, name, lat, lng) => ({ id, type, name, lat, lng, time: '09:00', duration: 0, cost: 0 });
  const fixture = {
    version: 3, title: 'טיול לבדיקת הליכה', startDate: '2026-10-29',
    settings: { travelMode: 'driving', mapStyle: 'streets', planningResolution: 'day' },
    days: [{ label: 'יום בדיקה', stops: [
      stop('start', 'start', 'חניה', 32, 34),
      { ...stop('walk', 'walkStart', 'תחילת הליכה', 32.01, 34.01), duration: 120, walkRetrace: true },
      { ...stop('turn', 'walkTurn', 'נקודת סיבוב', 32.02, 34.02), leg: { fromId: 'walk', mode: 'draw', path: [[32.015, 34.015]], minutes: 60 } },
      stop('hotel', 'end', 'מלון', 32.04, 34.06)
    ] }]
  };
  await page.addInitScript(data => {
    if (location.hostname === '127.0.0.1' && !localStorage.getItem('ronny-browser-fixture')) {
      localStorage.setItem('roam-trip-v2', JSON.stringify(data));
      localStorage.setItem('ronny-browser-fixture', 'yes');
    }
  }, fixture);
  await openSite(page);
  await expect(page.locator('#trip-name')).toHaveValue('טיול לבדיקת הליכה');
  await expect(page.locator('#ronny-local-save-status')).toHaveAttribute('data-status', 'saved');
  const inspect = () => page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open('ronny-trip-library-v1', 1);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    try {
      const records = await new Promise((resolve, reject) => {
        const req = db.transaction('trips', 'readonly').objectStore('trips').getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      const active = localStorage.getItem('ronny-active-trip-v1');
      return records.find(record => record.id === active)?.trip?.days?.[0]?.stops || [];
    } finally { db.close(); }
  });
  const verify = stops => {
    expect(stops.map(s => s.type)).toEqual(['start', 'walkStart', 'walkTurn', 'walkEnd', 'end']);
    expect(stops[3].walkLoopSource).toBe('walk');
    expect([stops[3].lat, stops[3].lng]).toEqual([stops[1].lat, stops[1].lng]);
    expect(stops[3].leg?.walkAutoRetrace).toBe(true);
    expect(stops[4].name).toBe('מלון');
  };
  verify(await inspect());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#map.leaflet-container')).toBeVisible();
  verify(await inspect());
});
