import { describe, it, expect } from 'vitest';
import { resolveDraftPickValue, DraftPickValueSources } from '../draftValues';
import { HistoricalValueData } from '../historicalValues';

const T = new Date('2026-07-01T12:00:00Z').getTime();

function makeSheet(entries: Record<string, number>): HistoricalValueData {
  const cols = Object.keys(entries);
  return {
    dates: ['2026-07-01'],
    pickColumns: cols.filter(c => / (Early|Mid|Late) /.test(c)),
    playerColumns: cols.filter(c => !/ (Early|Mid|Late) /.test(c)),
    values: new Map([['2026-07-01', new Map(Object.entries(entries))]]),
  };
}

function makeSources(overrides?: Partial<DraftPickValueSources>): DraftPickValueSources {
  return {
    historicalData: makeSheet({
      'Justin Jefferson': 9000,
      '2026 Mid 1st': 4581,
      '2026 Early 1st': 5554,
    }),
    playerMapping: new Map([['vet1', 'Justin Jefferson']]),
    fcPlayerValues: new Map([
      ['rookie1', 7278],
      ['rookie2', 3494],
    ]),
    fcPickValues: new Map([
      ['2026 Pick 1.01', 6893],
      ['2026 Pick 1.05', 3285],
      ['2026 1st', 2990],
    ]),
    ...overrides,
  };
}

describe('resolveDraftPickValue', () => {
  it('uses the sheet for both sides when the player is in the sheet', () => {
    const r = resolveDraftPickValue(
      { season: '2026', round: 1, pickInRound: 5, tier: 'Mid', draftTime: T, playerId: 'vet1' },
      makeSources()
    );
    expect(r.source).toBe('sheet');
    expect(r.pickValue).toBe(4581);
    expect(r.currentValue).toBe(9000);
  });

  it('never mixes sheet pick values with FantasyCalc player values', () => {
    // rookie2 is unknown to the sheet: both sides must come from FantasyCalc
    const r = resolveDraftPickValue(
      { season: '2026', round: 1, pickInRound: 5, tier: 'Mid', draftTime: T, playerId: 'rookie2' },
      makeSources()
    );
    expect(r.source).toBe('fantasycalc');
    expect(r.pickValue).toBe(3285); // exact slot 1.05, not the sheet's 4581
    expect(r.currentValue).toBe(3494);
    // The whole point: a mid-first rookie shouldn't be deep underwater
    expect(r.currentValue - r.pickValue).toBeGreaterThan(-500);
  });

  it('zero-pads the FantasyCalc slot key', () => {
    const r = resolveDraftPickValue(
      { season: '2026', round: 1, pickInRound: 1, tier: 'Early', draftTime: T, playerId: 'rookie1' },
      makeSources()
    );
    expect(r.pickValue).toBe(6893); // "2026 Pick 1.01"
  });

  it('falls back to the FantasyCalc round value when the slot is missing', () => {
    const r = resolveDraftPickValue(
      { season: '2026', round: 1, pickInRound: 9, tier: 'Late', draftTime: T, playerId: 'rookie1' },
      makeSources()
    );
    expect(r.source).toBe('fantasycalc');
    expect(r.pickValue).toBe(2990); // "2026 1st"
  });

  it('estimates when no source knows the pick', () => {
    const r = resolveDraftPickValue(
      { season: '2019', round: 2, pickInRound: 3, tier: 'Mid', draftTime: T, playerId: 'ghost' },
      makeSources({ fcPickValues: new Map() })
    );
    expect(r.source).toBe('estimate');
    expect(r.pickValue).toBe(4000); // legacy round-2 estimate
    expect(r.currentValue).toBe(0);
  });

  it('keeps sheet current value with estimated pick for pre-sheet seasons', () => {
    // Sheet knows the veteran but has no 2019 pick columns
    const r = resolveDraftPickValue(
      { season: '2019', round: 1, pickInRound: 2, tier: 'Early', draftTime: T, playerId: 'vet1' },
      makeSources()
    );
    expect(r.currentValue).toBe(9000);
    expect(r.pickValue).toBe(7000); // legacy round-1 estimate
    expect(r.source).toBe('estimate');
  });
});
