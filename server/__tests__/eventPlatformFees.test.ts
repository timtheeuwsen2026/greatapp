import { it, expect, vi } from 'vitest';
import { routeFunction, routeResponse } from '../../tests/routeHarness';
import { eventFeeRates } from '@shared/platformFees';

function harness(admin = true) {
  const events: Record<string, any> = { coffee: { id: 'coffee', platformPct: 15, venueCompensationModel: 'revenue_share', venueRevenueSharePct: 80 },
    run: { id: 'run', ticketPlatformFeePct: 15, addonPlatformFeePct: 5 } };
  const storage = { getExperience: vi.fn(async (id: string) => events[id]),
    setEventPlatformFees: vi.fn(async (id: string, ticket: number, addon: number) => Object.assign(events[id], { ticketPlatformFeePct: ticket, addonPlatformFeePct: addon })) };
  const route = routeFunction('/api/admin/experiences/:id/platform-fees', {
    checkIsAdmin: async () => admin, storage, eventFeeRates, resolveCurrentUserId: () => 'admin',
  }, 'patch');
  return { route, storage, events };
}
it('allows an admin to waive extras only on the selected event', async () => {
  const { route, storage, events } = harness(); const response = routeResponse();
  await route({ params: { id: 'coffee' }, body: { ticketPlatformFeePct: 15, addonPlatformFeePct: 0 } }, response);
  expect(response.statusCode).toBe(200);
  expect(storage.setEventPlatformFees).toHaveBeenCalledWith('coffee', 15, 0, 'admin');
  expect(events.run.addonPlatformFeePct).toBe(5);
});
it('denies non-admins even if they own the event', async () => {
  const { route, storage } = harness(false); const response = routeResponse();
  await route({ params: { id: 'coffee' }, body: { ticketPlatformFeePct: 0, addonPlatformFeePct: 0 } }, response);
  expect(response.statusCode).toBe(403); expect(storage.setEventPlatformFees).not.toHaveBeenCalled();
});
it.each([-1, 101, 3.141, '5', null, undefined, NaN])('rejects an invalid percentage %s', async (value) => {
  const { route, storage } = harness(); const response = routeResponse();
  await route({ params: { id: 'coffee' }, body: { ticketPlatformFeePct: value, addonPlatformFeePct: 0 } }, response);
  expect(response.statusCode).toBe(400); expect(storage.setEventPlatformFees).not.toHaveBeenCalled();
});
it('prevents platform fees that overdraw the agreed venue share', async () => {
  const { route } = harness(); const response = routeResponse();
  await route({ params: { id: 'coffee' }, body: { ticketPlatformFeePct: 5, addonPlatformFeePct: 25 } }, response);
  expect(response.statusCode).toBe(400);
});
