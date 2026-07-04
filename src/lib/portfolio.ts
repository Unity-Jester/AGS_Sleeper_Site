import { SleeperPlayersMap } from './types';

export interface PlayerExposure {
  playerId: string;
  name: string;
  position: string;
  count: number; // leagues rostered in
  share: number; // count / total leagues, 0-1
  value: number; // best value seen across leagues (for sorting/display)
}

// Cross-league player exposure: how many of the manager's rosters hold
// each player. The classic dynasty portfolio view.
export function calculateExposure(
  rostersByLeague: string[][],
  players: SleeperPlayersMap,
  values: Map<string, number>
): PlayerExposure[] {
  const totalLeagues = rostersByLeague.length;
  if (totalLeagues === 0) return [];

  const counts = new Map<string, number>();
  for (const roster of rostersByLeague) {
    // A player can only count once per league
    for (const playerId of new Set(roster)) {
      counts.set(playerId, (counts.get(playerId) || 0) + 1);
    }
  }

  const exposure: PlayerExposure[] = [];
  counts.forEach((count, playerId) => {
    const p = players[playerId];
    exposure.push({
      playerId,
      name: p?.full_name || playerId,
      position: p?.position || '',
      count,
      share: count / totalLeagues,
      value: values.get(playerId) || 0,
    });
  });

  // Most-shared first, then most valuable
  exposure.sort((a, b) => b.count - a.count || b.value - a.value);
  return exposure;
}
