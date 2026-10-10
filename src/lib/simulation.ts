import { PlayoffMatchup, SleeperMatchup } from './types';

// ---------------------------------------------------------------------------
// Scoring model estimation
// ---------------------------------------------------------------------------

export interface TeamScoringModel {
  rosterId: number;
  mean: number;
  std: number;
  weeksObserved: number;
}

// Baseline weekly scoring assumptions when little has been played.
const PRIOR_BASE_MEAN = 115;
const PRIOR_VALUE_SPREAD = 30; // best-to-worst roster tilt in points
const PRIOR_STD = 26;
const PRIOR_WEIGHT_WEEKS = 4; // observed weeks needed to outweigh the prior

// Estimate each team's weekly scoring distribution: actual results from
// played weeks, blended with a roster-value prior so odds are sane in
// week 1 (pure prior) and increasingly data-driven as the season runs.
export function estimateScoringModels(
  weeklyMatchups: SleeperMatchup[][],
  rosterValues: Map<number, number>
): Map<number, TeamScoringModel> {
  const scores = new Map<number, number[]>();
  for (const week of weeklyMatchups) {
    if (!week.some(m => (m.points || 0) > 0)) continue;
    for (const m of week) {
      const points = m.points || 0;
      if (points > 0) {
        const list = scores.get(m.roster_id) || [];
        list.push(points);
        scores.set(m.roster_id, list);
      }
    }
  }

  // Roster-value percentile → prior mean
  const rosterIds = [...rosterValues.keys()];
  const sortedValues = [...rosterValues.values()].sort((a, b) => a - b);
  const priorMean = (rosterId: number) => {
    if (sortedValues.length < 2) return PRIOR_BASE_MEAN;
    const value = rosterValues.get(rosterId) || 0;
    const pct = sortedValues.filter(v => v < value).length / (sortedValues.length - 1);
    return PRIOR_BASE_MEAN + PRIOR_VALUE_SPREAD * (pct - 0.5);
  };

  const models = new Map<number, TeamScoringModel>();
  for (const rosterId of rosterIds) {
    const observed = scores.get(rosterId) || [];
    const n = observed.length;

    let mean = priorMean(rosterId);
    let std = PRIOR_STD;

    if (n > 0) {
      const obsMean = observed.reduce((s, v) => s + v, 0) / n;
      const w = n / (n + PRIOR_WEIGHT_WEEKS);
      mean = w * obsMean + (1 - w) * mean;

      if (n >= 4) {
        const variance = observed.reduce((s, v) => s + (v - obsMean) ** 2, 0) / (n - 1);
        const obsStd = Math.sqrt(variance);
        std = w * obsStd + (1 - w) * PRIOR_STD;
      }
    }

    models.set(rosterId, { rosterId, mean, std: Math.max(std, 8), weeksObserved: n });
  }

  return models;
}

// ---------------------------------------------------------------------------
// Monte Carlo season simulation
// ---------------------------------------------------------------------------

export interface SimulationInput {
  models: Map<number, TeamScoringModel>;
  // Current actual standing state
  standings: { rosterId: number; wins: number; ties: number; pointsFor: number }[];
  // Remaining regular-season weeks as roster-id pairings
  remainingWeeks: [number, number][][];
  playoffTeams: number;
  // League plays the weekly median too: top half of scores get a win
  medianGames?: boolean;
  // Weeks per playoff round (two-week rounds sum both weeks' scores);
  // defaults to one week each
  roundLengths?: number[];
  // The real winners bracket once seeds are set: decided games are kept,
  // the rest simulated. Without it, a fixed bracket is built from seeds.
  bracket?: PlayoffMatchup[];
  sims?: number;
  seed?: number;
}

export interface TeamOdds {
  rosterId: number;
  playoffPct: number;
  byePct: number; // seeded into round 2 (byes exist when the field isn't a power of two)
  titlePct: number;
  avgSeed: number | null; // average seed in sims where the team made it
  projectedWins: number;
}

// Deterministic PRNG (mulberry32) so simulations are reproducible/testable
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Box-Muller normal draw
function makeNormal(rand: () => number) {
  return (mean: number, std: number) => {
    const u1 = Math.max(rand(), 1e-12);
    const u2 = rand();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return mean + std * z;
  };
}

// Seed order of a standard fixed bracket: 1v8, 4v5, 2v7, 3v6 for eight
// slots, so the top seed meets the 4/5 winner. Slots seeded beyond the
// field are byes for their opponent. This is Sleeper's bracket.
export function bracketSlots(size: number): number[] {
  let slots = [1];
  while (slots.length < size) {
    const n = slots.length * 2;
    slots = slots.flatMap(seed => [seed, n + 1 - seed]);
  }
  return slots;
}

// Number of top seeds that skip the first round
export function playoffByes(playoffTeams: number): number {
  if (playoffTeams < 2) return 0;
  const size = 2 ** Math.ceil(Math.log2(playoffTeams));
  return size - playoffTeams;
}

type GameSim = (a: number, b: number, round: number) => number;

// Fixed bracket from seeds (no reseeding)
function simulateBracket(seeds: number[], playGame: GameSim): number {
  if (seeds.length === 0) return -1;
  const size = 2 ** Math.ceil(Math.log2(Math.max(seeds.length, 1)));
  let alive: (number | null)[] = bracketSlots(size).map(seed => seeds[seed - 1] ?? null);
  let round = 1;
  while (alive.length > 1) {
    const next: (number | null)[] = [];
    for (let i = 0; i < alive.length; i += 2) {
      const a = alive[i];
      const b = alive[i + 1];
      next.push(a === null ? b : b === null ? a : playGame(a, b, round));
    }
    alive = next;
    round++;
  }
  return alive[0] ?? -1;
}

// The league's real winners bracket: decided games stand, undecided ones
// are simulated in round order; the champion wins the p=1 game
function simulateKnownBracket(bracket: PlayoffMatchup[], playGame: GameSim): number {
  const games = [...bracket].sort((x, y) => (x.r ?? x.round ?? 0) - (y.r ?? y.round ?? 0));
  const winner = new Map<number, number>();
  const loser = new Map<number, number>();
  const resolve = (team: number | null | undefined, from: { w?: number; l?: number } | undefined) =>
    team ?? (from?.w !== undefined ? winner.get(from.w) : from?.l !== undefined ? loser.get(from.l) : undefined);

  let champion = -1;
  for (const g of games) {
    const id = g.m ?? g.matchup_id;
    if (id === undefined) continue;
    const ext = g as PlayoffMatchup & { t1_from?: { w?: number; l?: number }; t2_from?: { w?: number; l?: number } };
    const a = resolve(g.t1 ?? g.team_1_roster_id, ext.t1_from ?? g.team_1_from);
    const b = resolve(g.t2 ?? g.team_2_roster_id, ext.t2_from ?? g.team_2_from);
    if (a === undefined || b === undefined) continue;
    const decided = g.w ?? g.winner_roster_id;
    const w = decided ?? playGame(a, b, g.r ?? g.round ?? 1);
    winner.set(id, w);
    loser.set(id, w === a ? b : a);
    if (g.p === 1) champion = w;
  }
  return champion;
}

export function simulateSeason(input: SimulationInput): TeamOdds[] {
  const sims = input.sims ?? 2000;
  const rand = mulberry32(input.seed ?? 20260704);
  const normal = makeNormal(rand);

  const rosterIds = input.standings.map(s => s.rosterId);
  const playoffCount = new Map<number, number>();
  const byeCount = new Map<number, number>();
  const titleCount = new Map<number, number>();
  const seedSum = new Map<number, number>();
  const winSum = new Map<number, number>();
  for (const id of rosterIds) {
    playoffCount.set(id, 0);
    byeCount.set(id, 0);
    titleCount.set(id, 0);
    seedSum.set(id, 0);
    winSum.set(id, 0);
  }

  const byes = playoffByes(input.playoffTeams);
  const score = (id: number) => {
    const m = input.models.get(id);
    return m ? normal(m.mean, m.std) : 0;
  };
  // A playoff game over the round's weeks (two-week rounds sum both)
  const playGame: GameSim = (a, b, round) => {
    const legs = input.roundLengths?.[round - 1] ?? 1;
    let sa = 0;
    let sb = 0;
    for (let i = 0; i < legs; i++) {
      sa += score(a);
      sb += score(b);
    }
    return sa >= sb ? a : b;
  };

  for (let s = 0; s < sims; s++) {
    const wins = new Map(input.standings.map(t => [t.rosterId, t.wins + t.ties / 2]));
    const pf = new Map(input.standings.map(t => [t.rosterId, t.pointsFor]));

    for (const week of input.remainingWeeks) {
      const weekScores: [number, number][] = [];
      for (const [a, b] of week) {
        if (!input.models.has(a) || !input.models.has(b)) continue;
        const sa = score(a);
        const sb = score(b);
        weekScores.push([a, sa], [b, sb]);
        pf.set(a, (pf.get(a) || 0) + sa);
        pf.set(b, (pf.get(b) || 0) + sb);
        if (sa >= sb) wins.set(a, (wins.get(a) || 0) + 1);
        else wins.set(b, (wins.get(b) || 0) + 1);
      }
      // Median game: the top half of the week's scores each get a win
      if (input.medianGames && weekScores.length > 1) {
        weekScores.sort((x, y) => y[1] - x[1]);
        for (const [id] of weekScores.slice(0, Math.floor(weekScores.length / 2))) {
          wins.set(id, (wins.get(id) || 0) + 1);
        }
      }
    }

    const ranked = [...rosterIds].sort(
      (a, b) => (wins.get(b)! - wins.get(a)!) || (pf.get(b)! - pf.get(a)!)
    );
    const seeds = ranked.slice(0, input.playoffTeams);

    seeds.forEach((id, idx) => {
      playoffCount.set(id, playoffCount.get(id)! + 1);
      seedSum.set(id, seedSum.get(id)! + idx + 1);
      if (idx < byes) {
        byeCount.set(id, byeCount.get(id)! + 1);
      }
    });

    const champion = input.bracket?.length
      ? simulateKnownBracket(input.bracket, playGame)
      : simulateBracket(seeds, playGame);
    if (titleCount.has(champion)) titleCount.set(champion, titleCount.get(champion)! + 1);

    for (const id of rosterIds) {
      winSum.set(id, winSum.get(id)! + wins.get(id)!);
    }
  }

  return rosterIds
    .map(id => {
      const made = playoffCount.get(id)!;
      return {
        rosterId: id,
        playoffPct: (made / sims) * 100,
        byePct: (byeCount.get(id)! / sims) * 100,
        titlePct: (titleCount.get(id)! / sims) * 100,
        avgSeed: made > 0 ? seedSum.get(id)! / made : null,
        projectedWins: winSum.get(id)! / sims,
      };
    })
    .sort((a, b) => b.playoffPct - a.playoffPct || b.titlePct - a.titlePct);
}
