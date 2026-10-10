// Draft scoring.
//
// A pick is judged against what that draft slot typically produced in the
// same draft class, not against the pick's market price on draft day.
// Pricing picks on draft day mixed scales (sheet pick prices, flat legacy
// estimates, FantasyCalc player values) and charged every pick the
// rookie-hype premium, so nearly every pick in the league scored negative.
// Comparing players from the same class on one market (FantasyCalc, now)
// keeps the scale consistent and centers each draft on zero.

// The league's startup draft is its first completed draft, unless that
// draft was rookies-only (player_type 1), which means rosters were
// imported and the league never held a startup. Startup picks are drafted
// on a different curve (veterans and rookies together), so they're left
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

export interface DraftSlotFit {
  // Expected current value for each pick, in the order given
  expected: number[];
  // Typical miss from the expected value in this draft; scales grades so a
  // whiffed 4th-rounder costs far less than a whiffed 1.01
  sigma: number;
}

// Fit expected value by slot for one draft class: value ≈ a + b·ln(pick_no),
// least squares over the class's current values, floored at zero.
export function fitDraftSlotValues(
  picks: Array<{ pickNo: number; currentValue: number }>
): DraftSlotFit {
  const n = picks.length;
  if (n === 0) return { expected: [], sigma: 1 };

  const xs = picks.map(p => Math.log(Math.max(1, p.pickNo)));
  const ys = picks.map(p => p.currentValue);
  const meanX = xs.reduce((s, x) => s + x, 0) / n;
  const meanY = ys.reduce((s, y) => s + y, 0) / n;

  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - meanX) * (ys[i] - meanY);
    sxx += (xs[i] - meanX) ** 2;
  }
  const slope = sxx > 0 ? sxy / sxx : 0;
  const intercept = meanY - slope * meanX;

  const expected = xs.map(x => Math.max(0, Math.round(intercept + slope * x)));
  const sigma = Math.sqrt(ys.reduce((s, y, i) => s + (y - expected[i]) ** 2, 0) / n) || 1;

  return { expected, sigma };
}

export type DraftGrade = 'A+' | 'A' | 'A-' | 'B+' | 'B' | 'B-' | 'C+' | 'C' | 'C-' | 'D' | 'F';

// Minimum score (value over expected, in units of the draft's typical
// miss) for each grade; an average pick lands at B-
const GRADE_THRESHOLDS: Array<[number, DraftGrade]> = [
  [1.5, 'A+'],
  [1.0, 'A'],
  [0.65, 'A-'],
  [0.35, 'B+'],
  [0.1, 'B'],
  [-0.1, 'B-'],
  [-0.35, 'C+'],
  [-0.65, 'C'],
  [-1.0, 'C-'],
  [-1.5, 'D'],
];

// Letter grade for one pick or a group of picks (a manager's class, or
// every pick they've made). Summed value over expected is scaled by the
// combined spread of those picks, so a long run of small wins and one big
// hit are weighed on the same footing.
export function gradeDraftPicks(picks: Array<{ valueDiff: number; sigma: number }>): DraftGrade {
  const diff = picks.reduce((s, p) => s + p.valueDiff, 0);
  const spread = Math.sqrt(picks.reduce((s, p) => s + p.sigma ** 2, 0));
  const score = spread > 0 ? diff / spread : 0;
  for (const [min, grade] of GRADE_THRESHOLDS) {
    if (score >= min) return grade;
  }
  return 'F';
}
