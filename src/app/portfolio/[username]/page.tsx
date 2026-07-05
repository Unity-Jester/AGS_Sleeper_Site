import Image from 'next/image';
import Link from 'next/link';
import {
  getUser,
  getUserLeagues,
  getLeagueRosters,
  getLeagueUsers,
  getAllPlayers,
  getNFLState,
  getUserAvatarUrl,
} from '@/lib/sleeper';
import { fetchFantasyCalcValues } from '@/lib/rankings';
import { analyzeTeamWindows, TeamWindow, WindowVerdict } from '@/lib/rosterAnalysis';
import { calculateExposure } from '@/lib/portfolio';
import { FantasyCalcSettings, SleeperLeague } from '@/lib/types';
import { abbreviateNumber, getPositionTextColor } from '@/lib/utils';
import ErrorState from '@/components/ErrorState';

export const revalidate = 300;

interface PortfolioPageProps {
  params: { username: string };
}

const VERDICT_META: Record<WindowVerdict, { label: string; chip: string }> = {
  juggernaut: {
    label: 'Juggernaut',
    chip: 'bg-gradient-to-b from-gold-300 to-gold-600 text-sleeper-dark shadow-gold-glow',
  },
  'win-now': { label: 'Win-Now', chip: 'bg-sleeper-green/15 text-sleeper-green ring-1 ring-sleeper-green/25' },
  retooling: { label: 'Retooling', chip: 'bg-white/[0.06] text-gray-300 ring-1 ring-white/10' },
  rebuilding: { label: 'Rebuilding', chip: 'bg-purple-400/15 text-purple-300 ring-1 ring-purple-400/25' },
  teardown: { label: 'Teardown', chip: 'bg-sleeper-red/15 text-sleeper-red ring-1 ring-sleeper-red/25' },
};

function deriveLeagueSettings(league: SleeperLeague): FantasyCalcSettings {
  const positions = league.roster_positions || [];
  const qbCount = positions.filter(pos => pos === 'QB' || pos === 'SUPER_FLEX').length;
  const recValue = league.scoring_settings?.rec ?? 1;
  return {
    numQbs: qbCount >= 2 ? 2 : 1,
    ppr: recValue === 0 ? 0 : recValue === 0.5 ? 0.5 : 1,
    numTeams: league.total_rosters || 12,
  };
}

interface LeagueSummary {
  league: SleeperLeague;
  myTeam: TeamWindow;
  record: { wins: number; losses: number; ties: number };
  totalRosters: number;
  myPlayerIds: string[];
}

export default async function PortfolioUserPage({ params }: PortfolioPageProps) {
  const username = decodeURIComponent(params.username);

  try {
    const [user, nflState, players] = await Promise.all([
      getUser(username),
      getNFLState(),
      getAllPlayers(),
    ]);

    if (!user?.user_id) {
      return (
        <ErrorState
          title="User Not Found"
          detail={`No Sleeper user named "${username}" was found.`}
        />
      );
    }

    // Current season's leagues, falling back one year in the offseason
    const season = nflState.league_season || nflState.season || String(new Date().getFullYear());
    let leagues = await getUserLeagues(user.user_id, season);
    let shownSeason = season;
    if (!leagues || leagues.length === 0) {
      shownSeason = String(parseInt(season) - 1);
      leagues = await getUserLeagues(user.user_id, shownSeason);
    }

    if (!leagues || leagues.length === 0) {
      return (
        <ErrorState
          title="No Leagues Found"
          detail={`${user.display_name || username} has no NFL leagues in ${season} or ${shownSeason}.`}
        />
      );
    }

    // Analyze every league concurrently; FantasyCalc responses are cached
    // per settings variant so a portfolio rarely costs more than 2-3 value
    // fetches regardless of league count.
    const summaries = await Promise.all(
      leagues.map(async (league): Promise<LeagueSummary | null> => {
        try {
          const [rosters, leagueUsers, { playerValues }] = await Promise.all([
            getLeagueRosters(league.league_id),
            getLeagueUsers(league.league_id),
            fetchFantasyCalcValues(deriveLeagueSettings(league)),
          ]);

          const myRoster = rosters.find(r => r.owner_id === user.user_id);
          if (!myRoster) return null;

          const teams = analyzeTeamWindows(
            rosters,
            leagueUsers,
            players,
            playerValues,
            league.roster_positions || []
          );
          const myTeam = teams.find(t => t.rosterId === myRoster.roster_id);
          if (!myTeam) return null;

          return {
            league,
            myTeam,
            record: {
              wins: myRoster.settings.wins || 0,
              losses: myRoster.settings.losses || 0,
              ties: myRoster.settings.ties || 0,
            },
            totalRosters: rosters.length,
            myPlayerIds: myRoster.players || [],
          };
        } catch {
          return null;
        }
      })
    );
    const portfolio = summaries.filter((s): s is LeagueSummary => s !== null);

    if (portfolio.length === 0) {
      return (
        <ErrorState
          title="No Rosters Found"
          detail={`Found leagues for ${user.display_name || username} but no owned rosters.`}
        />
      );
    }

    // Verdict tally + exposure across the portfolio
    const verdictCounts = new Map<WindowVerdict, number>();
    for (const s of portfolio) {
      verdictCounts.set(s.myTeam.verdict, (verdictCounts.get(s.myTeam.verdict) || 0) + 1);
    }

    // Best value per player across all leagues' value maps, for exposure display
    const mergedValues = new Map<string, number>();
    // (values are close enough between variants; use any league's map via re-fetch cache)
    const { playerValues: defaultValues } = await fetchFantasyCalcValues(
      deriveLeagueSettings(portfolio[0].league)
    );
    defaultValues.forEach((v, k) => mergedValues.set(k, v));

    const exposure = calculateExposure(
      portfolio.map(s => s.myPlayerIds),
      players,
      mergedValues
    ).slice(0, 20);

    return (
      <div className="space-y-8">
        {/* Header */}
        <div className="flex items-center gap-4 flex-wrap">
          <Image
            src={getUserAvatarUrl(user.avatar)}
            alt={user.display_name || username}
            width={56}
            height={56}
            className="rounded-full"
          />
          <div className="flex-1 min-w-[200px]">
            <p className="text-[11px] font-sans font-semibold uppercase tracking-[0.2em] text-gold-500 mb-1">
              Portfolio
            </p>
            <h1 className="text-3xl text-white">{user.display_name || username}</h1>
            <p className="text-gray-400 mt-1">
              {portfolio.length} league{portfolio.length !== 1 ? 's' : ''} &middot; {shownSeason} season
              <Link href="/portfolio?switch=1" className="text-gold-500 hover:underline ml-2 text-sm">
                not you?
              </Link>
            </p>
          </div>
          {/* Verdict tally */}
          <div className="flex gap-2 flex-wrap">
            {(Object.keys(VERDICT_META) as WindowVerdict[])
              .filter(v => verdictCounts.get(v))
              .map(v => (
                <span key={v} className={`px-2.5 py-1 rounded text-xs font-semibold ${VERDICT_META[v].chip}`}>
                  {verdictCounts.get(v)}&times; {VERDICT_META[v].label}
                </span>
              ))}
          </div>
        </div>

        {/* League cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {portfolio.map(s => {
            const meta = VERDICT_META[s.myTeam.verdict];
            return (
              <Link
                key={s.league.league_id}
                href={`/league/${s.league.league_id}`}
                className="panel panel-hover p-4 block"
              >
                <div className="flex items-center justify-between gap-2 mb-3">
                  <p className="font-semibold text-white truncate">{s.league.name}</p>
                  <span className={`shrink-0 px-2 py-0.5 rounded text-xs font-semibold ${meta.chip}`}>
                    {meta.label}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                  <div>
                    <p className="text-white font-bold tabular-nums">
                      {s.record.wins}-{s.record.losses}
                      {s.record.ties > 0 ? `-${s.record.ties}` : ''}
                    </p>
                    <p className="text-[11px] text-gray-500">Record</p>
                  </div>
                  <div>
                    <p className="text-white font-bold tabular-nums">
                      #{s.myTeam.valueRank}
                      <span className="text-gray-500 font-normal">/{s.totalRosters}</span>
                    </p>
                    <p className="text-[11px] text-gray-500">Value Rank</p>
                  </div>
                  <div>
                    <p className="text-gold-400 font-bold tabular-nums">
                      {abbreviateNumber(Math.round(s.myTeam.totalValue))}
                    </p>
                    <p className="text-[11px] text-gray-500">Roster Value</p>
                  </div>
                  <div>
                    <p className="text-white font-bold tabular-nums">
                      {s.myTeam.weightedAge !== null ? s.myTeam.weightedAge.toFixed(1) : '—'}
                    </p>
                    <p className="text-[11px] text-gray-500">Avg Age</p>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>

        {/* Player exposure */}
        {portfolio.length > 1 && exposure.length > 0 && (
          <div className="panel overflow-hidden">
            <div className="px-4 py-3 border-b border-white/[0.06]">
              <h2 className="text-lg font-semibold text-white">Player Exposure</h2>
              <p className="text-sm text-gray-400">
                Who you own across your {portfolio.length} leagues &mdash; your portfolio&apos;s
                concentrated bets
              </p>
            </div>
            <div className="divide-y divide-white/[0.05]">
              {exposure.map(p => (
                <div key={p.playerId} className="px-4 py-2.5 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <span className="text-white text-sm font-medium">{p.name}</span>
                    <span className={`ml-2 text-xs ${getPositionTextColor(p.position)}`}>
                      {p.position}
                    </span>
                  </div>
                  <div className="w-28 h-1.5 rounded-full bg-gray-800 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-gold-400 to-gold-600"
                      style={{ width: `${p.share * 100}%` }}
                    />
                  </div>
                  <span className="text-sm text-gray-300 tabular-nums w-14 text-right">
                    {p.count} of {portfolio.length}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  } catch (error) {
    console.error('Error loading portfolio:', error);
    return (
      <ErrorState
        title="Error Loading Portfolio"
        detail={`Could not load leagues for "${username}".`}
      />
    );
  }
}
