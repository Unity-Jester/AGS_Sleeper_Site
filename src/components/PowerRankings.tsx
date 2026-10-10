import { SleeperRoster, SleeperUser, SleeperPlayersMap, FantasyCalcSettings } from '@/lib/types';
import type { TradedPickRecord } from '@/lib/tradeCalculator';
import { getUserAvatarUrl, getUserByOwnerId } from '@/lib/sleeper';
import {
  fetchFantasyCalcValues,
  fetchDynastyProcessValues,
  calculatePowerRankings,
  ownedPickValueByRoster,
  TeamPowerRanking,
} from '@/lib/rankings';
import Image from 'next/image';

interface PowerRankingsProps {
  rosters: SleeperRoster[];
  users: SleeperUser[];
  players: SleeperPlayersMap;
  // The league's format (superflex, PPR, size), so values match it
  settings: FantasyCalcSettings;
  // Future picks that changed hands, for the players + picks total
  tradedPicks: TradedPickRecord[];
  draftRounds: number;
}

export default async function PowerRankings({
  rosters,
  users,
  players,
  settings,
  tradedPicks,
  draftRounds,
}: PowerRankingsProps) {
  // Fetch values from both sources in parallel
  const [fcResult, dpValues] = await Promise.all([
    fetchFantasyCalcValues(settings),
    fetchDynastyProcessValues(settings.numQbs),
  ]);

  // Extract player values from FantasyCalc result
  const fcValues = fcResult.playerValues;

  // Build player name map
  const playerNames = new Map<string, string>();
  Object.entries(players).forEach(([id, player]) => {
    playerNames.set(id, player.full_name);
  });

  // Prepare roster and user data
  const rosterData = rosters.map(r => ({
    roster_id: r.roster_id,
    owner_id: r.owner_id,
    players: r.players,
  }));

  // FantasyCalc prices future picks too, so its column counts the picks
  // each team holds; DynastyProcess publishes no pick values
  const pickValues = ownedPickValueByRoster(
    rosters.map(r => r.roster_id),
    tradedPicks,
    Object.fromEntries(fcResult.pickValues),
    draftRounds
  );

  // Calculate rankings - FantasyCalc uses Sleeper IDs, DynastyProcess uses player names
  const fcRankings = calculatePowerRankings(rosterData, users, fcValues, playerNames, false, pickValues);
  const dpRankings = calculatePowerRankings(rosterData, users, dpValues, playerNames, true);

  const hasFCData = fcValues.size > 0;
  const hasDPData = dpValues.size > 0;

  if (!hasFCData && !hasDPData) {
    return (
      <div className="panel p-6 text-center">
        <h2 className="text-lg font-semibold text-white mb-2">Power Rankings</h2>
        <p className="text-gray-400">Unable to load power rankings data</p>
      </div>
    );
  }

  const RankingColumn = ({
    title,
    rankings,
    hasData,
    subtitle,
    linkUrl,
    linkText,
  }: {
    title: string;
    rankings: TeamPowerRanking[];
    hasData: boolean;
    subtitle: string;
    linkUrl: string;
    linkText: string;
  }) => (
    <div className="panel overflow-hidden">
      <div className="px-4 py-3 border-b border-white/[0.06]">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-white">{title}</h3>
            <p className="text-xs text-gray-500">{subtitle}</p>
          </div>
          <a
            href={linkUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-sleeper-accent hover:underline"
          >
            {linkText}
          </a>
        </div>
      </div>

      {hasData ? (
        <div className="divide-y divide-white/[0.05]">
          {rankings.map((team) => {
            const roster = rosters.find(r => r.roster_id === team.rosterId);
            const user = roster ? getUserByOwnerId(users, roster.owner_id) : null;

            return (
              <div key={team.rosterId} className="px-4 py-3 flex items-center gap-3">
                <span
                  className={`text-lg font-bold w-8 ${
                    team.rank === 1
                      ? 'text-yellow-400'
                      : team.rank === 2
                      ? 'text-gray-300'
                      : team.rank === 3
                      ? 'text-amber-600'
                      : 'text-gray-500'
                  }`}
                >
                  {team.rank}
                </span>
                <Image
                  src={getUserAvatarUrl(user?.avatar || null)}
                  alt={team.teamName}
                  width={32}
                  height={32}
                  className="rounded-full"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{team.teamName}</p>
                  <p className="text-xs text-gray-500 truncate">
                    {team.topPlayers
                      .slice(0, 2)
                      .map(p => p.name)
                      .join(', ')}
                  </p>
                </div>
                <span className="text-sm font-medium text-sleeper-accent tabular-nums">
                  {team.totalValue.toLocaleString()}
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="p-4 text-center text-gray-400 text-sm">Unable to load data</div>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-white">Power Rankings</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <RankingColumn
          title="FantasyCalc"
          rankings={fcRankings}
          hasData={hasFCData}
          subtitle="Dynasty trade values · players + owned picks"
          linkUrl="https://fantasycalc.com/dynasty-rankings"
          linkText="View Rankings"
        />
        <RankingColumn
          title="DynastyProcess"
          rankings={dpRankings}
          hasData={hasDPData}
          subtitle="Aggregated dynasty values · players only"
          linkUrl="https://dynastyprocess.com/values"
          linkText="View Rankings"
        />
      </div>
    </div>
  );
}
