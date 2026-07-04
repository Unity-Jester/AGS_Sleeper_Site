import { describe, it, expect } from 'vitest';
import { calculateExposure } from '../portfolio';
import { SleeperPlayersMap } from '../types';

const players = {
  a: { player_id: 'a', full_name: 'Alpha Back', position: 'RB' },
  b: { player_id: 'b', full_name: 'Beta Wideout', position: 'WR' },
  c: { player_id: 'c', full_name: 'Gamma End', position: 'TE' },
} as unknown as SleeperPlayersMap;

const values = new Map([
  ['a', 5000],
  ['b', 8000],
  ['c', 1000],
]);

describe('calculateExposure', () => {
  it('counts leagues per player and sorts by count then value', () => {
    const result = calculateExposure(
      [
        ['a', 'b'],
        ['a', 'c'],
        ['b'],
      ],
      players,
      values
    );
    expect(result.map(r => r.playerId)).toEqual(['b', 'a', 'c']); // b ties a on count(2), wins on value
    expect(result[0].share).toBeCloseTo(2 / 3);
    expect(result[2].count).toBe(1);
  });

  it('counts a player once per league even if duplicated', () => {
    const result = calculateExposure([['a', 'a']], players, values);
    expect(result[0].count).toBe(1);
  });

  it('handles empty portfolios', () => {
    expect(calculateExposure([], players, values)).toEqual([]);
  });
});
