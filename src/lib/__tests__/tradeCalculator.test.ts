import { describe, it, expect } from 'vitest';
import {
  calculateValueAdjustment,
  fairTradeBand,
  isFairTrade,
  buildOwnedPicks,
  projectPickTier,
  deriveTierRatios,
  tieredPickValue,
  netChanges,
  DEFAULT_TIER_RATIOS,
} from '../tradeCalculator';

describe('calculateValueAdjustment', () => {
  it('credits the consolidating side for the other side’s depth pieces', () => {
    // One 6K star for two 3K players: the second 3K counts for 3000·√0.5
    const { adjustments, adjustedTotals } = calculateValueAdjustment([6000], [3000, 3000]);
    expect(adjustments).toEqual([879, 0]);
    expect(adjustedTotals).toEqual([6879, 6000]);
  });

  it('barely counts a small throw-in', () => {
    const { adjustments } = calculateValueAdjustment([5000, 800], [5500]);
    // 800 piece in a trade topped by 5.5K keeps ~38% of its value
    expect(adjustments[1]).toBe(495);
    expect(adjustments[0]).toBe(0);
  });

  it('leaves equal piece counts and empty sides alone', () => {
    expect(calculateValueAdjustment([4000, 1000], [3000, 2000]).adjustments).toEqual([0, 0]);
    expect(calculateValueAdjustment([], [3000]).adjustments).toEqual([0, 0]);
  });
});

describe('fair trade band', () => {
  it('is 5% of the bigger side, clamped to 300-1000', () => {
    expect(fairTradeBand(2000)).toBe(300);
    expect(fairTradeBand(10000)).toBe(500);
    expect(fairTradeBand(40000)).toBe(1000);
  });

  it('judges fairness by the band', () => {
    expect(isFairTrade(2000, 1750)).toBe(true);
    expect(isFairTrade(30000, 28800)).toBe(false);
  });
});

describe('buildOwnedPicks', () => {
  it('gives every team its own picks, then applies trades', () => {
    const picks = buildOwnedPicks(
      [1, 2],
      [
        { season: '2027', round: 1, roster_id: 1, owner_id: 2 },
        { season: '2026', round: 1, roster_id: 2, owner_id: 1 }, // past class, ignored
      ],
      ['2027'],
      2
    );
    expect(picks).toHaveLength(4);
    expect(picks.find(p => p.round === 1 && p.originalRosterId === 1)?.ownerRosterId).toBe(2);
    expect(picks.find(p => p.round === 2 && p.originalRosterId === 1)?.ownerRosterId).toBe(1);
  });
});

describe('projectPickTier', () => {
  it('projects the next class by finish and leaves later classes at Mid', () => {
    expect(projectPickTier('2027', '2027', 1, 12)).toBe('Late');
    expect(projectPickTier('2027', '2027', 6, 12)).toBe('Mid');
    expect(projectPickTier('2027', '2027', 12, 12)).toBe('Early');
    expect(projectPickTier('2028', '2027', 12, 12)).toBe('Mid');
    expect(projectPickTier('2027', '2027', undefined, 12)).toBe('Mid');
  });
});

describe('tier ratios', () => {
  it('learns ratios from the latest date pricing a future class', () => {
    const values = new Map([
      ['2026-09-01', new Map([['2026 Early 1st', 9000], ['2026 Mid 1st', 3000], ['2026 Late 1st', 1000]])],
      ['2025-09-01', new Map([['2026 Early 1st', 6000], ['2026 Mid 1st', 5000], ['2026 Late 1st', 4000]])],
    ]);
    const ratios = deriveTierRatios(['2026-09-01', '2025-09-01'], values);
    expect(ratios[1]).toEqual({ Early: 1.2, Mid: 1, Late: 0.8 });
    expect(ratios[2]).toEqual(DEFAULT_TIER_RATIOS[2]);
  });

  it('scales the generic round value', () => {
    expect(tieredPickValue('2027', 1, 'Early', { '2027 1st': 3000 }, DEFAULT_TIER_RATIOS)).toBe(3750);
    expect(tieredPickValue('2027', 1, 'Mid', { '2027 1st': 3000 }, DEFAULT_TIER_RATIOS)).toBe(3000);
  });
});

describe('netChanges', () => {
  it('is the full difference in a two-team trade', () => {
    expect(netChanges([6000, 4000])).toEqual([2000, -2000]);
  });

  it('sums to zero in a three-team trade', () => {
    const changes = netChanges([3000, 2000, 1000]);
    expect(changes.reduce((s, c) => s + c, 0)).toBeCloseTo(0);
    expect(changes[0]).toBe(1500);
  });
});
