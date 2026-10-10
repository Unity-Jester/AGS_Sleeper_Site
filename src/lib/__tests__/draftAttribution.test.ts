import { describe, it, expect } from 'vitest';
import { resolveDraftedRosters, correctSlotOwners } from '../draftAttribution';

const DRAFT = 1_000;
const tx = (created: number, adds: Record<string, number> | null, drops: Record<string, number> | null, status = 'complete') =>
  ({ status, created, adds, drops });

describe('resolveDraftedRosters', () => {
  it('credits the team that first gives the player up after the draft', () => {
    // Board says roster 11; the player's only move is a trade away from roster 3
    const picks = [{ pick_no: 28, player_id: 'brown', roster_id: 11 }];
    const result = resolveDraftedRosters(picks, DRAFT, [tx(5_000, { brown: 12 }, { brown: 3 })], []);
    expect(result.get(28)).toBe(3);
  });

  it('uses the draft season roster for a player who never moved', () => {
    const picks = [{ pick_no: 4, player_id: 'gibbs', roster_id: 3 }];
    const rosters = [{ roster_id: 2, players: ['gibbs'] }, { roster_id: 3, players: [] }];
    expect(resolveDraftedRosters(picks, DRAFT, [], rosters).get(4)).toBe(2);
  });

  it('ignores moves before the draft and incomplete transactions', () => {
    const picks = [{ pick_no: 1, player_id: 'p', roster_id: 5 }];
    const result = resolveDraftedRosters(
      picks,
      DRAFT,
      [tx(500, null, { p: 9 }), tx(2_000, null, { p: 7 }, 'failed'), tx(3_000, { p: 8 }, { p: 5 })],
      []
    );
    expect(result.get(1)).toBe(5);
  });

  it('keeps the board when the history starts with an add or is missing', () => {
    const picks = [
      { pick_no: 1, player_id: 'a', roster_id: 5 },
      { pick_no: 2, player_id: 'b', roster_id: 6 },
    ];
    const result = resolveDraftedRosters(picks, DRAFT, [tx(2_000, { a: 9 }, null)], []);
    expect(result.get(1)).toBe(5);
    expect(result.get(2)).toBe(6);
  });
});

describe('correctSlotOwners', () => {
  // Three-team, two-round draft. The board swaps slots 2 and 3.
  const board = { '1': 1, '2': 3, '3': 2 };

  it('swaps slots whose picks only fit the other team', () => {
    // Team 2's 1st went to team 1; everything else stayed home
    const tradedPicks = [{ roster_id: 2, round: 1, owner_id: 1 }];
    const picks = [
      { draft_slot: 1, round: 1, drafter: 1 },
      { draft_slot: 2, round: 1, drafter: 1 }, // slot 2 is really team 2's
      { draft_slot: 3, round: 1, drafter: 3 },
      { draft_slot: 1, round: 2, drafter: 1 },
      { draft_slot: 2, round: 2, drafter: 2 },
      { draft_slot: 3, round: 2, drafter: 3 },
    ];
    expect(correctSlotOwners(board, picks, tradedPicks)).toEqual({ '1': 1, '2': 2, '3': 3 });
  });

  it('keeps a board that already fits', () => {
    const picks = [
      { draft_slot: 1, round: 1, drafter: 1 },
      { draft_slot: 2, round: 1, drafter: 3 },
      { draft_slot: 3, round: 1, drafter: 2 },
    ];
    expect(correctSlotOwners(board, picks, [])).toEqual(board);
  });

  it('leaves ambiguous slots as the board has them', () => {
    // Nothing fits slot 2 or 3 uniquely: both picks made by an outside team 9
    const picks = [
      { draft_slot: 1, round: 1, drafter: 1 },
      { draft_slot: 2, round: 1, drafter: 9 },
      { draft_slot: 3, round: 1, drafter: 9 },
    ];
    expect(correctSlotOwners(board, picks, [])).toEqual(board);
  });
});
