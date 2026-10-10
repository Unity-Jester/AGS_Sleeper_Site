// Week bookkeeping shared by every page that walks a season's matchups.
//
// Two things the pages used to get wrong:
// - The week being played counts as "played" the moment one team scores
//   (Thursday night), so partial scores leaked into records, awards and
//   odds. Sleeper's last_scored_leg says which weeks are final.
// - Playoff length was assumed to be one week per round. Leagues can run
//   a two-week championship (playoff_round_type 1) or two-week rounds
//   throughout (2), which pushes the final week past what was fetched.

import { PlayoffMatchup, SleeperLeague } from './types';

type PlayoffSettings = Pick<
  SleeperLeague['settings'],
  'playoff_week_start' | 'playoff_teams' | 'playoff_round_type'
>;

const LAST_NFL_WEEK = 18;

// Rounds needed to get from playoff_teams down to one champion
export function playoffRoundCount(settings: PlayoffSettings): number {
  const teams = settings.playoff_teams || 0;
  if (teams < 2) return 0;
  return Math.ceil(Math.log2(teams));
}

// The NFL weeks a playoff round is played over (round 1 = first round)
export function playoffRoundWeeks(settings: PlayoffSettings, round: number): number[] {
  const rounds = playoffRoundCount(settings);
  if (!settings.playoff_week_start || round < 1 || round > rounds) return [];
  const length = (r: number) =>
    settings.playoff_round_type === 2 || (settings.playoff_round_type === 1 && r === rounds) ? 2 : 1;

  let week = settings.playoff_week_start;
  for (let r = 1; r < round; r++) week += length(r);
  return Array.from({ length: length(round) }, (_, i) => week + i);
}

// Last week of the regular season
export function lastRegularSeasonWeek(settings: PlayoffSettings): number {
  return settings.playoff_week_start ? settings.playoff_week_start - 1 : LAST_NFL_WEEK;
}

// Last week of the season, championship included
export function finalWeek(settings: PlayoffSettings): number {
  const rounds = playoffRoundCount(settings);
  if (!settings.playoff_week_start || rounds === 0) return LAST_NFL_WEEK;
  const weeks = playoffRoundWeeks(settings, rounds);
  return weeks[weeks.length - 1];
}

// Last week whose scores are final. Sleeper's last_scored_leg is exact
// (0 before week 1 is scored, the championship week once a season is
// complete); without it, a finished league counts every week and a live
// one counts the weeks before the NFL's current week.
export function scoredThroughWeek(
  league: Pick<SleeperLeague, 'status' | 'season' | 'settings'>,
  nflState?: { season: string; week: number } | null
): number {
  const scored = league.settings?.last_scored_leg;
  if (typeof scored === 'number') return Math.min(scored, finalWeek(league.settings));
  if (league.status === 'complete') return finalWeek(league.settings);
  if (nflState && nflState.season === league.season) return Math.max(0, nflState.week - 1);
  return 0;
}

// Which playoff round a week belongs to, and which leg of it (for
// two-week rounds); null for regular-season weeks
export function playoffRoundOfWeek(
  settings: PlayoffSettings,
  week: number
): { round: number; leg: number; legs: number; isFinal: boolean } | null {
  const rounds = playoffRoundCount(settings);
  for (let r = 1; r <= rounds; r++) {
    const weeks = playoffRoundWeeks(settings, r);
    const leg = weeks.indexOf(week);
    if (leg >= 0) return { round: r, leg: leg + 1, legs: weeks.length, isFinal: r === rounds };
  }
  return null;
}

// "Week 9", "Playoffs Rd 1", "Championship (Wk 2)"
export function weekLabel(settings: PlayoffSettings, week: number): string {
  const playoff = playoffRoundOfWeek(settings, week);
  if (!playoff) return `Week ${week}`;
  const name = playoff.isFinal ? 'Championship' : `Playoffs Rd ${playoff.round}`;
  return playoff.legs > 1 ? `${name} (Wk ${playoff.leg})` : name;
}

// Median scoring: every team also plays the league median each week
export function hasMedianGames(settings: { league_average_match?: number } | null | undefined): boolean {
  return settings?.league_average_match === 1;
}

// Name a playoff game from the brackets: "Semifinal", "Championship (Wk 2)",
// "3rd Place", "Consolation". Null when the pair isn't a bracket game.
export function playoffGameLabel(
  settings: PlayoffSettings,
  week: number,
  rosterA: number,
  rosterB: number,
  winners: PlayoffMatchup[],
  losers: PlayoffMatchup[]
): string | null {
  const playoff = playoffRoundOfWeek(settings, week);
  if (!playoff) return null;
  const rounds = playoffRoundCount(settings);
  const isPair = (g: PlayoffMatchup) => {
    const t1 = g.t1 ?? g.team_1_roster_id;
    const t2 = g.t2 ?? g.team_2_roster_id;
    return (g.r ?? g.round) === playoff.round &&
      ((t1 === rosterA && t2 === rosterB) || (t1 === rosterB && t2 === rosterA));
  };

  let name: string | null = null;
  const winnersGame = winners.find(isPair);
  if (winnersGame) {
    if (winnersGame.p === 1) name = 'Championship';
    else if (winnersGame.p === 3) name = '3rd Place';
    else if (winnersGame.p) name = `${winnersGame.p}th Place`;
    else if (playoff.round === rounds) name = 'Championship';
    else if (playoff.round === rounds - 1) name = 'Semifinal';
    else name = 'Quarterfinal';
  } else if (losers.find(isPair)) {
    name = 'Consolation';
  }
  if (!name) return null;
  return playoff.legs > 1 ? `${name} (Wk ${playoff.leg})` : name;
}

// Teams sitting out the first playoff round: they enter the winners
// bracket in round 2 without coming from a round-1 game
export function firstRoundByes(winners: PlayoffMatchup[]): number[] {
  const byes: number[] = [];
  for (const g of winners) {
    if ((g.r ?? g.round) !== 2 || g.p) continue;
    const t1 = g.t1 ?? g.team_1_roster_id;
    const t2 = g.t2 ?? g.team_2_roster_id;
    const from1 = (g as { t1_from?: unknown }).t1_from ?? g.team_1_from;
    const from2 = (g as { t2_from?: unknown }).t2_from ?? g.team_2_from;
    if (t1 && !from1) byes.push(t1);
    if (t2 && !from2) byes.push(t2);
  }
  return byes;
}
