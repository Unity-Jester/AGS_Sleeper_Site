import { describe, it, expect } from 'vitest';
import {
  normalizePlayerName,
  pickRoundLabel,
  getTeamName,
  parseCSVLine,
  ordinalSuffix,
} from '../utils';
import { SleeperUser } from '../types';

describe('normalizePlayerName', () => {
  it('lowercases and strips punctuation and spaces', () => {
    expect(normalizePlayerName("Ja'Marr Chase")).toBe('jamarrchase');
    expect(normalizePlayerName('A.J. Brown')).toBe('ajbrown');
  });

  it('strips generational suffixes', () => {
    expect(normalizePlayerName('Marvin Harrison Jr.')).toBe('marvinharrison');
    expect(normalizePlayerName('Will Fuller V')).toBe('willfuller');
    expect(normalizePlayerName('Jeff Wilson III')).toBe('jeffwilson');
  });

  it('does not strip suffix-like endings of real names', () => {
    expect(normalizePlayerName('David Sr Smith')).toBe('davidsrsmith');
  });
});

describe('pickRoundLabel', () => {
  it('labels rounds 1-3 exactly and clamps later rounds to 4th', () => {
    expect(pickRoundLabel(1)).toBe('1st');
    expect(pickRoundLabel(2)).toBe('2nd');
    expect(pickRoundLabel(3)).toBe('3rd');
    expect(pickRoundLabel(4)).toBe('4th');
    expect(pickRoundLabel(5)).toBe('4th');
  });
});

describe('getTeamName', () => {
  const user = {
    user_id: 'u1',
    username: 'cooluser',
    display_name: 'Cool User',
    avatar: null,
    metadata: { team_name: 'The Squad' },
  } as SleeperUser;

  it('prefers custom team name, then display name, then username', () => {
    expect(getTeamName(user, 1)).toBe('The Squad');
    expect(getTeamName({ ...user, metadata: {} }, 1)).toBe('Cool User');
    expect(getTeamName({ ...user, metadata: {}, display_name: '' }, 1)).toBe('cooluser');
    expect(getTeamName(null, 7)).toBe('Team 7');
  });
});

describe('parseCSVLine', () => {
  it('splits on commas outside quotes', () => {
    expect(parseCSVLine('a,b,c')).toEqual(['a', 'b', 'c']);
    expect(parseCSVLine('"a,b",c')).toEqual(['a,b', 'c']);
    expect(parseCSVLine('a,,c')).toEqual(['a', '', 'c']);
  });
});

describe('ordinalSuffix', () => {
  it('handles teens and ordinary numbers', () => {
    expect(ordinalSuffix(1)).toBe('1st');
    expect(ordinalSuffix(2)).toBe('2nd');
    expect(ordinalSuffix(3)).toBe('3rd');
    expect(ordinalSuffix(11)).toBe('11th');
    expect(ordinalSuffix(12)).toBe('12th');
    expect(ordinalSuffix(21)).toBe('21st');
  });
});

describe('truncateName', () => {
  it('never splits surrogate pairs or flags', async () => {
    const { truncateName } = await import('../utils');
    const name = 'Bless em 🙏🇨🇱 dynasty';
    const cut = truncateName(name, 11);
    expect(cut).not.toContain('�');
    // no lone surrogates
    expect(() => encodeURIComponent(cut)).not.toThrow();
    expect(truncateName('short', 10)).toBe('short');
  });
});
