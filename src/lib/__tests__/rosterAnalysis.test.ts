import { describe, it, expect } from 'vitest';
import { analyzeTeamWindows, calculateStarterValue } from '../rosterAnalysis';
import { SleeperRoster, SleeperUser, SleeperPlayersMap } from '../types';

function makePlayers(
  entries: Record<string, { position: string; age: number | null }>
): SleeperPlayersMap {
  const map: Record<string, unknown> = {};
  for (const [id, p] of Object.entries(entries)) {
    map[id] = { player_id: id, full_name: id, position: p.position, age: p.age };
  }
  return map as SleeperPlayersMap;
}

function makeRoster(rosterId: number, ownerId: string, playerIds: string[]): SleeperRoster {
  return {
    roster_id: rosterId,
    owner_id: ownerId,
    players: playerIds,
    settings: { wins: 0, losses: 0, ties: 0, fpts: 0 },
  } as unknown as SleeperRoster;
}

function makeUser(id: string, name: string): SleeperUser {
  return { user_id: id, username: name, display_name: name, avatar: null };
}

describe('calculateStarterValue', () => {
  const lineup = ['QB', 'RB', 'WR', 'FLEX', 'SUPER_FLEX', 'BN', 'BN'];

  it('fills dedicated slots before flexes and picks best remaining', () => {
    const value = calculateStarterValue(
      [
        { id: 'qb1', position: 'QB', value: 5000, age: 25 },
        { id: 'qb2', position: 'QB', value: 3000, age: 30 },
        { id: 'rb1', position: 'RB', value: 4000, age: 24 },
        { id: 'wr1', position: 'WR', value: 6000, age: 23 },
        { id: 'wr2', position: 'WR', value: 2000, age: 27 },
        { id: 'te1', position: 'TE', value: 1500, age: 26 },
        { id: 'bench', position: 'RB', value: 500, age: 29 },
      ],
      lineup
    );
    // QB=5000, RB=4000, WR=6000, FLEX best of (wr2 2000, te1 1500, bench 500)=2000,
    // SUPER_FLEX best remaining incl. qb2=3000
    expect(value).toBe(5000 + 4000 + 6000 + 2000 + 3000);
  });

  it('ignores bench and unknown slots and tolerates empty rosters', () => {
    expect(calculateStarterValue([], lineup)).toBe(0);
  });
});

describe('analyzeTeamWindows', () => {
  const players = makePlayers({
    youngStar: { position: 'WR', age: 23 },
    oldStar: { position: 'WR', age: 31 },
    youngScrub: { position: 'RB', age: 22 },
    oldScrub: { position: 'RB', age: 30 },
    midQb: { position: 'QB', age: 26 },
  });

  const values = new Map([
    ['youngStar', 9000],
    ['oldStar', 9000],
    ['youngScrub', 1000],
    ['oldScrub', 1000],
    ['midQb', 4000],
  ]);

  const rosters = [
    makeRoster(1, 'u1', ['youngStar']), // high value, young -> juggernaut
    makeRoster(2, 'u2', ['oldStar']), // high value, old -> win-now
    makeRoster(3, 'u3', ['youngScrub']), // low value, young -> rebuilding
    makeRoster(4, 'u4', ['oldScrub']), // low value, old -> teardown
  ];
  const users = ['u1', 'u2', 'u3', 'u4'].map(u => makeUser(u, `Team ${u}`));
  const lineup = ['QB', 'RB', 'WR', 'FLEX'];

  it('assigns quadrant verdicts from league-relative value and age', () => {
    const result = analyzeTeamWindows(rosters, users, players, values, lineup);
    const byId = new Map(result.map(t => [t.rosterId, t]));

    expect(byId.get(1)!.verdict).toBe('juggernaut');
    expect(byId.get(2)!.verdict).toBe('win-now');
    expect(byId.get(3)!.verdict).toBe('rebuilding');
    expect(byId.get(4)!.verdict).toBe('teardown');
  });

  it('ranks teams by total value and computes starter/bench split', () => {
    const result = analyzeTeamWindows(
      [makeRoster(1, 'u1', ['youngStar', 'youngScrub', 'oldScrub']), makeRoster(2, 'u2', ['oldStar'])],
      users,
      players,
      values,
      ['WR', 'RB'] // one WR + one RB start
    );
    const team1 = result.find(t => t.rosterId === 1)!;
    expect(team1.valueRank).toBe(1);
    expect(team1.totalValue).toBe(11000);
    expect(team1.starterValue).toBe(9000 + 1000); // WR + best RB
    expect(team1.benchValue).toBe(1000);
  });

  it('computes value-weighted age', () => {
    const result = analyzeTeamWindows(
      [makeRoster(1, 'u1', ['youngStar', 'oldScrub'])],
      users,
      players,
      values,
      ['WR', 'RB']
    );
    // (23*9000 + 30*1000) / 10000 = 23.7
    expect(result[0].weightedAge).toBeCloseTo(23.7);
  });

  it('breaks down value by core position', () => {
    const result = analyzeTeamWindows(
      [makeRoster(1, 'u1', ['youngStar', 'midQb', 'youngScrub'])],
      users,
      players,
      values,
      ['QB', 'WR', 'RB']
    );
    const pv = new Map(result[0].positionValues.map(p => [p.position, p.value]));
    expect(pv.get('WR')).toBe(9000);
    expect(pv.get('QB')).toBe(4000);
    expect(pv.get('RB')).toBe(1000);
    expect(pv.get('TE')).toBe(0);
  });
});
