import { getLeague, getLeagueUsers } from '@/lib/sleeper';
import { hasMedianGames } from '@/lib/leagueWeeks';
import { scoringGroup, scoringLabel, scoringValue, ScoringGroup } from '@/lib/scoringLabels';

const SCORING_GROUP_ORDER: ScoringGroup[] = ['Passing', 'Rushing', 'Receiving', 'Kicking', 'Defense', 'Special Teams', 'Other'];

export const revalidate = 3600; // Revalidate every hour

interface LeaguePageProps {
  params: { leagueId: string };
}

export default async function SettingsPage({ params }: LeaguePageProps) {
  const { leagueId } = params;

  try {
    const [league, users] = await Promise.all([
      getLeague(leagueId),
      getLeagueUsers(leagueId),
    ]);

    // Commissioners are the users Sleeper flags as league owners
    const commissioners = users
      .filter(u => u.is_owner)
      .map(u => (u.metadata?.team_name ? `${u.display_name} (${u.metadata.team_name})` : u.display_name));
    const settings = league.settings;
    // Sleeper stores "no deadline" as week 99
    const tradeDeadline = !settings.trade_deadline || settings.trade_deadline > 18 ? 'None' : `Week ${settings.trade_deadline}`;
    const playoffFormat =
      settings.playoff_round_type === 1 ? 'Two-week championship'
        : settings.playoff_round_type === 2 ? 'Two weeks per round'
          : 'One week per round';

    // Scoring grouped by phase of the game
    const scoringGroups = new Map<ScoringGroup, [string, number][]>();
    for (const [key, value] of Object.entries(league.scoring_settings)) {
      if (value === 0) continue;
      const group = scoringGroup(key);
      if (!scoringGroups.has(group)) scoringGroups.set(group, []);
      scoringGroups.get(group)!.push([key, value]);
    }

    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl text-white">League Settings</h1>
          <p className="text-gray-400 mt-1">{league.name}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* General Settings */}
          <div className="panel p-6">
            <h2 className="text-lg font-semibold text-white mb-4">General</h2>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-400">League Name</dt>
                <dd className="text-white">{league.name}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-400">Season</dt>
                <dd className="text-white">{league.season}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-400">Status</dt>
                <dd className="text-white capitalize">{league.status.replace('_', ' ')}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-400">Teams</dt>
                <dd className="text-white">{league.total_rosters}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-400">League Type</dt>
                <dd className="text-white">
                  {league.settings.type === 0 ? 'Redraft' : league.settings.type === 1 ? 'Keeper' : league.settings.type === 2 ? 'Dynasty' : 'Guillotine'}
                  {settings.best_ball ? ' · Best ball' : ''}
                </dd>
              </div>
              {commissioners.length > 0 && (
                <div className="flex justify-between gap-4">
                  <dt className="text-gray-400">Commissioner{commissioners.length > 1 ? 's' : ''}</dt>
                  <dd className="text-white text-right">{commissioners.join(', ')}</dd>
                </div>
              )}
            </dl>
          </div>

          {/* Schedule Settings */}
          <div className="panel p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Schedule</h2>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-400">Playoff Teams</dt>
                <dd className="text-white">{league.settings.playoff_teams}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-400">Playoff Start</dt>
                <dd className="text-white">Week {league.settings.playoff_week_start}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-400">Playoff Format</dt>
                <dd className="text-white">{playoffFormat}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-400">Median Game</dt>
                <dd className="text-white">
                  {hasMedianGames(settings) ? 'Yes · extra win for a top-half score each week' : 'No'}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-400">Trade Deadline</dt>
                <dd className="text-white">{tradeDeadline}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-400">Divisions</dt>
                <dd className="text-white">{league.settings.divisions || 'None'}</dd>
              </div>
            </dl>
          </div>

          {/* Waiver Settings */}
          <div className="panel p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Waivers</h2>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-400">Waiver Type</dt>
                <dd className="text-white">
                  {league.settings.waiver_type === 0 ? 'Rolling' :
                   league.settings.waiver_type === 1 ? 'Reverse Standings' :
                   league.settings.waiver_type === 2 ? 'FAAB' : 'Unknown'}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-400">Waiver Budget</dt>
                <dd className="text-white">${league.settings.waiver_budget}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-400">Waiver Clear Days</dt>
                <dd className="text-white">{league.settings.waiver_clear_days} days</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-400">Daily Waivers</dt>
                <dd className="text-white">{league.settings.daily_waivers ? 'Yes' : 'No'}</dd>
              </div>
            </dl>
          </div>

          {/* Trade Settings */}
          <div className="panel p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Trades</h2>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-400">Trade Review Period</dt>
                <dd className="text-white">{league.settings.trade_review_days} days</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-400">Trades Enabled</dt>
                <dd className="text-white">{league.settings.disable_trades ? 'No' : 'Yes'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-400">Pick Trading</dt>
                <dd className="text-white">{league.settings.pick_trading ? 'Enabled' : 'Disabled'}</dd>
              </div>
            </dl>
          </div>
        </div>

        {/* Roster Positions */}
        <div className="panel p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Roster Positions</h2>
          <div className="flex flex-wrap gap-2">
            {league.roster_positions.map((pos, idx) => (
              <span
                key={idx}
                className={`px-3 py-1.5 rounded text-sm font-medium ${
                  pos === 'BN' ? 'bg-gray-700 text-gray-300' :
                  pos === 'IR' ? 'bg-red-900/50 text-red-400' :
                  pos === 'TAXI' ? 'bg-yellow-900/50 text-yellow-400' :
                  'bg-sleeper-accent/20 text-sleeper-accent'
                }`}
              >
                {pos}
              </span>
            ))}
          </div>
          <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-gray-400">Starters:</span>
              <span className="text-white ml-2">
                {league.roster_positions.filter(p => p !== 'BN' && p !== 'IR' && p !== 'TAXI').length}
              </span>
            </div>
            <div>
              <span className="text-gray-400">Bench:</span>
              <span className="text-white ml-2">
                {league.roster_positions.filter(p => p === 'BN').length}
              </span>
            </div>
            <div>
              <span className="text-gray-400">IR:</span>
              <span className="text-white ml-2">
                {league.roster_positions.filter(p => p === 'IR').length || league.settings.reserve_slots || 0}
              </span>
            </div>
            <div>
              <span className="text-gray-400">Taxi:</span>
              <span className="text-white ml-2">
                {league.settings.taxi_slots || 0}
              </span>
            </div>
          </div>
        </div>

        {/* Scoring Settings */}
        <div className="panel p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Scoring</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 text-sm">
            {SCORING_GROUP_ORDER.filter(g => scoringGroups.has(g)).map(group => (
              <div key={group}>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">{group}</h3>
                <dl className="space-y-1.5">
                  {scoringGroups.get(group)!.map(([key, value]) => (
                    <div key={key} className="flex justify-between gap-2">
                      <dt className="text-gray-400 truncate">{scoringLabel(key)}</dt>
                      <dd className="text-white font-medium tabular-nums whitespace-nowrap">{scoringValue(key, value)}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  } catch (error) {
    console.error('Error loading settings:', error);
    return (
      <div className="text-center py-12">
        <p className="text-sleeper-red">Error loading league settings</p>
      </div>
    );
  }
}
