import Image from 'next/image';
import {
  getLeague,
  getLeagueUsers,
  getLeagueRosters,
  getAllPlayers,
  getUserAvatarUrl,
} from '@/lib/sleeper';
import { fetchFantasyCalcValues } from '@/lib/rankings';
import { analyzeTeamWindows, TeamWindow, WindowVerdict } from '@/lib/rosterAnalysis';
import { FantasyCalcSettings } from '@/lib/types';
import { abbreviateNumber, truncateName } from '@/lib/utils';
import ErrorState from '@/components/ErrorState';

export const revalidate = 300;

interface LeaguePageProps {
  params: { leagueId: string };
}

const VERDICT_META: Record<
  WindowVerdict,
  { label: string; chip: string; dot: string; blurb: string }
> = {
  juggernaut: {
    label: 'Juggernaut',
    chip: 'bg-gradient-to-b from-gold-300 to-gold-600 text-sleeper-dark shadow-gold-glow',
    dot: '#d4b26a',
    blurb: 'Loaded and young - contend now without mortgaging later',
  },
  'win-now': {
    label: 'Win-Now',
    chip: 'bg-sleeper-green/15 text-sleeper-green ring-1 ring-sleeper-green/25',
    dot: '#3ddc97',
    blurb: 'Strong but aging - the window is open today, push chips in',
  },
  retooling: {
    label: 'Retooling',
    chip: 'bg-white/[0.06] text-gray-300 ring-1 ring-white/10',
    dot: '#8e8a7e',
    blurb: 'Middle of the pack - one big move decides the direction',
  },
  rebuilding: {
    label: 'Rebuilding',
    chip: 'bg-purple-400/15 text-purple-300 ring-1 ring-purple-400/25',
    dot: '#c084fc',
    blurb: 'Young and thin - accumulate picks and let the kids grow',
  },
  teardown: {
    label: 'Teardown',
    chip: 'bg-sleeper-red/15 text-sleeper-red ring-1 ring-sleeper-red/25',
    dot: '#e5484d',
    blurb: 'Old and outgunned - sell veterans while they still return value',
  },
};

const POSITION_COLORS: Record<string, string> = {
  QB: '#f87171',
  RB: '#4ade80',
  WR: '#60a5fa',
  TE: '#facc15',
  Other: '#6e6a60',
};

function deriveLeagueSettings(
  rosterPositions: string[],
  scoringSettings: Record<string, number>,
  totalRosters: number
): FantasyCalcSettings {
  const qbCount = rosterPositions.filter(pos => pos === 'QB' || pos === 'SUPER_FLEX').length;
  const recValue = scoringSettings?.rec ?? 1;
  return {
    numQbs: qbCount >= 2 ? 2 : 1,
    ppr: recValue === 0 ? 0 : recValue === 0.5 ? 0.5 : 1,
    numTeams: totalRosters || 12,
  };
}

// Server-rendered scatter: age (x, older right) vs roster value (y).
// Median lines split the league into the four window quadrants.
function WindowChart({ teams }: { teams: TeamWindow[] }) {
  const plotted = teams.filter(t => t.weightedAge !== null && t.totalValue > 0);
  if (plotted.length < 2) return null;

  const W = 720;
  const H = 420;
  const PAD = { top: 34, right: 28, bottom: 44, left: 56 };

  const ages = plotted.map(t => t.weightedAge as number);
  const vals = plotted.map(t => t.totalValue);
  const minAge = Math.min(...ages) - 0.4;
  const maxAge = Math.max(...ages) + 0.4;
  const minVal = Math.min(...vals) * 0.92;
  const maxVal = Math.max(...vals) * 1.05;

  const x = (age: number) => PAD.left + ((age - minAge) / (maxAge - minAge)) * (W - PAD.left - PAD.right);
  const y = (val: number) => H - PAD.bottom - ((val - minVal) / (maxVal - minVal)) * (H - PAD.top - PAD.bottom);

  const sortedAges = [...ages].sort((a, b) => a - b);
  const sortedVals = [...vals].sort((a, b) => a - b);
  const mid = (arr: number[]) =>
    arr.length % 2 ? arr[(arr.length - 1) / 2] : (arr[arr.length / 2 - 1] + arr[arr.length / 2]) / 2;
  const ageMed = mid(sortedAges);
  const valMed = mid(sortedVals);

  return (
    <div className="panel overflow-hidden">
      <div className="px-4 py-3 border-b border-white/[0.06]">
        <h2 className="text-lg font-semibold text-white">The Window</h2>
        <p className="text-sm text-gray-400">
          Roster value against value-weighted age &mdash; up and left is where dynasties live
        </p>
      </div>
      <div className="p-4 overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="min-w-[560px] w-full" role="img" aria-label="Contender window chart">
          {/* Quadrant median lines */}
          <line x1={x(ageMed)} y1={PAD.top} x2={x(ageMed)} y2={H - PAD.bottom} stroke="#d4b26a" strokeOpacity="0.25" strokeDasharray="4 4" />
          <line x1={PAD.left} y1={y(valMed)} x2={W - PAD.right} y2={y(valMed)} stroke="#d4b26a" strokeOpacity="0.25" strokeDasharray="4 4" />

          {/* Quadrant labels */}
          <text x={PAD.left + 6} y={PAD.top + 12} fill="#d4b26a" fillOpacity="0.55" fontSize="11" fontWeight="600">JUGGERNAUTS</text>
          <text x={W - PAD.right - 6} y={PAD.top + 12} fill="#3ddc97" fillOpacity="0.55" fontSize="11" fontWeight="600" textAnchor="end">WIN-NOW</text>
          <text x={PAD.left + 6} y={H - PAD.bottom - 8} fill="#c084fc" fillOpacity="0.55" fontSize="11" fontWeight="600">REBUILDING</text>
          <text x={W - PAD.right - 6} y={H - PAD.bottom - 8} fill="#e5484d" fillOpacity="0.55" fontSize="11" fontWeight="600" textAnchor="end">TEARDOWN</text>

          {/* Axes */}
          <line x1={PAD.left} y1={H - PAD.bottom} x2={W - PAD.right} y2={H - PAD.bottom} stroke="#403d37" />
          <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={H - PAD.bottom} stroke="#403d37" />
          <text x={(W - PAD.left - PAD.right) / 2 + PAD.left} y={H - 10} fill="#8e8a7e" fontSize="11" textAnchor="middle">
            Value-weighted age (older &rarr;)
          </text>
          <text x={16} y={(H - PAD.top - PAD.bottom) / 2 + PAD.top} fill="#8e8a7e" fontSize="11" textAnchor="middle" transform={`rotate(-90 16 ${(H - PAD.top - PAD.bottom) / 2 + PAD.top})`}>
            Roster value
          </text>

          {/* Teams */}
          {plotted.map((t, i) => {
            const cx = x(t.weightedAge as number);
            const cy = y(t.totalValue);
            const labelAbove = i % 2 === 0;
            const name = truncateName(t.teamName, 14);
            return (
              <g key={t.rosterId}>
                <circle cx={cx} cy={cy} r="6" fill={VERDICT_META[t.verdict].dot} stroke="#0e0d11" strokeWidth="1.5">
                  <title>{`${t.teamName}: ${Math.round(t.totalValue).toLocaleString()} value, age ${(t.weightedAge as number).toFixed(1)}`}</title>
                </circle>
                <text
                  x={cx}
                  y={labelAbove ? cy - 11 : cy + 20}
                  fill="#d4d1c9"
                  fontSize="11"
                  textAnchor="middle"
                >
                  {name}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

export default async function TeamsPage({ params }: LeaguePageProps) {
  const { leagueId } = params;

  try {
    const [league, users, rosters, players] = await Promise.all([
      getLeague(leagueId),
      getLeagueUsers(leagueId),
      getLeagueRosters(leagueId),
      getAllPlayers(),
    ]);

    const settings = deriveLeagueSettings(
      league.roster_positions || [],
      league.scoring_settings || {},
      league.total_rosters
    );
    const { playerValues } = await fetchFantasyCalcValues(settings);

    const teams = analyzeTeamWindows(
      rosters,
      users,
      players,
      playerValues,
      league.roster_positions || []
    );

    const maxValue = Math.max(...teams.map(t => t.totalValue), 1);

    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl text-white">Team Analysis</h1>
          <p className="text-gray-400 mt-1">
            {league.name} &middot; Contender windows and roster construction
          </p>
        </div>

        <WindowChart teams={teams} />

        {/* Team cards */}
        <div className="space-y-4">
          {teams.map(team => {
            const meta = VERDICT_META[team.verdict];
            const starterPct = team.totalValue > 0 ? (team.starterValue / team.totalValue) * 100 : 0;
            return (
              <div key={team.rosterId} className="panel p-4">
                <div className="flex items-center gap-4 flex-wrap">
                  <span className="text-2xl font-bold text-gray-600 w-8">#{team.valueRank}</span>
                  <Image
                    src={getUserAvatarUrl(team.avatar)}
                    alt={team.teamName}
                    width={44}
                    height={44}
                    className="rounded-full"
                  />
                  <div className="flex-1 min-w-[160px]">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-white">{team.teamName}</p>
                      <span className={`px-2 py-0.5 rounded text-xs font-semibold ${meta.chip}`}>
                        {meta.label}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">{meta.blurb}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-white tabular-nums">
                      {abbreviateNumber(Math.round(team.totalValue))}
                    </p>
                    <p className="text-xs text-gray-500">
                      {team.weightedAge !== null ? `avg age ${team.weightedAge.toFixed(1)}` : 'roster value'}
                    </p>
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-4 mt-4">
                  {/* Starters vs depth */}
                  <div>
                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                      <span>
                        Starters{' '}
                        <span className="text-gold-400 tabular-nums">
                          {abbreviateNumber(Math.round(team.starterValue))}
                        </span>
                      </span>
                      <span>
                        Depth{' '}
                        <span className="text-gray-300 tabular-nums">
                          {abbreviateNumber(Math.round(team.benchValue))}
                        </span>
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-gray-800 overflow-hidden flex">
                      <div className="h-full bg-gradient-to-r from-gold-400 to-gold-600" style={{ width: `${starterPct}%` }} />
                    </div>
                  </div>

                  {/* Positional split */}
                  <div>
                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                      {team.positionValues.map(pv => (
                        <span key={pv.position}>
                          <span style={{ color: POSITION_COLORS[pv.position] }}>{pv.position}</span>{' '}
                          <span className="tabular-nums">{abbreviateNumber(Math.round(pv.value))}</span>
                        </span>
                      ))}
                    </div>
                    <div className="h-2 rounded-full bg-gray-800 overflow-hidden flex">
                      {team.positionValues.map(pv => (
                        <div
                          key={pv.position}
                          className="h-full"
                          style={{
                            width: `${team.totalValue > 0 ? (pv.value / team.totalValue) * 100 : 0}%`,
                            backgroundColor: POSITION_COLORS[pv.position],
                          }}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                {/* League-relative value bar */}
                <div className="mt-3 h-1 rounded-full bg-gray-800 overflow-hidden">
                  <div
                    className="h-full bg-white/20"
                    style={{ width: `${(team.totalValue / maxValue) * 100}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        <p className="text-xs text-gray-600">
          Values from FantasyCalc dynasty market data. Starter value fills your league&apos;s
          lineup ({(league.roster_positions || []).filter(p => p !== 'BN').join(', ')}) with each
          roster&apos;s best players.
        </p>
      </div>
    );
  } catch (error) {
    console.error('Error loading team analysis:', error);
    return <ErrorState title="Error Loading Team Analysis" />;
  }
}
