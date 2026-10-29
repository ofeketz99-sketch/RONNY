'use strict';
const { test, expect } = require('@playwright/test');

test('the real Leaflet map paints a walking loop as legs separate from the final drive', async ({ page }) => {
  const stop = (id, type, name, lat, lng) => ({ id, type, name, lat, lng, time: '09:00', duration: 0, cost: 0 });
  const data = {
    version: 3, title: 'בדיקת ציור מפה', startDate: '2026-10-29',
    settings: { travelMode: 'driving', mapStyle: 'streets', planningResolution: 'day' },
    days: [{ label: 'יום הליכה ונסיעה', stops: [
      stop('car','start','חניה',32,34),
      { ...stop('walk','walkStart','תחילת הליכה',32.01,34.01), duration: 120, walkRetrace: true },
      { ...stop('turn','walkTurn','סיבוב',32.02,34.02), leg: { fromId:'walk', mode:'draw', path:[[32.015,34.017]], minutes:60 } },
      stop('hotel','end','מלון',32.04,34.06)
    ] }]
  };
  await page.addInitScript(trip => {
    if (location.hostname === '127.0.0.1' && !localStorage.getItem('ronny-fixture-map')) {
      localStorage.setItem('roam-trip-v2', JSON.stringify(trip));
      localStorage.setItem('ronny-fixture-map', '1');
    }
  }, data);
  await page.goto('/index.html', { waitUntil:'domcontentloaded' });
  await expect(page.locator('#map.leaflet-container')).toBeVisible();
  await expect(page.locator('#trip-name')).toHaveValue('בדיקת ציור מפה');
  // This select is visually mirrored by the quick-map menu. Trigger the actual change handler.
  await page.locator('#map-scope').evaluate(select => {
    select.value = 'day';
    select.dispatchEvent(new Event('change', { bubbles:true }));
  });
  await expect(page.locator('#route-stops')).toHaveText('5');
  await expect(page.locator('#schedule')).toContainText('סיבוב');
  await expect.poll(() => page.locator('path.leg-map-path').count()).toBeGreaterThanOrEqual(2);
  await expect(page.locator('#map')).not.toContainText('אירעה שגיאה בהפעלת האתר');
});
