import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A draft that started as an idea opens in the builder, and every autosave from
 * there writes the whole form back. The idea's `concept` has to survive that
 * trip untouched — and the builder, which cannot be rendered here against a
 * database, has to keep letting it through. Asserted on shape for the reason
 * EventBuilderDraftPayload.test does: a list of field names would need
 * updating by exactly the person about to forget.
 */

const source = readFileSync(
  join(process.cwd(), 'client/src/components/EventBuilder/EventBuilder.tsx'),
  'utf8',
);

describe('the builder lets a concept through', () => {
  it('loads a draft by spreading it first, so `concept` is on the form', () => {
    const start = source.indexOf('const normalizeLoadedData = (data: any) => {');
    expect(start).toBeGreaterThan(-1);
    const body = source.slice(start, start + 2_500);
    const returned = body.slice(body.indexOf('return {'));
    // Spread before the explicit mappings, so nothing the draft holds is dropped.
    expect(returned.indexOf('...data')).toBeGreaterThan(-1);
    expect(returned.indexOf('...data')).toBeLessThan(returned.indexOf('requireMinimumParticipants'));
  });

  it('declares `concept` on the form schema, so validation does not strip it', () => {
    expect(source).toMatch(/concept: z\.any\(\)\.optional\(\)\.nullable\(\)/);
  });

  it('shows the idea on the Basics and Dates steps', () => {
    expect(source).toContain("<IdeaSummaryCard concept={form.watch('concept')} />");
    expect(source).toContain("<IdeaPeriodCard concept={form.watch('concept')} startDate={startDate} />");
  });

  it('copes with the nulls an idea draft arrives with', () => {
    // No date yet, so these must stay guarded rather than becoming 1 Jan 1970.
    expect(source).toContain('if (data.startDate) data.startDate = new Date(data.startDate);');
    expect(source).toContain('if (data.endDate) data.endDate = new Date(data.endDate);');
  });
});
