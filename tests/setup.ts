import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// Cleanup after each test
afterEach(() => {
  cleanup();
});

// Mock environment variables
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/test';
process.env.SESSION_SECRET = 'test-secret';

// Browser layout APIs used by Radix and Embla are not implemented by jsdom.
// Keep these faithful enough for component behaviour without leaking mocks
// into individual acceptance tests.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(() => false),
  })),
});

Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
  configurable: true,
  value: vi.fn(),
});

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

class IntersectionObserverMock {
  readonly root = null;
  readonly rootMargin = '0px';
  readonly thresholds = [0];
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() { return []; }
}

Object.defineProperty(globalThis, 'ResizeObserver', { writable: true, value: ResizeObserverMock });
Object.defineProperty(globalThis, 'IntersectionObserver', { writable: true, value: IntersectionObserverMock });
