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

interface SlotPickRef {
  draft_slot: number;
  round: number;
  // Team that actually made the pick (see resolveDraftedRosters)
  drafter: number;
}

interface DraftTradedPickRef {
  roster_id: number; // original owner
  round: number;
  owner_id: number; // owner at draft time
}

// Correct a draft's slot -> original-owner map.
//
// The same departed-manager problem scrambles slot_to_roster_id: in this
// league's 2023 draft, slots 4 and 12 point at each other's teams. A slot
// belongs to original owner O only if, in every round, the team holding
// O's pick at draft time (the draft's traded_picks) is the team that made
// the pick in that slot. Board entries that pass keep their owner; failing
// slots are reassigned when exactly one unclaimed owner fits, and left as
// they were otherwise.
export function correctSlotOwners(
  slotToRoster: Record<string, number>,
  picks: SlotPickRef[],
  tradedPicks: DraftTradedPickRef[]
): Record<string, number> {
  const holder = new Map<string, number>();
  for (const t of tradedPicks) holder.set(`${t.roster_id}|${t.round}`, t.owner_id);
  const holderOf = (original: number, round: number) => holder.get(`${original}|${round}`) ?? original;

  const picksBySlot = new Map<string, SlotPickRef[]>();
  for (const p of picks) {
    const slot = String(p.draft_slot);
    if (!picksBySlot.has(slot)) picksBySlot.set(slot, []);
    picksBySlot.get(slot)!.push(p);
  }
  const fits = (slot: string, original: number) =>
    (picksBySlot.get(slot) || []).every(p => holderOf(original, p.round) === p.drafter);

  const result: Record<string, number> = {};
  const claimed = new Set<number>();
  for (const [slot, original] of Object.entries(slotToRoster)) {
    if (picksBySlot.has(slot) && fits(slot, original)) {
      result[slot] = original;
      claimed.add(original);
    }
  }

  const owners = Array.from(new Set(Object.values(slotToRoster)));
  let progress = true;
  while (progress) {
    progress = false;
    for (const slot of Object.keys(slotToRoster)) {
      if (slot in result) continue;
      const candidates = owners.filter(o => !claimed.has(o) && fits(slot, o));
      if (candidates.length === 1) {
        result[slot] = candidates[0];
        claimed.add(candidates[0]);
        progress = true;
      }
    }
  }

  for (const [slot, original] of Object.entries(slotToRoster)) {
    if (!(slot in result)) result[slot] = original;
  }
  return result;
}
