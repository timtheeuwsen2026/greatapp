import { it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EmbeddedPricingCalculator from '../components/embedded-pricing-calculator';
vi.mock('@/hooks/usePlatformFee', () => ({ usePlatformFee: () => 15 }));

it('shows each part of a coffee-only sale, with no zero-margin dead end', async () => {
  render(<EmbeddedPricingCalculator />);
  const user = userEvent.setup();
  const set = async (id: string, value: string) => {
    const input = screen.getByTestId(id);
    await user.clear(input);
    await user.type(input, value);
    await user.tab();
  };
  await set('input-earnings-ticket-price', '0');
  await set('input-earnings-capacity', '1');
  await set('input-earnings-deal-value', '80');
  await user.click(screen.getByTestId('switch-earnings-addon'));
  await set('input-earnings-addon-venue-price', '7.75');
  expect(screen.getByTestId('earnings-line-addon_gross').textContent).toContain('7.75');
  expect(screen.getByTestId('earnings-line-addon_venue_payout').textContent).toContain('6.20');
  expect(screen.getByTestId('earnings-line-platform_fee').textContent).toContain('1.16');
  expect(screen.getByTestId('text-earnings-net').textContent).toContain('0.39');
  expect(screen.queryByTestId('input-earnings-addon-margin')).toBeNull();
});
