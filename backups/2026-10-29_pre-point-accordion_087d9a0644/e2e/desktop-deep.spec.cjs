'use strict';
const { test, expect } = require('@playwright/test');

function sampleTrip(mode = 'straight') {
  return {
    version: 3, title: 'בדיקת כלי מפה במחשב', startDate: '2026-10-29',
    settings: { travelMode: 'driving', mapStyle: 'streets', planningResolution: 'day' },
    days: [{
      label: 'יום בדיקת מסלול',
      stops: [
        { id: 'origin', type: 'start', name: 'מוצא', lat: 46.04, lng: 7.8, time: '09:00', duration: 0, cost: 0 },
        { id: 'finish', type: 'end', name: 'יעד', lat: 46.06, lng: 7.82, time: '10:00', duration: 0, cost: 0,
          ...(mode === 'auto' ? {} : { leg: { fromId: 'origin', mode, path: [], minutes: 25 } }) }
      ]
    }]
  };
}
async function loadFixture(page, mode = 'straight') {
  await page.addInitScript(data => {
    if (location.hostname === '127.0.0.1' && !localStorage.getItem('ronny-desktop-fixture')) {
      localStorage.setItem('roam-trip-v2', JSON.stringify(data));
      localStorage.setItem('ronny-desktop-fixture', 'yes');
    }
  }, sampleTrip(mode));
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#map.leaflet-container')).toBeVisible();
  await expect(page.locator('#trip-name')).toHaveValue('בדיקת כלי מפה במחשב');
  await page.locator('#map-scope').evaluate(select => {
    select.value = 'day';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expect(page.locator('#route-stops')).toHaveText('2');
}
async function activeTrip(page) {
  return page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('ronny-trip-library-v1', 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const records = await new Promise((resolve, reject) => {
        const req = db.transaction('trips', 'readonly').objectStore('trips').getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      return records.find(r => r.id === localStorage.getItem('ronny-active-trip-v1'))?.trip;
    } finally {
      db.close();
    }
  });
}
async function mapClick(page, xRatio, yRatio) {
  const b = await page.locator('#map').boundingBox();
  expect(b).toBeTruthy();
  await page.mouse.click(b.x + b.width * xRatio, b.y + b.height * yRatio);
}

test('desktop pencil mode draws vertices, undo removes one, and reload retains path', async ({ page }) => {
  await loadFixture(page);
  await page.locator('.leg-open[data-leg-index="1"]').click();
  await expect(page.locator('#leg-editor')).toHaveClass(/open/);
  await page.locator('[data-leg-mode="pencil"]').click();
  await expect(page.locator('#leg-draw-banner')).toHaveClass(/active/);
  await mapClick(page, .35, .56);
  await mapClick(page, .64, .62);
  await expect(page.locator('#leg-draw-banner strong')).toContainText('2 נקודות');
  await page.locator('#leg-undo').click();
  await expect(page.locator('#leg-draw-banner strong')).toContainText('1 נקודות');
  await mapClick(page, .57, .68);
  await expect(page.locator('#leg-draw-banner strong')).toContainText('2 נקודות');
  await page.locator('#leg-finish').click();
  await expect(page.locator('#leg-editor')).toHaveClass(/open/);
  await expect.poll(async () => (await activeTrip(page))?.days?.[0]?.stops?.[1]?.leg?.path?.length).toBe(2);
  const before = (await activeTrip(page)).days[0].stops[1].leg;
  expect(before.mode).toBe('pencil');
  expect(before.path).toHaveLength(2);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#map.leaflet-container')).toBeVisible();
  await expect.poll(async () => (await activeTrip(page))?.days?.[0]?.stops?.[1]?.leg?.path?.length).toBe(2);
  expect((await activeTrip(page)).days[0].stops[1].leg.path).toEqual(before.path);
});

test('desktop distance ruler draws, undoes, clears and exits with Escape', async ({ page }) => {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#map.leaflet-container')).toBeVisible();
  if (!(await page.locator('#map-distance-measure').isVisible())) {
    await page.locator('#map-tools-toggle').click();
  }
  await page.locator('#map-distance-measure').click();
  await expect(page.locator('#ronny-measure-panel')).toBeVisible();
  await expect(page.locator('#map-distance-measure')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.map-pane')).not.toHaveClass(/map-tools-expanded/);
  await mapClick(page, .41, .48);
  await expect(page.locator('#ronny-measure-clear')).toBeEnabled();
  await expect(page.locator('#ronny-measure-detail')).toContainText('1 נקודות שרטוט');
  await mapClick(page, .57, .58);
  await expect(page.locator('#ronny-measure-detail')).toContainText('2 נקודות שרטוט');
  await expect(page.locator('#ronny-measure-undo')).toBeEnabled();
  await expect(page.locator('#ronny-measure-value')).not.toHaveText('0 מ׳');
  await page.locator('#ronny-measure-undo').click();
  await expect(page.locator('#ronny-measure-value')).toHaveText('0 מ׳');
  await expect(page.locator('#ronny-measure-clear')).toBeEnabled();
  await page.locator('#ronny-measure-clear').click();
  await expect(page.locator('#ronny-measure-clear')).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(page.locator('#ronny-measure-panel')).toBeHidden();
  await expect(page.locator('#map-distance-measure')).toHaveAttribute('aria-pressed', 'false');
});

test('failed routing stays clearly estimated and a manual mode is saved', async ({ page }) => {
  let attempts = 0;
  await page.route('**/route/v1/**', async route => {
    attempts++;
    await route.fulfill({ status: 503, contentType: 'application/json', body: '{"code":"Error"}' });
  });
  await loadFixture(page, 'auto');
  await expect.poll(() => attempts).toBeGreaterThan(0);
  await expect(page.locator('#route-msg')).toContainText('לא חושבו');
  await page.locator('.leg-open[data-leg-index="1"]').click();
  await expect(page.locator('#leg-editor')).toHaveClass(/open/);
  await page.locator('[data-leg-mode="straight"]').click();
  await expect.poll(async () => (await activeTrip(page))?.days?.[0]?.stops?.[1]?.leg?.mode).toBe('straight');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#map.leaflet-container')).toBeVisible();
  expect((await activeTrip(page)).days[0].stops[1].leg.mode).toBe('straight');
});
