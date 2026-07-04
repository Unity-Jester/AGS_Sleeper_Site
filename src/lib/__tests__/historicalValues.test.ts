import { describe, it, expect } from 'vitest';
import {
  findClosestDate,
  buildPlayerNameMapping,
  getHistoricalPlayerValue,
  getCurrentPlayerValue,
  getHistoricalPickValue,
  getCurrentPickValue,
  HistoricalValueData,
} from '../historicalValues';
import { SleeperPlayersMap } from '../types';

// Dates are stored newest-first, matching the sheet format
const DATES = ['2025-06-01', '2025-05-01', '2025-04-01', '2025-03-01'];

function makeData(overrides?: Partial<HistoricalValueData>): HistoricalValueData {
  const values = new Map<string, Map<string, number>>();
  values.set('2025-06-01', new Map([
    ['Justin Jefferson', 9000],
    ['2026 Mid 1st', 5500],
  ]));
  values.set('2025-05-01', new Map([
    ['Justin Jefferson', 9500],
    ['2026 Mid 1st', 5000],
  ]));
  values.set('2025-04-01', new Map([
    ['Justin Jefferson', 8800],
    ['2026 Mid 1st', 4800],
  ]));
  values.set('2025-03-01', new Map([
    ['Justin Jefferson', 8000],
    ['2026 Mid 1st', 4500],
  ]));

  return {
    dates: DATES,
    pickColumns: ['2026 Mid 1st'],
    playerColumns: ['Justin Jefferson'],
    values,
    ...overrides,
  };
}

function ts(date: string): number {
  return new Date(`${date}T12:00:00Z`).getTime();
}

describe('findClosestDate', () => {
  it('returns null for empty date list', () => {
    expect(findClosestDate(ts('2025-05-01'), [])).toBeNull();
  });

  it('returns newest date when target is after all dates', () => {
    expect(findClosestDate(ts('2025-12-25'), DATES)).toBe('2025-06-01');
  });

  it('returns oldest date when target is before all dates', () => {
    expect(findClosestDate(ts('2024-01-01'), DATES)).toBe('2025-03-01');
  });

  it('returns exact match when target date exists', () => {
    expect(findClosestDate(ts('2025-05-01'), DATES)).toBe('2025-05-01');
  });

  it('returns the closer of two surrounding dates', () => {
    // 2025-05-25 is closer to 2025-06-01 than to 2025-05-01
    expect(findClosestDate(ts('2025-05-25'), DATES)).toBe('2025-06-01');
    // 2025-05-05 is closer to 2025-05-01
    expect(findClosestDate(ts('2025-05-05'), DATES)).toBe('2025-05-01');
  });
});

describe('buildPlayerNameMapping', () => {
  function makePlayers(entries: Record<string, string>): SleeperPlayersMap {
    const map: Record<string, { full_name: string }> = {};
    for (const [id, name] of Object.entries(entries)) {
      map[id] = { full_name: name };
    }
    return map as unknown as SleeperPlayersMap;
  }

  it('matches exact names', () => {
    const mapping = buildPlayerNameMapping(
      makePlayers({ '100': 'Justin Jefferson' }),
      ['Justin Jefferson']
    );
    expect(mapping.get('100')).toBe('Justin Jefferson');
  });

  it('matches names differing by punctuation', () => {
    const mapping = buildPlayerNameMapping(
      makePlayers({ '200': "Ja'Marr Chase" }),
      ['JaMarr Chase']
    );
    expect(mapping.get('200')).toBe('JaMarr Chase');
  });

  it('matches names differing by Jr/Sr suffix', () => {
    const mapping = buildPlayerNameMapping(
      makePlayers({ '300': 'Marvin Harrison Jr.' }),
      ['Marvin Harrison']
    );
    expect(mapping.get('300')).toBe('Marvin Harrison');
  });

  it('leaves unmatched players unmapped', () => {
    const mapping = buildPlayerNameMapping(
      makePlayers({ '400': 'Some Unknown Guy' }),
      ['Justin Jefferson']
    );
    expect(mapping.has('400')).toBe(false);
  });
});

describe('historical/current value lookups', () => {
  const data = makeData();
  const mapping = new Map([['100', 'Justin Jefferson']]);

  it('returns player value at the closest date to the trade', () => {
    expect(getHistoricalPlayerValue('100', ts('2025-05-01'), data, mapping)).toBe(9500);
    expect(getHistoricalPlayerValue('100', ts('2025-03-03'), data, mapping)).toBe(8000);
  });

  it('returns null for unmapped players', () => {
    expect(getHistoricalPlayerValue('999', ts('2025-05-01'), data, mapping)).toBeNull();
  });

  it('returns the most recent value as current', () => {
    expect(getCurrentPlayerValue('100', data, mapping)).toBe(9000);
  });

  it('returns pick value at closest date, defaulting to Mid tier', () => {
    expect(getHistoricalPickValue('2026', 1, ts('2025-05-01'), data)).toBe(5000);
  });

  it('returns current pick value from most recent date', () => {
    expect(getCurrentPickValue('2026', 1, data)).toBe(5500);
  });

  it('returns null when data is empty', () => {
    const empty = makeData({ dates: [], values: new Map() });
    expect(getCurrentPlayerValue('100', empty, mapping)).toBeNull();
    expect(getHistoricalPickValue('2026', 1, ts('2025-05-01'), empty)).toBeNull();
  });
});
