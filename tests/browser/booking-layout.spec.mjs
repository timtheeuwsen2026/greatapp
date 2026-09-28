import { test, expect } from '@playwright/test';

const booking = {
  id: 'layout-booking', experienceId: 'layout-event', userId: 'layout-user',
  status: 'deposit_paid', amount: '25.00', isDepositOnly: true,
  balancePaid: false, depositAmount: '25.00', balanceAmount: '75.00',
  balanceDueDate: '2027-04-01', totalPrice: '100.00',
  ticketName: `Weekend admission ${'LongTicketName'.repeat(8)}`, ticketQuantity: 2,
  createdAt: '2026-09-01',
  experience: {
    id: 'layout-event', title: `Weekend Adventure ${'LongEventName'.repeat(8)}`,
    coverImageUrl: null, startDate: '2027-04-10', endDate: '2027-04-12',
    location: `123 Seafront Road ${'LongAddress'.repeat(8)}`,
    venue: 'Seaside Retreat', price: '100.00', currency: 'EUR',
    requireMinimumParticipants: true, minimumParticipants: 10,
    currentParticipants: 6, mvgMet: false, lifecycleStatus: 'forming',
  },
};

test.beforeEach(async ({ page }) => {
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    const data = path === '/api/auth/user' ? { id: 'layout-user', role: 'participant' }
      : path === '/api/bookings/my-bookings' ? [booking]
      : path === '/api/me/reviewable' ? { pending: [] } : [];
    return route.fulfill({ json: data });
  });
  await page.route('https://www.google.com/maps**', route => route.fulfill({
    contentType: 'text/html', body: '<html><body>Map fixture</body></html>',
  }));
});

async function expectInsideViewport(locator, page) {
  await locator.evaluate(async el => {
    await Promise.all(el.getAnimations().map(animation => animation.finished));
  });
  await expect(locator).toBeInViewport({ ratio: 1 });
  const bounds = await locator.boundingBox();
  const viewport = page.viewportSize();
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height + 1);
}

for (const [name, width, height] of [
  ['small phone', 320, 568],
  ['phone', 390, 844],
  ['phone landscape', 844, 390],
  ['tablet', 768, 1024],
  ['laptop', 1366, 768],
  // A 200% zoomed 1280x720 display has this effective CSS viewport.
  ['zoomed laptop', 640, 360],
]) {
  test(`${name}: booking fits and every detail remains reachable`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/my-bookings');
    const card = page.getByTestId('card-booking-layout-booking');
    await expect(card).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    expect(await card.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await card.click();

    const dialog = page.getByRole('dialog', { name: 'Booking Details' });
    await expectInsideViewport(dialog, page);
    const scroll = page.getByTestId('booking-detail-scroll');
    expect(await scroll.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    expect(await scroll.evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true);

    const map = dialog.getByTestId('location-map');
    const gridWidth = await map.evaluate(el => el.parentElement.clientWidth);
    expect(await map.evaluate(el => el.clientWidth)).toBe(gridWidth);

    // Exercise actual wheel scrolling rather than just checking CSS class names.
    await scroll.hover({ position: { x: 8, y: 8 } });
    await page.mouse.wheel(0, 4000);
    const lastDetail = dialog.getByTestId('text-detail-booking-date');
    await expect(lastDetail).toBeInViewport({ ratio: 1 });
    for (const id of ['text-detail-total', 'text-detail-due-date', 'mvg-status-indicator']) {
      const detail = dialog.getByTestId(id);
      await detail.scrollIntoViewIfNeeded();
      await expect(detail).toBeInViewport({ ratio: 1 });
    }
    const close = dialog.getByRole('button', { name: 'Close', exact: true });
    await expectInsideViewport(close, page);
    await close.click();
    await expect(dialog).toBeHidden();

    await card.click();
    await expect(dialog).toBeVisible();
    await close.focus();
    await expect(close).toBeFocused();
    await close.press('Escape');
    await expect(dialog).toBeHidden();
  });
}

test('open booking adapts when the viewport height changes', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/my-bookings');
  await page.getByTestId('card-booking-layout-booking').click();
  await page.setViewportSize({ width: 844, height: 390 });
  const dialog = page.getByRole('dialog', { name: 'Booking Details' });
  await expectInsideViewport(dialog, page);
  await dialog.getByTestId('text-detail-booking-date').scrollIntoViewIfNeeded();
  await expect(dialog.getByTestId('text-detail-booking-date')).toBeInViewport({ ratio: 1 });
  await expectInsideViewport(dialog.getByRole('button', { name: 'Close', exact: true }), page);
});
