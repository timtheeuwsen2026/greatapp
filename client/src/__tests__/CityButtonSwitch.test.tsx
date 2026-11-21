import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Tim, bug 2: switching the city changed the heading only. Signed in, the
// account's old city was copied straight back over every pick until a refresh.

let authState: any;
const apiRequest = vi.fn(async () => ({ json: async () => ({}) }));
const refreshUser = vi.fn(async () => null);

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => authState }));
vi.mock('@/lib/queryClient', () => ({ apiRequest: (...args: any[]) => apiRequest(...(args as [])) }));

import { useCity, resetCityStateForTests } from '@/hooks/useCity';

let pick: (city: string) => void = () => {};

function Shown({ label }: { label: string }) {
  const { city, setCity } = useCity();
  pick = setCity;
  return <p data-testid={label}>{city}</p>;
}

function renderBoth() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, queryFn: async () => ({ city: null }) } } });
  return render(
    <QueryClientProvider client={client}>
      {/* The city button and the page under it read the same choice. */}
      <Shown label="button" />
      <Shown label="cards" />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  resetCityStateForTests();
  apiRequest.mockClear();
  refreshUser.mockClear();
  authState = { user: { id: 'u1', preferredCity: 'Amsterdam' }, isAuthenticated: true, isLoading: false, refreshUser };
});

describe('the city button, signed in', () => {
  it('takes the account city on a new device', () => {
    renderBoth();
    expect(screen.getByTestId('button')).toHaveTextContent('Amsterdam');
  });

  it('switches Amsterdam to Barcelona and back at once, everywhere, without a refresh', async () => {
    renderBoth();
    await act(async () => pick('Barcelona'));
    expect(screen.getByTestId('button')).toHaveTextContent('Barcelona');
    expect(screen.getByTestId('cards')).toHaveTextContent('Barcelona');
    expect(apiRequest).toHaveBeenCalledWith('PUT', '/api/me/city', { city: 'Barcelona' });
    expect(refreshUser).toHaveBeenCalled();

    await act(async () => pick('Amsterdam'));
    expect(screen.getByTestId('button')).toHaveTextContent('Amsterdam');
    expect(screen.getByTestId('cards')).toHaveTextContent('Amsterdam');
  });

  it('remembers the choice in this browser', async () => {
    renderBoth();
    await act(async () => pick('Barcelona'));
    expect(window.localStorage.getItem('great.city')).toBe('Barcelona');
  });

  it('still follows a change made on another device', async () => {
    const view = renderBoth();
    await act(async () => pick('Barcelona'));
    authState = { ...authState, user: { id: 'u1', preferredCity: 'Barcelona' } };
    view.unmount();
    renderBoth();
    expect(screen.getAllByTestId('button').at(-1)).toHaveTextContent('Barcelona');

    // Later the account says Amsterdam (picked on a phone): this browser follows.
    authState = { ...authState, user: { id: 'u1', preferredCity: 'Amsterdam' } };
    renderBoth();
    expect(screen.getAllByTestId('button').at(-1)).toHaveTextContent('Amsterdam');
  });
});

describe('the city button, signed out', () => {
  it('switches at once and saves nothing to an account', async () => {
    authState = { user: null, isAuthenticated: false, isLoading: false, refreshUser };
    renderBoth();
    await act(async () => pick('Barcelona'));
    expect(screen.getByTestId('button')).toHaveTextContent('Barcelona');
    expect(apiRequest).not.toHaveBeenCalled();
  });
});
