import {
  getLeagueUsers,
  getLeagueRosters,
  getLeagueMatchups,
  getNFLState,
  getAllPlayers,
  pairMatchups,
  getHeadToHeadRecords,
  getH2HForOwners,
  getLeagueHistory,
  getPlayoffBracket,
  getUserByOwnerId,
} from '@/lib/sleeper';
import { getTeamName } from '@/lib/utils';
import {
  finalWeek,
  firstRoundByes,
  playoffGameLabel,
  playoffRoundOfWeek,
  playoffRoundWeeks,
} from '@/lib/leagueWeeks';
import { PlayoffMatchup, SleeperMatchup } from '@/lib/types';
import Matchup from '@/components/Matchup';
import ErrorState from '@/components/ErrorState';
import WeekSelector from './WeekSelector';

export const revalidate = 60;

interface MatchupsPageProps {
  params: { leagueId: string };
  searchParams: Promise<{ week?: string; season?: string }>;
}

export default async function MatchupsPage({ params: routeParams, searchParams }: MatchupsPageProps) {
  const params = await searchParams;
  const { leagueId } = routeParams;

  try {
    // Head-to-head history only depends on the league, so it loads
    // alongside everything else
    const [leagueChain, nflState, players, h2hRecords] = await Promise.all([
      getLeagueHistory(leagueId),
      getNFLState(),
      getAllPlayers(),
      getHeadToHeadRecords(leagueId),
    ]);
    const currentLeague = leagueChain[0];

    const isPreseason = currentLeague.status === 'pre_draft' || currentLeague.status === 'drafting';

    // Season to show: ?season=2024 picks any season in the league's
    // history; 'previous' is kept for old links. Before the new season
    // starts, default to last season.
    const requested =
      params.season === 'previous'
        ? leagueChain[1]
        : leagueChain.find(l => l.season === params.season);
    const activeLeague =
      requested ?? (isPreseason && !params.season && leagueChain[1] ? leagueChain[1] : currentLeague);
    const activeLeagueId = activeLeague.league_id;
    const settings = activeLeague.settings;

    const totalWeeks = finalWeek(settings);
    const isLiveSeason = activeLeague.status !== 'complete' && activeLeague.season === nflState.season;

    // A finished season opens on its championship; the live one on this week
    const defaultWeek = isLiveSeason
      ? Math.min(Math.max(nflState.week || 1, 1), totalWeeks)
      : totalWeeks;
    const requestedWeek = parseInt(params.week ?? '', 10);
    const selectedWeek =
      Number.isInteger(requestedWeek) && requestedWeek >= 1 && requestedWeek <= totalWeeks
        ? requestedWeek
        : defaultWeek;

    // Second leg of a two-week playoff round: also load the first leg for
    // the aggregate score
    const playoffRound = playoffRoundOfWeek(settings, selectedWeek);
    const roundWeeks = playoffRound ? playoffRoundWeeks(settings, playoffRound.round) : [];
    const earlierLegs = roundWeeks.filter(w => w < selectedWeek);

    const [users, rosters, matchups, earlierLegMatchups, winners, losers] = await Promise.all([
      getLeagueUsers(activeLeagueId),
      getLeagueRosters(activeLeagueId),
      getLeagueMatchups(activeLeagueId, selectedWeek),
      Promise.all(earlierLegs.map(w => getLeagueMatchups(activeLeagueId, w).catch(() => [] as SleeperMatchup[]))),
      playoffRound ? getPlayoffBracket(activeLeagueId, 'winners').catch(() => [] as PlayoffMatchup[]) : [],
      playoffRound ? getPlayoffBracket(activeLeagueId, 'losers').catch(() => [] as PlayoffMatchup[]) : [],
    ]);
    const matchupPairs = pairMatchups(matchups, rosters, users);

    const earlierPoints = (rosterId: number) =>
      earlierLegMatchups.flat().filter(m => m.roster_id === rosterId).reduce((s, m) => s + (m.points || 0), 0);

    const teamName = (rosterId: number) => {
      const roster = rosters.find(r => r.roster_id === rosterId);
      return getTeamName(roster ? getUserByOwnerId(users, roster.owner_id) : null, rosterId);
    };
    const byes = playoffRound?.round === 1 ? firstRoundByes(winners).map(teamName) : [];

    const seasonParam = activeLeague.league_id === currentLeague.league_id ? undefined : activeLeague.season;

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl text-white">Matchup Center</h1>
            <p className="text-sm text-gray-400">{activeLeague.season} Season</p>
          </div>
          <div className="flex items-center gap-4 flex-wrap">
            {leagueChain.length > 1 && (
              <SeasonPicker
                seasons={leagueChain.map(l => l.season)}
                selected={activeLeague.season}
                current={currentLeague.season}
              />
            )}
            <WeekSelector
              currentWeek={selectedWeek}
              totalWeeks={totalWeeks}
              playoffSettings={{
                playoff_week_start: settings.playoff_week_start,
                playoff_teams: settings.playoff_teams,
                playoff_round_type: settings.playoff_round_type,
              }}
              seasonParam={seasonParam}
            />
          </div>
        </div>

        {byes.length > 0 && (
          <p className="text-sm text-gray-400">
            First-round bye{byes.length > 1 ? 's' : ''}:{' '}
            <span className="text-white">{byes.join(', ')}</span>
          </p>
        )}

        <div className="grid gap-6">
          {matchupPairs.length > 0 ? (
            matchupPairs.map((matchup) => {
              // Get H2H record for this matchup
              const owner1Id = matchup.team1.roster.owner_id;
              const owner2Id = matchup.team2.roster.owner_id;
              const h2h = owner1Id && owner2Id
                ? getH2HForOwners(h2hRecords, owner1Id, owner2Id)
                : null;

              const r1 = matchup.team1.roster.roster_id;
              const r2 = matchup.team2.roster.roster_id;
              const label = playoffGameLabel(settings, selectedWeek, r1, r2, winners, losers);
              const aggregate = earlierLegs.length > 0
                ? {
                    team1: earlierPoints(r1) + matchup.team1.points,
                    team2: earlierPoints(r2) + matchup.team2.points,
                  }
                : null;

              return (
                <Matchup
                  key={matchup.matchupId}
                  matchup={matchup}
                  players={players}
                  showStarters={true}
                  h2hRecord={h2h}
                  label={label}
                  aggregate={aggregate}
                />
              );
            })
          ) : (
            <div className="text-center py-12 panel">
              <p className="text-gray-400">No matchups found for Week {selectedWeek}</p>
              {isPreseason && activeLeague.league_id === currentLeague.league_id && leagueChain[1] && (
                <p className="text-sm text-gray-500 mt-2">
                  The {currentLeague.season} season hasn&apos;t started yet.
                  <a href={`?season=${leagueChain[1].season}`} className="text-sleeper-accent ml-1 hover:underline">
                    View last season&apos;s matchups
                  </a>
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    );
  } catch (error) {
    console.error('Error loading matchups:', error);
    return <ErrorState title="Error Loading Matchups" />;
  }
}

// Links rather than a client select, so it works without JavaScript
function SeasonPicker({ seasons, selected, current }: { seasons: string[]; selected: string; current: string }) {
  return (
    <div className="flex rounded-lg overflow-hidden border border-gray-700">
      {[...seasons].reverse().map(season => (
        <a
          key={season}
          href={season === current ? '?' : `?season=${season}`}
          className={`px-3 py-1.5 text-sm ${
            season === selected
              ? 'bg-sleeper-accent text-sleeper-dark'
              : 'bg-gray-800 text-gray-400 hover:text-white'
          }`}
        >
          {season}
        </a>
      ))}
    </div>
  );
}
