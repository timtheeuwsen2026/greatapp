import { describe, it, expect } from 'vitest';
import { readableError } from '@/lib/queryClient';

// Found by clicking, on the real site: posting a flash deal on blocked dates
// showed the venue owner the raw response body, JSON braces and all.

describe('readableError', () => {
  it('pulls the sentence out of an apiRequest failure', () => {
    const error = new Error('409: {"message":"Those dates are blocked on your calendar. Free them up first, or pick dates you can actually host.","conflicts":[{"startDate":"2026-10-27T00:00:00.000Z"}]}');
    expect(readableError(error)).toBe(
      'Those dates are blocked on your calendar. Free them up first, or pick dates you can actually host.',
    );
  });

  it('leaves a plain-text body alone', () => {
    expect(readableError(new Error('500: Internal Server Error'))).toBe('Internal Server Error');
  });

  it('reads an { error } body too', () => {
    expect(readableError(new Error('400: {"error":"Bad request"}'))).toBe('Bad request');
  });

  it('never shows raw JSON to a person', () => {
    const out = readableError(new Error('409: {"message":"Nope","conflicts":[1,2,3]}'));
    expect(out).not.toMatch(/[{}\[\]"]/);
  });

  it('falls back when there is nothing to read', () => {
    expect(readableError(new Error(''), 'Could not post that deal')).toBe('Could not post that deal');
    expect(readableError(undefined, 'Could not post that deal')).toBe('Could not post that deal');
  });

  it('handles a JSON body with no message field', () => {
    expect(readableError(new Error('500: {"code":"boom"}'))).toBe('{"code":"boom"}');
  });
});
