import { describe, it, expect } from 'vitest';
import {
  playoffRoundCount,
  playoffRoundWeeks,
  finalWeek,
  lastRegularSeasonWeek,
  scoredThroughWeek,
  playoffRoundOfWeek,
  weekLabel,
  playoffGameLabel,
  firstRoundByes,
} from '../leagueWeeks';

// This league: 6-team playoffs from week 14 with a two-week championship
const twoWeekFinal = { playoff_week_start: 14, playoff_teams: 6, playoff_round_type: 1 };
const oneWeekRounds = { playoff_week_start: 15, playoff_teams: 4, playoff_round_type: 0 };
const twoWeekRounds = { playoff_week_start: 14, playoff_teams: 4, playoff_round_type: 2 };

describe('playoff weeks', () => {
  it('counts rounds from the playoff field', () => {
    expect(playoffRoundCount(twoWeekFinal)).toBe(3);
    expect(playoffRoundCount(oneWeekRounds)).toBe(2);
    expect(playoffRoundCount({ ...twoWeekFinal, playoff_teams: 8 })).toBe(3);
  });

  it('lays out round weeks for each round type', () => {
    expect(playoffRoundWeeks(twoWeekFinal, 1)).toEqual([14]);
    expect(playoffRoundWeeks(twoWeekFinal, 3)).toEqual([16, 17]);
    expect(playoffRoundWeeks(oneWeekRounds, 2)).toEqual([16]);
    expect(playoffRoundWeeks(twoWeekRounds, 2)).toEqual([16, 17]);
  });

  it('finds the final and last regular-season weeks', () => {
    expect(finalWeek(twoWeekFinal)).toBe(17);
    expect(finalWeek(oneWeekRounds)).toBe(16);
    expect(finalWeek(twoWeekRounds)).toBe(17);
    expect(lastRegularSeasonWeek(twoWeekFinal)).toBe(13);
  });

  it('labels weeks', () => {
    expect(weekLabel(twoWeekFinal, 9)).toBe('Week 9');
    expect(weekLabel(twoWeekFinal, 15)).toBe('Playoffs Rd 2');
    expect(weekLabel(twoWeekFinal, 17)).toBe('Championship (Wk 2)');
    expect(playoffRoundOfWeek(twoWeekFinal, 13)).toBeNull();
  });
});

describe('scoredThroughWeek', () => {
  const league = (settings: object, status = 'in_season') =>
    ({ status, season: '2026', settings: { ...twoWeekFinal, ...settings } }) as never;

  it("trusts Sleeper's last scored week", () => {
    expect(scoredThroughWeek(league({ last_scored_leg: 4 }))).toBe(4);
    expect(scoredThroughWeek(league({ last_scored_leg: 17 }, 'complete'))).toBe(17);
  });

  it('falls back to the season state', () => {
    expect(scoredThroughWeek(league({}, 'complete'))).toBe(17);
    expect(scoredThroughWeek(league({}), { season: '2026', week: 5 })).toBe(4);
    expect(scoredThroughWeek(league({}), { season: '2027', week: 1 })).toBe(0);
  });
});

describe('playoff games', () => {
  // This league's 2025 brackets
  const winners = [
    { m: 1, r: 1, t1: 6, t2: 2, w: 6, l: 2 },
    { m: 2, r: 1, t1: 9, t2: 7, w: 9, l: 7 },
    { m: 3, r: 2, t1: 12, t2: 6, w: 12, l: 6, t2_from: { w: 1 } },
    { m: 4, r: 2, t1: 3, t2: 9, w: 3, l: 9, t2_from: { w: 2 } },
    { m: 5, r: 2, p: 5, t1: 2, t2: 7, w: 7, l: 2, t1_from: { l: 1 }, t2_from: { l: 2 } },
    { m: 6, r: 3, p: 1, t1: 12, t2: 3, w: 12, l: 3, t1_from: { w: 3 }, t2_from: { w: 4 } },
    { m: 7, r: 3, p: 3, t1: 6, t2: 9, w: 6, l: 9, t1_from: { l: 3 }, t2_from: { l: 4 } },
  ];
  const losers = [{ m: 1, r: 1, t1: 5, t2: 8, w: 5, l: 8 }];

  it('names games by round and placement', () => {
    expect(playoffGameLabel(twoWeekFinal, 14, 2, 6, winners, losers)).toBe('Quarterfinal');
    expect(playoffGameLabel(twoWeekFinal, 15, 12, 6, winners, losers)).toBe('Semifinal');
    expect(playoffGameLabel(twoWeekFinal, 15, 2, 7, winners, losers)).toBe('5th Place');
    expect(playoffGameLabel(twoWeekFinal, 17, 3, 12, winners, losers)).toBe('Championship (Wk 2)');
    expect(playoffGameLabel(twoWeekFinal, 16, 9, 6, winners, losers)).toBe('3rd Place (Wk 1)');
    expect(playoffGameLabel(twoWeekFinal, 14, 8, 5, winners, losers)).toBe('Consolation');
    expect(playoffGameLabel(twoWeekFinal, 9, 8, 5, winners, losers)).toBeNull();
  });

  it('finds first-round byes', () => {
    expect(firstRoundByes(winners)).toEqual([12, 3]);
  });
});
