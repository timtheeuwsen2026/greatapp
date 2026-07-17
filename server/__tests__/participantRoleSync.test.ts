import { describe, expect, it } from 'vitest';
import { normalizeBuilderParticipantRoles } from '../participantRoleSync';

describe('participant role synchronization', () => {
  it('maps Event Builder roles into application-ready participant roles', () => {
    expect(normalizeBuilderParticipantRoles('experience-1', [{
      name: 'Photographer',
      required: true,
      headcount: 2,
      notes: 'Capture the run and coffee social',
    }])).toEqual([expect.objectContaining({
      experienceId: 'experience-1',
      name: 'Photographer',
      description: 'Capture the run and coffee social',
      isRequired: true,
      maxCount: 2,
    })]);
  });

  it('ignores blank roles and normalizes invalid headcounts', () => {
    expect(normalizeBuilderParticipantRoles('experience-1', [
      { name: '  ' },
      { title: 'Social Host', headcount: 0 },
    ])).toEqual([expect.objectContaining({ name: 'Social Host', maxCount: 1 })]);
  });
});
