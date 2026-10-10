// Who actually drafted each player.
//
// Sleeper's draft board can credit a pick to the wrong team. When a
// manager who traded picks later leaves the league, the board loses track
// of those trades: in this league's 2023 rookie draft, eight picks
// (Jahmyr Gibbs and Chase Brown among them) sit under the slot's old owner
// instead of the team that made the pick. The league's transactions don't
// have that problem, so the player's own history decides: whichever team
// first gives the player up (trade, drop) after the draft is the team that
// drafted him; a player who never moved belongs to the team rostering him.

interface PickRef {
  pick_no: number;
  player_id: string;
  roster_id: number;
}

interface TransactionRef {
  status: string;
  created: number;
  adds: Record<string, number> | null;
  drops: Record<string, number> | null;
}

interface RosterRef {
  roster_id: number;
  players: string[] | null;
}

// Returns pick_no -> roster that actually made the pick. Picks whose
// history can't be read keep the board's roster.
export function resolveDraftedRosters(
  picks: PickRef[],
  draftTime: number,
  transactions: TransactionRef[],
  draftSeasonRosters: RosterRef[]
): Map<number, number> {
  const after = transactions
    .filter(t => t.status === 'complete' && t.created >= draftTime)
    .sort((a, b) => a.created - b.created);

  // First post-draft move for each player
  const firstMove = new Map<string, { kind: 'add' | 'drop'; rosterId: number }>();
  for (const t of after) {
    for (const [playerId, rosterId] of Object.entries(t.drops || {})) {
      if (!firstMove.has(playerId)) firstMove.set(playerId, { kind: 'drop', rosterId });
    }
    for (const [playerId, rosterId] of Object.entries(t.adds || {})) {
      if (!firstMove.has(playerId)) firstMove.set(playerId, { kind: 'add', rosterId });
    }
  }

  const rosterOf = new Map<string, number>();
  for (const r of draftSeasonRosters) {
    for (const id of r.players || []) rosterOf.set(id, r.roster_id);
  }

  const result = new Map<number, number>();
  for (const pick of picks) {
    const move = firstMove.get(pick.player_id);
    let drafter = pick.roster_id;
    if (move?.kind === 'drop') {
      drafter = move.rosterId;
    } else if (!move && rosterOf.has(pick.player_id)) {
      drafter = rosterOf.get(pick.player_id)!;
    }
    result.set(pick.pick_no, drafter);
  }
  return result;
}
