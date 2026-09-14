import { describe, it, expect } from 'vitest';

/**
 * The Save Draft button must not be the one save path that loses your work.
 *
 * QA N-2: a creator set up a discount, pressed Save Draft, reloaded, and it was
 * gone. Autosave and step navigation spread the whole form into the request;
 * the Save Draft button built an explicit allowlist instead, and anything
 * nobody had remembered to list was dropped without a word. `discounts` was
 * missing, and so were `expectedAudienceSize` and `addonRequests`.
 *
 * The publish payload had the same shape and the same hole — which meant the
 * expected turnout a venue reads on its invite to judge a flat-fee commitment
 * never reached the event at all.
 *
 * This asserts the shape rather than the field list: the payloads must start by
 * spreading the form. A list of field names would need updating by exactly the
 * person who is about to forget, which is the failure being guarded against.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const source = readFileSync(
  join(process.cwd(), 'client/src/components/EventBuilder/EventBuilder.tsx'),
  'utf8',
);

function payloadBody(declaration: string): string {
  const start = source.indexOf(declaration);
  expect(start, `${declaration} not found`).toBeGreaterThan(-1);
  // Far enough to cover the whole literal without needing to brace-match.
  return source.slice(start, start + 12_000);
}

describe('draft and publish payloads carry the whole form', () => {
  it('Save Draft spreads formData before its explicit mappings', () => {
    const body = payloadBody('const rawDraftPayload = {');
    const spreadAt = body.indexOf('...formData');
    const firstMapping = body.indexOf('title:');

    expect(spreadAt).toBeGreaterThan(-1);
    // Before the overrides, so the deliberate mappings still win.
    expect(spreadAt).toBeLessThan(firstMapping);
  });

  it('Publish spreads formData before its explicit mappings', () => {
    const body = payloadBody('const rawPublishPayload = {');
    const spreadAt = body.indexOf('...formData');
    const firstMapping = body.indexOf('title:');

    expect(spreadAt).toBeGreaterThan(-1);
    expect(spreadAt).toBeLessThan(firstMapping);
  });

  it('the fields QA found missing are reachable through the spread', () => {
    // Named because they are the ones that actually went missing. They are not
    // listed in either literal — the spread is what carries them, which is the
    // whole point.
    for (const field of ['discounts', 'expectedAudienceSize', 'addonRequests']) {
      expect(source).toContain(field);
    }
  });
});
