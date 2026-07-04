import { SleeperRoster, SleeperUser, SleeperPlayersMap } from './types';
import { getTeamName } from './utils';

export type WindowVerdict = 'juggernaut' | 'win-now' | 'retooling' | 'rebuilding' | 'teardown';

export interface PositionValue {
  position: string;
  value: number;
}

export interface TeamWindow {
  rosterId: number;
  ownerId: string;
  teamName: string;
  avatar: string | null;
  totalValue: number;
  starterValue: number;
  benchValue: number;
  weightedAge: number | null; // value-weighted average age
  positionValues: PositionValue[]; // QB/RB/WR/TE + Other, descending
  verdict: WindowVerdict;
  valueRank: number; // 1 = most valuable roster
}

// Which player positions can fill each starting slot
const SLOT_ELIGIBILITY: Record<string, string[]> = {
  QB: ['QB'],
  RB: ['RB'],
  WR: ['WR'],
  TE: ['TE'],
  K: ['K'],
  DEF: ['DEF'],
  FLEX: ['RB', 'WR', 'TE'],
  WRRB_FLEX: ['WR', 'RB'],
  REC_FLEX: ['WR', 'TE'],
  SUPER_FLEX: ['QB', 'RB', 'WR', 'TE'],
  IDP_FLEX: ['DL', 'LB', 'DB'],
  DL: ['DL'],
  LB: ['LB'],
  DB: ['DB'],
};

const CORE_POSITIONS = ['QB', 'RB', 'WR', 'TE'];

interface ValuedPlayer {
  id: string;
  position: string;
  value: number;
  age: number | null;
}

// Fill the league's starting lineup with the highest-value eligible
// players. Restrictive slots (QB) claim players before flexible ones
// (SUPER_FLEX) so flexes get what's left, mirroring how managers think
// about "starter value".
export function calculateStarterValue(
  players: ValuedPlayer[],
  rosterPositions: string[]
): number {
  const slots = rosterPositions
    .filter(slot => SLOT_ELIGIBILITY[slot])
    .sort((a, b) => SLOT_ELIGIBILITY[a].length - SLOT_ELIGIBILITY[b].length);

  const available = [...players].sort((a, b) => b.value - a.value);
  let starterValue = 0;

  for (const slot of slots) {
    const eligible = SLOT_ELIGIBILITY[slot];
    const idx = available.findIndex(p => eligible.includes(p.position));
    if (idx !== -1) {
      starterValue += available[idx].value;
      available.splice(idx, 1);
    }
  }

  return starterValue;
}

// Assign a window verdict from league-relative value and age.
// Value splits at the league median; a band around the value median is
// "retooling" (could go either way). Age splits at the league median.
function assignVerdict(
  totalValue: number,
  weightedAge: number | null,
  valueMedian: number,
  ageMedian: number,
  valueSpread: number
): WindowVerdict {
  const nearMedian = Math.abs(totalValue - valueMedian) < valueSpread * 0.08;
  if (nearMedian) return 'retooling';

  const strong = totalValue > valueMedian;
  const young = weightedAge === null ? true : weightedAge <= ageMedian;

  if (strong && young) return 'juggernaut';
  if (strong && !young) return 'win-now';
  if (!strong && young) return 'rebuilding';
  return 'teardown';
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function analyzeTeamWindows(
  rosters: SleeperRoster[],
  users: SleeperUser[],
  players: SleeperPlayersMap,
  playerValues: Map<string, number>,
  rosterPositions: string[]
): TeamWindow[] {
  const teams = rosters.map(roster => {
    const user = users.find(u => u.user_id === roster.owner_id) || null;

    const valued: ValuedPlayer[] = (roster.players || []).map(id => {
      const p = players[id];
      return {
        id,
        position: p?.position || 'Unknown',
        value: playerValues.get(id) || 0,
        age: p?.age ?? null,
      };
    });

    const totalValue = valued.reduce((sum, p) => sum + p.value, 0);
    const starterValue = calculateStarterValue(valued, rosterPositions);

    // Value-weighted age over players that carry both an age and value
    let ageWeight = 0;
    let ageSum = 0;
    for (const p of valued) {
      if (p.age !== null && p.value > 0) {
        ageWeight += p.value;
        ageSum += p.age * p.value;
      }
    }
    const weightedAge = ageWeight > 0 ? ageSum / ageWeight : null;

    const posMap = new Map<string, number>();
    for (const p of valued) {
      if (p.value <= 0) continue;
      const key = CORE_POSITIONS.includes(p.position) ? p.position : 'Other';
      posMap.set(key, (posMap.get(key) || 0) + p.value);
    }
    const positionValues = [
      ...CORE_POSITIONS.map(pos => ({ position: pos, value: posMap.get(pos) || 0 })),
      ...(posMap.has('Other') ? [{ position: 'Other', value: posMap.get('Other')! }] : []),
    ];

    return {
      rosterId: roster.roster_id,
      ownerId: roster.owner_id,
      teamName: getTeamName(user, roster.roster_id),
      avatar: user?.avatar || null,
      totalValue,
      starterValue,
      benchValue: totalValue - starterValue,
      weightedAge,
      positionValues,
      verdict: 'retooling' as WindowVerdict, // assigned below
      valueRank: 0,
    };
  });

  const values = teams.map(t => t.totalValue);
  const valueMedian = median(values);
  const valueSpread = Math.max(...values) - Math.min(...values) || 1;
  const ageMedian = median(
    teams.filter(t => t.weightedAge !== null).map(t => t.weightedAge as number)
  );

  for (const team of teams) {
    team.verdict = assignVerdict(
      team.totalValue,
      team.weightedAge,
      valueMedian,
      ageMedian,
      valueSpread
    );
  }

  teams.sort((a, b) => b.totalValue - a.totalValue);
  teams.forEach((t, i) => {
    t.valueRank = i + 1;
  });

  return teams;
}
