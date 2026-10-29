import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import EventInvite, { eventInviteTarget } from '../pages/event-invite';

// /event/<slug> was its own half-page, and the links are already out there —
// Good Soles' WhatsApp community has one behind a tinyurl. They open the full
// event page now, with everything the link arrived with still attached.

let search = '';
const setLocation = vi.fn();
vi.mock('wouter', () => ({
  useRoute: () => [true, { id: 'good-soles-x-bandido-sunday-social-5k-3' }],
  useSearch: () => search,
  useLocation: () => ['/event/good-soles-x-bandido-sunday-social-5k-3', setLocation],
}));

describe('where an old /event/ link goes', () => {
  beforeEach(() => setLocation.mockClear());

  it('opens the full event page', () => {
    expect(eventInviteTarget('sunday-5k', '')).toBe('/experience/sunday-5k');
  });

  it("keeps the organiser's referrer, a partner's codes and a discount", () => {
    expect(eventInviteTarget('sunday-5k', '?ref=130f1fc5')).toBe('/experience/sunday-5k?ref=130f1fc5');
    expect(eventInviteTarget('sunday-5k', '?ref=amunt&share=tok&discount=d1')).toBe('/experience/sunday-5k?ref=amunt&share=tok&discount=d1');
  });

  it("replaces the half page in history, so Back does not bounce through it", () => {
    search = '?ref=130f1fc5-918a-4964-9a04-2696fda2ccfd';
    render(<EventInvite />);
    expect(setLocation).toHaveBeenCalledWith(
      '/experience/good-soles-x-bandido-sunday-social-5k-3?ref=130f1fc5-918a-4964-9a04-2696fda2ccfd',
      { replace: true },
    );
  });
});
