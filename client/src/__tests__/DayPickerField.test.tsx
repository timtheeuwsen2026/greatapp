import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DayPickerField, { dateToDay, dayToDate } from '../components/CreateFlow/DayPickerField';

// The idea phase deals in calendar days held as plain YYYY-MM-DD strings, so the
// picker must hand back exactly the day that was clicked — never the day UTC
// would call it.

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 14, 10, 0));
});
afterEach(() => vi.useRealTimers());

describe('day conversion', () => {
  it('round-trips a day without shifting it', () => {
    for (const day of ['2026-10-31', '2026-01-01', '2026-12-31', '2028-02-29']) {
      expect(dateToDay(dayToDate(day)!)).toBe(day);
    }
  });

  it('reads the local calendar day, not the UTC one', () => {
    // 00:30 local on the 31st is still the 30th in UTC for anyone east of it.
    expect(dateToDay(new Date(2026, 9, 31, 0, 30))).toBe('2026-10-31');
    expect(dateToDay(new Date(2026, 9, 31, 23, 30))).toBe('2026-10-31');
  });

  it('refuses anything that is not a plain day', () => {
    expect(dayToDate('')).toBeUndefined();
    expect(dayToDate('31/10/2026')).toBeUndefined();
    expect(dayToDate('2026-10-31T12:00:00Z')).toBeUndefined();
  });
});

describe('DayPickerField', () => {
  it('shows the placeholder when empty and the chosen day when set', () => {
    const { rerender } = render(<DayPickerField value="" onChange={() => {}} placeholder="Start date" data-testid="f" />);
    expect(screen.getByTestId('f')).toHaveTextContent('Start date');
    rerender(<DayPickerField value="2026-10-31" onChange={() => {}} placeholder="Start date" data-testid="f" />);
    expect(screen.getByTestId('f')).toHaveTextContent('31 Oct 2026');
  });

  it('hands back the day that was clicked', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<DayPickerField value="" min="2026-10-14" onChange={onChange} placeholder="Start date" data-testid="f" />);

    await user.click(screen.getByTestId('f'));
    const calendar = await screen.findByRole('grid');
    await user.click(within(calendar).getByRole('gridcell', { name: '25' }));

    expect(onChange).toHaveBeenCalledWith('2026-10-25');
  });

  it('will not offer days before the earliest', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<DayPickerField value="" min="2026-10-14" onChange={onChange} placeholder="Start date" data-testid="f" />);

    await user.click(screen.getByTestId('f'));
    const calendar = await screen.findByRole('grid');
    const past = within(calendar).getByRole('gridcell', { name: '10' });
    expect(past).toBeDisabled();
    await user.click(past);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('offers a clear button only when asked, and only with a value', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(
      <DayPickerField value="2026-10-31" onChange={onChange} placeholder="End" data-testid="f" />,
    );
    expect(screen.queryByTestId('f-clear')).not.toBeInTheDocument();

    rerender(<DayPickerField value="" clearable onChange={onChange} placeholder="End" data-testid="f" />);
    expect(screen.queryByTestId('f-clear')).not.toBeInTheDocument();

    rerender(<DayPickerField value="2026-10-31" clearable onChange={onChange} placeholder="End" data-testid="f" />);
    await user.click(screen.getByTestId('f-clear'));
    expect(onChange).toHaveBeenCalledWith('');
  });
});
