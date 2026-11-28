'use strict';
const { test, expect } = require('@playwright/test');

// Patch 141: "my location" button under the zoom buttons, on the computer and on the phone.
const HERE = { latitude: 31.7767, longitude: 35.2345, accuracy: 25 };

async function dotOffsetFromMapCentre(page) {
  const map = await page.locator('#map').boundingBox();
  const dot = await page.locator('.ronny-locate-dot').boundingBox();
  return Math.hypot(dot.x + dot.width / 2 - (map.x + map.width / 2), dot.y + dot.height / 2 - (map.y + map.height / 2));
}

test('computer: locate, follow, look away, come back, switch off', async ({ page, context }) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation(HERE);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  const button = page.locator('#map-locate');
  await expect(button).toBeVisible();
  await expect(button).toHaveAttribute('data-state', 'off');
  await button.click();
  await expect(button).toHaveAttribute('data-state', 'follow');
  await expect(page.locator('.ronny-locate-dot')).toBeVisible();
  await expect.poll(() => dotOffsetFromMapCentre(page)).toBeLessThan(12);
  // Dragging the map means the user is looking elsewhere: stop following.
  const map = await page.locator('#map').boundingBox();
  await page.mouse.move(map.x + map.width * 0.5, map.y + map.height * 0.6);
  await page.mouse.down();
  await page.mouse.move(map.x + map.width * 0.3, map.y + map.height * 0.4, { steps: 8 });
  await page.mouse.up();
  await expect(button).toHaveAttribute('data-state', 'free');
  await button.click();
  await expect(button).toHaveAttribute('data-state', 'follow');
  await expect.poll(() => dotOffsetFromMapCentre(page)).toBeLessThan(12);
  // Moving with the phone moves the dot.
  const before = await page.locator('.ronny-locate-dot').boundingBox();
  await context.setGeolocation({ ...HERE, latitude: HERE.latitude + 0.0006 });
  await expect.poll(async () => (await page.locator('.ronny-locate-dot').boundingBox()).y).toBeLessThan(before.y - 5);
  await button.click();
  await expect(button).toHaveAttribute('data-state', 'off');
  await expect(page.locator('.ronny-locate-dot')).toHaveCount(0);
});

test('phone: the button is on the map tab and fits under the zoom buttons', async ({ page, context }) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation(HERE);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await page.locator('#rail-map').click();
  const button = page.locator('#map-locate');
  await expect(button).toBeVisible();
  const box = await button.boundingBox();
  const zoomOut = await page.locator('.leaflet-control-zoom-out').boundingBox();
  expect(box.width).toBeLessThanOrEqual(38);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  expect(box.y).toBeGreaterThanOrEqual(zoomOut.y + zoomOut.height);
  await button.click();
  await expect(button).toHaveAttribute('data-state', 'follow');
  await expect(page.locator('.ronny-locate-dot')).toBeVisible();
});

test('denied permission: nothing is drawn and the reason is shown', async ({ page, context }) => {
  await context.clearPermissions();
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await page.locator('#map-locate').click();
  await expect(page.locator('#toast')).toContainText('הרשאה');
  await expect(page.locator('#map-locate')).toHaveAttribute('data-state', 'off');
  await expect(page.locator('.ronny-locate-dot')).toHaveCount(0);
});
