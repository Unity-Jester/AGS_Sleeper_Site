// Trade calculator math: consolidation adjustment, pick ownership and
// projected draft slot, and the fairness band. Kept free of React so it can
// be tested directly.

import { pickRoundLabel } from './utils';

export type PickTier = 'Early' | 'Mid' | 'Late';

// ---------------------------------------------------------------------------
// Value adjustment (consolidation premium)
// ---------------------------------------------------------------------------

export interface ValueAdjustment {
  // Premium added to each side, in the order given (at most one is > 0)
  adjustments: number[];
  // Raw totals plus adjustments
  adjustedTotals: number[];
}

// Two mid-level pieces are rarely worth one star: the side getting the
// best player only has one roster spot to fill, the other has to find room
// for the extras. Line both sides up best-to-worst; every piece the bigger
// side has beyond the smaller side's count is a depth piece, and counts for
// value × √(value / best asset in the trade). The value those depth pieces
// lose is credited to the side receiving fewer pieces, so a throw-in 4th
// barely moves the needle while a near-equal second starter still counts
// for most of its value.
export function calculateValueAdjustment(sideA: number[], sideB: number[]): ValueAdjustment {
  const a = [...sideA].sort((x, y) => y - x);
  const b = [...sideB].sort((x, y) => y - x);
  const totals = [sum(a), sum(b)];
  const top = Math.max(0, ...a, ...b);

  if (top <= 0 || a.length === b.length || a.length === 0 || b.length === 0) {
    return { adjustments: [0, 0], adjustedTotals: totals };
  }

  const [longer, shorterIdx] = a.length > b.length ? [a, 1] : [b, 0];
  const extras = longer.slice(Math.min(a.length, b.length));
  const premium = Math.round(
    extras.reduce((s, v) => s + v * (1 - Math.sqrt(Math.max(0, v) / top)), 0)
  );

  const adjustments = [0, 0];
  adjustments[shorterIdx] = premium;
  return {
    adjustments,
    adjustedTotals: [totals[0] + adjustments[0], totals[1] + adjustments[1]],
  };
}

// ---------------------------------------------------------------------------
// Fairness band
// ---------------------------------------------------------------------------

// A flat percentage is fussy on small trades and loose on big ones: call a
// trade fair within 5% of the bigger side, but never tighter than 300 or
// looser than 1,000.
export function fairTradeBand(biggerSide: number): number {
  return Math.max(300, Math.min(biggerSide * 0.05, 1000));
}

export function isFairTrade(totalA: number, totalB: number): boolean {
  return Math.abs(totalA - totalB) <= fairTradeBand(Math.max(totalA, totalB));
}

// ---------------------------------------------------------------------------
// Pick ownership
// ---------------------------------------------------------------------------

export interface OwnedPick {
  season: string;
  round: number;
  // Team whose draft slot this is (decides where it lands)
  originalRosterId: number;
  // Team holding it now
  ownerRosterId: number;
}

export interface TradedPickRecord {
  season: string;
  round: number;
  roster_id: number; // original owner
  owner_id: number; // current owner
}

// Every team starts with its own pick in each future round; Sleeper's
// traded_picks list then reassigns the ones that changed hands.
export function buildOwnedPicks(
  rosterIds: number[],
  tradedPicks: TradedPickRecord[],
  seasons: string[],
  rounds: number
): OwnedPick[] {
  const owner = new Map<string, number>();
  const key = (season: string, round: number, original: number) => `${season}|${round}|${original}`;

  for (const season of seasons) {
    for (let round = 1; round <= rounds; round++) {
      for (const rosterId of rosterIds) {
        owner.set(key(season, round, rosterId), rosterId);
      }
    }
  }
  for (const t of tradedPicks) {
    const k = key(String(t.season), t.round, t.roster_id);
    if (owner.has(k)) owner.set(k, t.owner_id);
  }

  return Array.from(owner.entries()).map(([k, ownerRosterId]) => {
    const [season, round, original] = k.split('|');
    return {
      season,
      round: Number(round),
      originalRosterId: Number(original),
      ownerRosterId,
    };
  });
}

// ---------------------------------------------------------------------------
// Projected draft slot
// ---------------------------------------------------------------------------

// Where a team's pick should land given its projected finish (1 = best
// team). Only the next draft is projected; rosters turn over too much for
// a finish two or three years out to mean anything, so later picks stay Mid.
export function projectPickTier(
  season: string,
  nextSeason: string,
  projectedFinish: number | undefined,
  numTeams: number
): PickTier {
  if (season !== nextSeason || !projectedFinish || numTeams <= 0) return 'Mid';
  // Best third of the league picks late, worst third picks early
  const third = numTeams / 3;
  if (projectedFinish <= third) return 'Late';
  if (projectedFinish > third * 2) return 'Early';
  return 'Mid';
}

// Early/Late value relative to a Mid pick, per round
export type TierRatios = Record<number, Record<PickTier, number>>;

// Used when the historical sheet has no pick columns to learn from
export const DEFAULT_TIER_RATIOS: TierRatios = {
  1: { Early: 1.25, Mid: 1, Late: 0.8 },
  2: { Early: 1.15, Mid: 1, Late: 0.88 },
  3: { Early: 1.1, Mid: 1, Late: 0.92 },
  4: { Early: 1.08, Mid: 1, Late: 0.94 },
};

// Learn Early/Mid/Late spreads from the historical sheet: use the most
// recent date that prices all three tiers of a class still a year or more
// away (as future picks are when traded), so the ratios reflect how the
// market currently separates slots.
export function deriveTierRatios(
  dates: string[],
  values: Map<string, Map<string, number>>
): TierRatios {
  const ratios: TierRatios = JSON.parse(JSON.stringify(DEFAULT_TIER_RATIOS));

  for (let round = 1; round <= 4; round++) {
    const label = pickRoundLabel(round);
    for (const date of dates) {
      const row = values.get(date);
      if (!row) continue;
      const seasons = new Set<string>();
      row.forEach((_, col) => {
        const m = /^(\d{4}) Mid /.exec(col);
        if (m && m[1] > date.slice(0, 4)) seasons.add(m[1]);
      });
      const season = Array.from(seasons).sort().pop();
      if (!season) continue;
      const early = row.get(`${season} Early ${label}`);
      const mid = row.get(`${season} Mid ${label}`);
      const late = row.get(`${season} Late ${label}`);
      if (early && mid && late) {
        ratios[round] = { Early: early / mid, Mid: 1, Late: late / mid };
        break;
      }
    }
  }
  return ratios;
}

export function tieredPickValue(
  season: string,
  round: number,
  tier: PickTier,
  pickValues: Record<string, number>,
  ratios: TierRatios
): number {
  const base = pickValues[`${season} ${pickRoundLabel(round)}`] || 0;
  const ratio = ratios[round]?.[tier] ?? 1;
  return Math.round(base * ratio);
}

// ---------------------------------------------------------------------------
// Net change per team
// ---------------------------------------------------------------------------

// Each team receives the assets in its column and gives up what the other
// columns receive. Two teams: A's change is A - B exactly. With three, who
// sends what to whom isn't recorded, so each team is assumed to fund the
// other columns evenly. Changes sum to zero across the trade.
export function netChanges(received: number[]): number[] {
  const n = received.length;
  if (n < 2) return received.map(() => 0);
  const total = sum(received);
  return received.map(r => r - (total - r) / (n - 1));
}

function sum(values: number[]): number {
  return values.reduce((s, v) => s + v, 0);
}
