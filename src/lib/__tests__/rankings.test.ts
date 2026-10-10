import { describe, it, expect } from 'vitest';
import { getDraftPickOptions } from '../rankings';

describe('getDraftPickOptions', () => {
  it('offers every season the market prices, in order', () => {
    const { seasons } = getDraftPickOptions({
      '2029 1st': 4000,
      '2027 1st': 5000,
      '2028 2nd': 2000,
      '2027 Pick 1.01': 7000,
    });
    expect(seasons).toEqual(['2027', '2028', '2029']);
  });

  it('falls back to the next three classes once the rookie draft has passed', () => {
    expect(getDraftPickOptions({}, new Date('2026-10-10')).seasons).toEqual(['2027', '2028', '2029']);
    expect(getDraftPickOptions(undefined, new Date('2026-03-01')).seasons).toEqual(['2026', '2027', '2028']);
  });
});
