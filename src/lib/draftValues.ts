import {
  HistoricalValueData,
  getHistoricalPickValue,
  getCurrentPlayerValue,
} from './historicalValues';
import { pickRoundLabel } from './utils';

export interface DraftPickValueSources {
  historicalData: HistoricalValueData;
  playerMapping: Map<string, string>;
  fcPlayerValues: Map<string, number>;
  fcPickValues: Map<string, number>;
}

export interface ResolvedPickValue {
  pickValue: number;
  currentValue: number;
  source: 'sheet' | 'fantasycalc' | 'estimate';
}

// Legacy fallback when no source prices the pick
function estimatePickValue(round: number): number {
  const values: Record<number, number> = {
    1: 7000,
    2: 4000,
    3: 2000,
    4: 1000,
    5: 500,
  };
  return values[round] || 250;
}

// Resolve a drafted pick's cost and the drafted player's current value.
//
// The invariant here is that BOTH numbers come from the same market.
// Pick values from the historical sheet compared against player values
// from FantasyCalc (or vice versa) are different scales, which made a
// fresh rookie class look like a board full of busts: the sheet doesn't
// track new rookies, so their current values fell back to FantasyCalc
// while pick costs stayed on the sheet's pricier generic buckets.
export function resolveDraftPickValue(
  args: {
    season: string;
    round: number;
    pickInRound: number;
    tier: 'Early' | 'Mid' | 'Late';
    draftTime: number;
    playerId: string;
  },
  sources: DraftPickValueSources
): ResolvedPickValue {
  const sheetCurrent = getCurrentPlayerValue(
    args.playerId,
    sources.historicalData,
    sources.playerMapping
  );

  // Player tracked by the sheet: price the pick on the sheet too
  if (sheetCurrent != null && sheetCurrent > 0) {
    const sheetPick = getHistoricalPickValue(
      args.season,
      args.round,
      args.draftTime,
      sources.historicalData,
      args.tier
    );
    if (sheetPick != null && sheetPick > 0) {
      return { pickValue: sheetPick, currentValue: sheetCurrent, source: 'sheet' };
    }
    // Sheet knows the player but has no pick columns for this season
    // (pre-2024 drafts): fall back to the legacy estimate scale.
    return {
      pickValue: estimatePickValue(args.round),
      currentValue: sheetCurrent,
      source: 'estimate',
    };
  }

  // Player unknown to the sheet (typically a fresh rookie class): stay
  // entirely inside FantasyCalc. Prefer the exact slot ("2026 Pick 1.07"),
  // then the generic round ("2026 1st").
  const fcCurrent = sources.fcPlayerValues.get(args.playerId) ?? 0;
  const slotKey = `${args.season} Pick ${args.round}.${String(args.pickInRound).padStart(2, '0')}`;
  const roundKey = `${args.season} ${pickRoundLabel(args.round)}`;
  const fcPick = sources.fcPickValues.get(slotKey) ?? sources.fcPickValues.get(roundKey);

  if (fcPick != null && fcPick > 0) {
    return { pickValue: fcPick, currentValue: fcCurrent, source: 'fantasycalc' };
  }

  return {
    pickValue: estimatePickValue(args.round),
    currentValue: fcCurrent,
    source: 'estimate',
  };
}

// The league's startup draft is its first completed draft, unless that
// draft was rookies-only (player_type 1), which means rosters were
// imported and the league never held a startup. Startup picks are priced
// against rookie-pick values they were never traded at, so they're left
// out of draft scoring.
export function findStartupDraftId(
  drafts: Array<{
    draft_id: string;
    start_time?: number | null;
    created: number;
    settings?: { player_type?: number } | null;
  }>
): string | null {
  if (drafts.length === 0) return null;
  const first = drafts.reduce((a, b) =>
    (b.start_time || b.created) < (a.start_time || a.created) ? b : a
  );
  return first.settings?.player_type === 1 ? null : first.draft_id;
}

export type DraftGrade = 'A+' | 'A' | 'A-' | 'B+' | 'B' | 'B-' | 'C+' | 'C' | 'C-' | 'D' | 'F';

const GRADE_THRESHOLDS: Array<[number, DraftGrade]> = [
  [2.0, 'A+'],
  [1.6, 'A'],
  [1.3, 'A-'],
  [1.15, 'B+'],
  [1.0, 'B'],
  [0.85, 'B-'],
  [0.7, 'C+'],
  [0.55, 'C'],
  [0.4, 'C-'],
  [0.25, 'D'],
];

// Letter grade from the return on the pick: what the player is worth now
// relative to what the pick cost. Works the same for a single pick or a
// manager's whole class (pass the totals).
export function gradeDraftValue(pickValue: number, currentValue: number): DraftGrade {
  if (pickValue <= 0) return currentValue > 0 ? 'A+' : 'C';
  const ratio = currentValue / pickValue;
  for (const [min, grade] of GRADE_THRESHOLDS) {
    if (ratio >= min) return grade;
  }
  return 'F';
}
