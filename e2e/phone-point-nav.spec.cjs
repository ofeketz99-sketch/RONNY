'use strict';
const { test, expect } = require('@playwright/test');

// Patch 140: phone map mode shows previous / next point arrows in the top bar.
test('phone: the top bar arrows step through the day points on the map', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/index.html', { waitUntil:'domcontentloaded' });
  await expect(page.locator('#map.leaflet-container')).toBeAttached();
  // Plan tab: trip name, no point arrows.
  await expect(page.locator('#ronny-point-nav')).toBeHidden();
  await expect(page.locator('#trip-name')).toBeVisible();
  await page.locator('#rail-map').click();
  await expect(page.locator('#ronny-point-nav')).toBeVisible();
  await expect(page.locator('#trip-name')).toBeHidden();
  // Before a point is chosen the chip shows how many points the day has.
  const total = Number((await page.locator('#point-nav-count').textContent()).match(/\d+/)[0]);
  expect(total).toBeGreaterThan(1);
  await page.locator('#point-nav-next').click();
  await expect(page.locator('#point-nav-count')).toHaveText('1/' + total);
  await expect(page.locator('#point-nav-prev')).toBeDisabled();
  await page.locator('#point-nav-next').click();
  await expect(page.locator('#point-nav-count')).toHaveText('2/' + total);
  await expect(page.locator('.point-pin.active')).toHaveCount(1);
  await page.locator('#point-nav-prev').click();
  await expect(page.locator('#point-nav-count')).toHaveText('1/' + total);
  // The bar must not scroll sideways when a button takes focus.
  expect(await page.evaluate(() => document.querySelector('.topbar').scrollLeft)).toBe(0);
  const box = await page.locator('#point-nav-prev').boundingBox();
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  // Tapping the name opens the point editor.
  await page.locator('#point-nav-label').click();
  await expect(page.locator('#point-quick')).toHaveClass(/open/);
});
