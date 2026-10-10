import { describe, it, expect } from 'vitest';
import { findStartupDraftId, fitDraftSlotValues, gradeDraftPicks } from '../draftValues';

describe('findStartupDraftId', () => {
  const draft = (id: string, time: number, playerType = 0) => ({
    draft_id: id,
    start_time: time,
    created: time,
    settings: { player_type: playerType },
  });

  it('returns the earliest draft', () => {
    expect(findStartupDraftId([draft('rookie25', 300, 1), draft('startup', 100), draft('rookie24', 200, 1)])).toBe('startup');
  });

  it('returns null when the earliest draft is rookies-only', () => {
    expect(findStartupDraftId([draft('rookie24', 100, 1), draft('rookie25', 200, 1)])).toBeNull();
  });

  it('returns null with no drafts', () => {
    expect(findStartupDraftId([])).toBeNull();
  });
});

describe('fitDraftSlotValues', () => {
  it('expects more from earlier picks and centers the class on zero', () => {
    const values = [9000, 6000, 7000, 3000, 4000, 2500, 1000, 1500, 500, 800, 0, 300].map(v => v + 1000);
    const picks = values.map((currentValue, i) => ({ pickNo: i + 1, currentValue }));
    const { expected, sigma } = fitDraftSlotValues(picks);

    expect(expected[0]).toBeGreaterThan(expected[5]);
    expect(expected[5]).toBeGreaterThan(expected[11]);
    expect(expected.every(e => e >= 0)).toBe(true);
    expect(sigma).toBeGreaterThan(0);

    const totalDiff = values.reduce((s, v, i) => s + v - expected[i], 0);
    expect(Math.abs(totalDiff)).toBeLessThan(values.length); // rounding only (no slot floored at 0)
  });

  it('handles an empty or flat class', () => {
    expect(fitDraftSlotValues([])).toEqual({ expected: [], sigma: 1 });
    const flat = fitDraftSlotValues([1, 2, 3].map(pickNo => ({ pickNo, currentValue: 500 })));
    expect(flat.expected).toEqual([500, 500, 500]);
    expect(flat.sigma).toBe(1);
  });
});

describe('gradeDraftPicks', () => {
  it('grades by value over expected relative to the draft spread', () => {
    expect(gradeDraftPicks([{ valueDiff: 2000, sigma: 1000 }])).toBe('A+');
    expect(gradeDraftPicks([{ valueDiff: 0, sigma: 1000 }])).toBe('B-');
    expect(gradeDraftPicks([{ valueDiff: -500, sigma: 1000 }])).toBe('C');
    expect(gradeDraftPicks([{ valueDiff: -2000, sigma: 1000 }])).toBe('F');
  });

  it('combines picks by their total against the combined spread', () => {
    // +600 over four picks of spread 1000 each → 600 / 2000 = 0.3
    const picks = Array.from({ length: 4 }, () => ({ valueDiff: 150, sigma: 1000 }));
    expect(gradeDraftPicks(picks)).toBe('B');
  });

  it('treats no picks as average', () => {
    expect(gradeDraftPicks([])).toBe('B-');
  });
});
