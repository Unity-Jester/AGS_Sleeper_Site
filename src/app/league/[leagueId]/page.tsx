import {
  getLeague,
  getLeagueUsers,
  getLeagueRosters,
  getLeagueMatchups,
  getAllSeasonTransactions,
  getNFLState,
  getAllPlayers,
  getSeasonWeeklyMatchups,
  getSeasonDraftMap,
  getTradedPicks,
  pairMatchups,
} from '@/lib/sleeper';
import { finalWeek, lastRegularSeasonWeek, scoredThroughWeek, weekLabel } from '@/lib/leagueWeeks';
import { fetchFantasyCalcValues } from '@/lib/rankings';
import { generateAllReportCards } from '@/lib/tradeAnalysis';
import { fetchHistoricalValues, buildPlayerNameMapping, getCurrentPlayerValue } from '@/lib/historicalValues';
import { estimateScaleFactor } from '@/lib/vault';
import { buildTradeValueMap, buildTransactionValueChangeMap } from '@/lib/transactionValues';
import { FantasyCalcSettings, SleeperTransaction } from '@/lib/types';
import { calculateLuckIndex, calculateWeeklyAwards } from '@/lib/seasonStats';
import ErrorState from '@/components/ErrorState';
import Standings from '@/components/Standings';
import Matchup from '@/components/Matchup';
import TransactionCard from '@/components/TransactionCard';
import PowerRankings from '@/components/PowerRankings';
import LuckIndex from '@/components/LuckIndex';
import WeeklyAwards from '@/components/WeeklyAwards';

export const revalidate = 60; // Revalidate every 60 seconds

function deriveLeagueSettings(
  rosterPositions: string[],
  scoringSettings: Record<string, number>,
  totalRosters: number
): FantasyCalcSettings {
  const qbCount = rosterPositions.filter(
    pos => pos === 'QB' || pos === 'SUPER_FLEX'
  ).length;
  const numQbs: 1 | 2 = qbCount >= 2 ? 2 : 1;

  const recValue = scoringSettings?.rec ?? 1;
  const ppr: 0 | 0.5 | 1 = recValue === 0 ? 0 : recValue === 0.5 ? 0.5 : 1;

  return {
    numQbs,
    ppr,
    numTeams: totalRosters || 12,
  };
}

interface LeaguePageProps {
  params: { leagueId: string };
}

export default async function DashboardPage({ params }: LeaguePageProps) {
  const { leagueId } = params;

  try {
    const [league, users, rosters, nflState, players] = await Promise.all([
      getLeague(leagueId),
      getLeagueUsers(leagueId),
      getLeagueRosters(leagueId),
      getNFLState(),
      getAllPlayers(),
    ]);

    // Determine the display week based on league status. A finished (or
    // past) season shows its championship week, not the NFL's current week.
    const isPreseason = league.status === 'pre_draft' || league.status === 'drafting';
    const lastWeek = finalWeek(league.settings);
    const isLiveSeason = !isPreseason && league.status !== 'complete' && league.season === nflState.season;
    const currentWeek = isPreseason
      ? 1
      : isLiveSeason
        ? Math.min(Math.max(nflState.week || 1, 1), lastWeek)
        : lastWeek;
    // Awards and luck only use weeks Sleeper has finished scoring
    const scoredWeeks = Math.min(scoredThroughWeek(league, nflState), lastRegularSeasonWeek(league.settings));

    // Get status display text
    const getStatusText = () => {
      if (league.status === 'pre_draft') return 'Pre-Draft';
      if (league.status === 'drafting') return 'Drafting';
      if (league.status === 'complete') return 'Season Complete';
      return weekLabel(league.settings, currentWeek);
    };

    const settings = deriveLeagueSettings(
      league.roster_positions || [],
      league.scoring_settings || {},
      league.total_rosters
    );
    const [matchups, transactions, weeklyMatchups, draftMap, historicalData, fcValues, tradedPicks] = await Promise.all([
      getLeagueMatchups(leagueId, currentWeek),
      getAllSeasonTransactions(leagueId, isLiveSeason ? currentWeek : lastWeek),
      isPreseason || scoredWeeks < 1
        ? Promise.resolve([] as Awaited<ReturnType<typeof getSeasonWeeklyMatchups>>)
        : getSeasonWeeklyMatchups(leagueId, scoredWeeks),
      getSeasonDraftMap(leagueId),
      fetchHistoricalValues(),
      fetchFantasyCalcValues(settings),
      getTradedPicks(leagueId).catch(() => []),
    ]);

    const matchupPairs = pairMatchups(matchups, rosters, users);
    const luckRows = calculateLuckIndex(weeklyMatchups);
    const weeklyAwards = calculateWeeklyAwards(weeklyMatchups);

    // Get recent transactions (last 10). Failed waiver claims aren't moves,
    // and a waiver's place in line is when it processed, not when it was
    // claimed.
    const completed = transactions.filter(t => t.status === 'complete');
    const processedAt = (t: SleeperTransaction) => t.status_updated ?? t.created;
    const recentTransactions = [...completed]
      .sort((a, b) => processedAt(b) - processedAt(a))
      .slice(0, 10);

    const { playerValues, pickValues } = fcValues;
    const playerValuesObj = Object.fromEntries(playerValues);
    const pickValuesObj = Object.fromEntries(pickValues);
    const playerMapping = buildPlayerNameMapping(players, historicalData.playerColumns);
    const seasonTrades: SleeperTransaction[] = completed.filter(t => t.type === 'trade');
    // FantasyCalc fallbacks calibrated onto the sheet's scale (see trades page)
    const fcScale = estimateScaleFactor(
      historicalData.values.get(historicalData.dates[0]),
      playerValues,
      playerMapping
    );
    const reportCards = generateAllReportCards(
      seasonTrades,
      rosters,
      users,
      players,
      playerValuesObj,
      pickValuesObj,
      draftMap,
      historicalData,
      playerMapping,
      fcScale
    );
    const tradeValues = buildTradeValueMap(reportCards);
    // Waiver chips on the same scale as trade chips: the sheet's value, or
    // FantasyCalc calibrated onto it for untracked players
    const sheetScaleValues: Record<string, number> = {};
    for (const t of recentTransactions) {
      for (const id of [...Object.keys(t.adds || {}), ...Object.keys(t.drops || {})]) {
        sheetScaleValues[id] =
          getCurrentPlayerValue(id, historicalData, playerMapping) ??
          Math.round((playerValues.get(id) ?? 0) * fcScale);
      }
    }
    const transactionValueChanges = buildTransactionValueChangeMap(recentTransactions, sheetScaleValues);

    return (
      <div className="space-y-8">
        {/* Header */}
        <div>
          <p className="text-[11px] font-sans font-semibold uppercase tracking-[0.2em] text-gold-500 mb-2">
            Dynasty League Hub
          </p>
          <h1 className="text-4xl text-white">{league.name}</h1>
          <p className="text-gray-400 mt-2">
            {league.season} Season &middot; {getStatusText()}
          </p>
          <div className="keyline mt-4" />
        </div>

        {/* Standings - Full Width */}
        <Standings
          rosters={rosters}
          users={users}
          playoffTeams={league.settings.playoff_teams || 6}
        />

        {/* Weekly Awards */}
        {weeklyAwards && (
          <WeeklyAwards awards={weeklyAwards} rosters={rosters} users={users} />
        )}

        {/* Power Rankings */}
        <PowerRankings
          rosters={rosters}
          users={users}
          players={players}
          settings={settings}
          tradedPicks={tradedPicks}
          draftRounds={league.settings.draft_rounds || 4}
        />

        {/* Luck Index */}
        {luckRows.length > 0 && (
          <LuckIndex rows={luckRows} rosters={rosters} users={users} />
        )}

        {/* This Week's Matchups */}
        <div>
          <h2 className="text-xl font-semibold text-white mb-4">
            {isPreseason ? 'Week 1 Matchups (Preview)' : `${weekLabel(league.settings, currentWeek)} Matchups`}
          </h2>
          {isPreseason ? (
            <div className="panel p-8 text-center">
              <p className="text-gray-400">Matchups will be available once the season starts</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {matchupPairs.length > 0 ? (
                matchupPairs.map((matchup) => (
                  <Matchup key={matchup.matchupId} matchup={matchup} players={players} />
                ))
              ) : (
                <p className="text-gray-400 col-span-2">No matchups scheduled</p>
              )}
            </div>
          )}
        </div>

        {/* Recent Activity */}
        <div>
          <h2 className="text-xl font-semibold text-white mb-4">Recent Activity</h2>
          {recentTransactions.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {recentTransactions.map((transaction) => (
                <TransactionCard
                  key={transaction.transaction_id}
                  transaction={transaction}
                  rosters={rosters}
                  users={users}
                  players={players}
                  tradeValues={tradeValues[transaction.transaction_id]}
                  valueChanges={transactionValueChanges[transaction.transaction_id]}
                />
              ))}
            </div>
          ) : (
            <p className="text-gray-400">No recent transactions</p>
          )}
        </div>
      </div>
    );
  } catch (error) {
    console.error('Error loading dashboard:', error);
    return (
      <ErrorState
        title="Error Loading League"
        detail={`Could not load league data for league ${leagueId}. Please check your League ID.`}
        action={{ href: '/start', label: 'Choose a different league' }}
      />
    );
  }
}
