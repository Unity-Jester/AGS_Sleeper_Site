import { describe, it, expect } from 'vitest';
import { analyzeTrade, generateAllReportCards, calculateRawScore } from '../tradeAnalysis';
import {
  SleeperTransaction,
  SleeperRoster,
  SleeperUser,
  SleeperPlayersMap,
  TradePick,
} from '../types';

// Players with age: null make estimateHistoricalValue return the current value
// unchanged when created is "now", keeping expectations deterministic.
function makePlayers(entries: Record<string, { name: string; position: string }>): SleeperPlayersMap {
  const map: Record<string, unknown> = {};
  for (const [id, p] of Object.entries(entries)) {
    map[id] = { player_id: id, full_name: p.name, position: p.position, age: null };
  }
  return map as SleeperPlayersMap;
}

const PLAYERS = makePlayers({
  p1: { name: 'Star Receiver', position: 'WR' },
  p2: { name: 'Depth Back', position: 'RB' },
  p3: { name: 'Solid Tightend', position: 'TE' },
  p4: { name: 'Young Quarterback', position: 'QB' },
  p5: { name: 'Rising Wideout', position: 'WR' },
  p6: { name: 'Flex Runner', position: 'RB' },
});

// Values chosen so avg net stays under the ±1650 raw-score clamp,
// keeping curve ordering deterministic in the report card tests.
const PLAYER_VALUES: Record<string, number> = {
  p1: 3000,
  p2: 1000,
  p3: 980,
  p4: 5000,
  p5: 2000,
  p6: 1200,
};

const PICK_VALUES: Record<string, number> = {
  '2026 1st': 5000,
  '2026 2nd': 2500,
};

function makeTrade(overrides: Partial<SleeperTransaction>): SleeperTransaction {
  return {
    transaction_id: 't1',
    type: 'trade',
    status: 'complete',
    roster_ids: [1, 2],
    adds: null,
    drops: null,
    draft_picks: [],
    waiver_budget: [],
    settings: null,
    created: Date.now(),
    creator: 'u1',
    consenter_ids: [1, 2],
    leg: 1,
    metadata: null,
    ...overrides,
  } as SleeperTransaction;
}

function makeRoster(rosterId: number, ownerId: string): SleeperRoster {
  return {
    roster_id: rosterId,
    owner_id: ownerId,
    settings: { wins: 0, losses: 0, ties: 0, fpts: 0 },
    players: [],
    starters: [],
  } as unknown as SleeperRoster;
}

function makeUser(id: string, name: string): SleeperUser {
  return { user_id: id, username: name, display_name: name, avatar: null };
}

const emptyPickMap = new Map<string, never>();

describe('analyzeTrade', () => {
  it('computes win for the roster receiving more value', () => {
    const trade = makeTrade({ adds: { p1: 1, p2: 2 } });
    const analysis = analyzeTrade(trade, 1, PLAYERS, PLAYER_VALUES, PICK_VALUES, emptyPickMap);

    expect(analysis).not.toBeNull();
    expect(analysis!.received.players).toHaveLength(1);
    expect(analysis!.received.players[0].name).toBe('Star Receiver');
    expect(analysis!.received.totalValue.current).toBe(3000);
    expect(analysis!.given.totalValue.current).toBe(1000);
    expect(analysis!.result).toBe('win');
  });

  it('computes loss from the other side of the same trade', () => {
    const trade = makeTrade({ adds: { p1: 1, p2: 2 } });
    const analysis = analyzeTrade(trade, 2, PLAYERS, PLAYER_VALUES, PICK_VALUES, emptyPickMap);
    expect(analysis!.result).toBe('loss');
  });

  it('treats trades within 5% as a push', () => {
    // p2 (1000) vs p3 (980): 2% difference
    const trade = makeTrade({ adds: { p2: 1, p3: 2 } });
    const analysis = analyzeTrade(trade, 1, PLAYERS, PLAYER_VALUES, PICK_VALUES, emptyPickMap);
    expect(analysis!.result).toBe('push');
  });

  it('values received picks using fallback pick values', () => {
    const pick: TradePick = {
      season: '2026',
      round: 1,
      roster_id: 2,
      previous_owner_id: 2,
      owner_id: 1,
    };
    const trade = makeTrade({ adds: { p1: 2 }, draft_picks: [pick] });
    const analysis = analyzeTrade(trade, 1, PLAYERS, PLAYER_VALUES, PICK_VALUES, emptyPickMap);

    expect(analysis!.received.picks).toHaveLength(1);
    expect(analysis!.received.picks[0].value.current).toBe(5000);
    expect(analysis!.given.players[0].id).toBe('p1');
    // 5000 received vs 3000 given
    expect(analysis!.result).toBe('win');
  });

  it('returns null for rosters not involved in the trade', () => {
    const trade = makeTrade({ adds: { p1: 1, p2: 2 } });
    expect(analyzeTrade(trade, 3, PLAYERS, PLAYER_VALUES, PICK_VALUES, emptyPickMap)).toBeNull();
  });

  it('analyzes 3-team trades from each roster perspective', () => {
    // Roster 1 sends p2 to roster 2 and receives p1 from roster 3.
    // Roster 2 sends p3 to roster 3 and receives p2.
    // Roster 3 sends p1 and receives p3.
    const trade = makeTrade({
      roster_ids: [1, 2, 3],
      adds: { p1: 1, p2: 2, p3: 3 },
      drops: { p1: 3, p2: 1, p3: 2 },
    });

    const forRoster1 = analyzeTrade(trade, 1, PLAYERS, PLAYER_VALUES, PICK_VALUES, emptyPickMap);
    expect(forRoster1).not.toBeNull();
    expect(forRoster1!.received.totalValue.current).toBe(3000); // p1
    expect(forRoster1!.given.totalValue.current).toBe(1000); // p2
    expect(forRoster1!.result).toBe('win');

    const forRoster3 = analyzeTrade(trade, 3, PLAYERS, PLAYER_VALUES, PICK_VALUES, emptyPickMap);
    expect(forRoster3!.received.totalValue.current).toBe(980); // p3
    expect(forRoster3!.given.totalValue.current).toBe(3000); // p1
    expect(forRoster3!.result).toBe('loss');
  });
});

describe('calculateRawScore', () => {
  it('returns neutral 50 for zero trades', () => {
    expect(calculateRawScore(0, 0)).toBe(50);
    expect(calculateRawScore(9999, 0)).toBe(50);
  });

  it('scales with average net value and clamps to [0, 100]', () => {
    expect(calculateRawScore(0, 5)).toBe(50);
    expect(calculateRawScore(330, 5)).toBeCloseTo(60);
    expect(calculateRawScore(100000, 5)).toBe(100);
    expect(calculateRawScore(-100000, 5)).toBe(0);
  });
});

describe('generateAllReportCards', () => {
  const rosters = [1, 2, 3, 4].map(i => makeRoster(i, `u${i}`));
  const users = [1, 2, 3, 4].map(i => makeUser(`u${i}`, `Manager ${i}`));

  it('curves grades so the best trader gets A+ and worst gets F', () => {
    const trades = [
      // Roster 1 clearly beats roster 2 (+1000 net)
      makeTrade({ transaction_id: 't1', roster_ids: [1, 2], adds: { p5: 1, p2: 2 } }),
      // Roster 3 slightly beats roster 4 (+220 net)
      makeTrade({ transaction_id: 't2', roster_ids: [3, 4], adds: { p6: 3, p3: 4 } }),
    ];

    const cards = generateAllReportCards(trades, rosters, users, PLAYERS, PLAYER_VALUES, PICK_VALUES);
    const byRoster = new Map(cards.map(c => [c.rosterId, c]));

    expect(byRoster.get(1)!.grade).toBe('A+');
    expect(byRoster.get(2)!.grade).toBe('F');
    expect(byRoster.get(1)!.wins).toBe(1);
    expect(byRoster.get(2)!.losses).toBe(1);
    // Cards sorted by score descending
    expect(cards[0].rosterId).toBe(1);
  });

  it('gives non-trading teams a neutral C', () => {
    const trades = [
      makeTrade({ transaction_id: 't1', roster_ids: [1, 2], adds: { p5: 1, p2: 2 } }),
    ];
    const cards = generateAllReportCards(trades, rosters, users, PLAYERS, PLAYER_VALUES, PICK_VALUES);
    const byRoster = new Map(cards.map(c => [c.rosterId, c]));

    expect(byRoster.get(3)!.grade).toBe('C');
    expect(byRoster.get(3)!.totalTrades).toBe(0);
    expect(byRoster.get(4)!.grade).toBe('C');
  });
});
