import {
  getLeague,
  getLeagueUsers,
  getLeagueRosters,
  getAllPlayers,
  getAllHistoricalTrades,
  getAllHistoricalDrafts,
  getAllSeasonTransactions,
  getLeagueHistory,
  getUserByOwnerId,
} from '@/lib/sleeper';
import { FantasyCalcSettings } from '@/lib/types';
import { fetchHistoricalValues, buildPlayerNameMapping } from '@/lib/historicalValues';
import { fetchFantasyCalcValues } from '@/lib/rankings';
import {
  buildVaultTrades,
  estimateScaleFactor,
  buildRosterEvents,
  reconstructFranchiseSeries,
  findSuperlatives,
  sampleDates,
  SeriesPoint,
  VaultTrade,
} from '@/lib/vault';
import { getTeamName, formatDate, abbreviateNumber, truncateName } from '@/lib/utils';
import ErrorState from '@/components/ErrorState';

export const revalidate = 3600; // history moves slowly

interface LeaguePageProps {
  params: { leagueId: string };
  searchParams?: { all?: string };
}

// Ledger cards rendered by default; each is a server-drawn chart, and all
// 500+ made the page several megabytes
const LEDGER_LIMIT = 40;

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

const SIDE_COLORS = ['#d4b26a', '#8e8a7e', '#c084fc'];

// ---------------------------------------------------------------------------
// Server-rendered charts
// ---------------------------------------------------------------------------

function TradeAgingChart({ trade, names }: { trade: VaultTrade; names: Map<number, string> }) {
  const sides = trade.sides.filter(s => s.points.length > 1);
  if (sides.length < 2) return null;
  const W = 340;
  const H = 150;
  const PAD = { top: 12, right: 46, bottom: 18, left: 8 };

  const maxVal = Math.max(
    ...sides.flatMap(s => s.points.map(p => p.value)),
    ...sides.map(s => s.todayValue),
    1
  );
  // When any side ends on an estimate, reserve the tail of the chart for a
  // dashed hop from the last tracked point to the estimated today-value,
  // so the line lands exactly on the number the chip shows.
  const anyEstimated = sides.some(s => s.todayIsEstimated);
  const plotRight = W - PAD.right;
  const solidRight = anyEstimated ? PAD.left + (plotRight - PAD.left) * 0.86 : plotRight;
  const x = (i: number, len: number) =>
    PAD.left + (i / Math.max(len - 1, 1)) * (solidRight - PAD.left);
  const y = (v: number) => H - PAD.bottom - (v / maxVal) * (H - PAD.top - PAD.bottom);

  // End-value labels, nudged apart when lines finish close together
  const ends = sides.map((side, i) => ({
    i,
    side,
    value: side.todayValue,
    labelY: y(side.todayValue),
  }));
  ends.sort((a, b) => a.labelY - b.labelY);
  for (let k = 1; k < ends.length; k++) {
    if (ends[k].labelY - ends[k - 1].labelY < 12) {
      ends[k].labelY = ends[k - 1].labelY + 12;
    }
  }
  const labelYByIndex = new Map(ends.map(e => [e.i, e.labelY]));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Trade value over time">
      {/* Value scale: baseline at 0 and a gridline at the chart max */}
      <line x1={PAD.left} y1={H - PAD.bottom} x2={W - PAD.right} y2={H - PAD.bottom} stroke="#403d37" />
      <line
        x1={PAD.left}
        y1={y(maxVal)}
        x2={W - PAD.right}
        y2={y(maxVal)}
        stroke="rgba(255,255,255,0.07)"
        strokeDasharray="3 4"
      />
      <text x={PAD.left} y={y(maxVal) - 3} fill="#6e6a60" fontSize="9">
        {abbreviateNumber(maxVal)}
      </text>
      <text x={PAD.left} y={H - PAD.bottom - 3} fill="#6e6a60" fontSize="9">
        0
      </text>

      {/* Time axis: trade day on the left, today on the right */}
      <text x={PAD.left} y={H - 5} fill="#6e6a60" fontSize="9">
        {formatDate(trade.date)}
      </text>
      <text x={W - PAD.right} y={H - 5} fill="#6e6a60" fontSize="9" textAnchor="end">
        Today
      </text>

      {sides.map((side, i) => {
        const color = SIDE_COLORS[i % SIDE_COLORS.length];
        const d = side.points
          .map((p, j) => `${j === 0 ? 'M' : 'L'}${x(j, side.points.length).toFixed(1)},${y(p.value).toFixed(1)}`)
          .join(' ');
        const last = side.points[side.points.length - 1];
        const lastX = x(side.points.length - 1, side.points.length);
        return (
          <g key={side.rosterId}>
            <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
            {anyEstimated && (
              <line
                x1={lastX}
                y1={y(last.value)}
                x2={plotRight}
                y2={y(side.todayValue)}
                stroke={color}
                strokeWidth="2"
                strokeDasharray="3 4"
                strokeOpacity="0.8"
              />
            )}
            <circle cx={anyEstimated ? plotRight : lastX} cy={y(side.todayValue)} r="3" fill={color}>
              <title>{`${names.get(side.rosterId) || side.rosterId}: ${side.todayValue.toLocaleString()}${side.todayIsEstimated ? ' (incl. estimates)' : ''} today`}</title>
            </circle>
            <text
              x={W - PAD.right + 6}
              y={(labelYByIndex.get(i) || y(side.todayValue)) + 3}
              fill={color}
              fontSize="10"
              fontWeight="600"
            >
              {side.todayIsEstimated ? '\u2248' : ''}
              {abbreviateNumber(side.todayValue)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function FranchiseSparkline({
  points,
  current,
  peakAtEnd,
  peak,
}: {
  points: SeriesPoint[];
  // The true (daily) peak; the sparkline's samples can miss it
  peak?: SeriesPoint;
  current: number;
  peakAtEnd: boolean;
}) {
  if (points.length < 2) return null;
  const W = 300;
  const H = 72;
  const PAD = 6;

  const maxVal = Math.max(...points.map(p => p.value), current, 1);
  const last = points[points.length - 1];
  // Reserve a tail for the dashed hop to today's (estimate-inclusive)
  // value so the line lands on the number the card shows.
  const hasTail = Math.abs(current - last.value) > 1;
  const plotRight = W - PAD;
  const solidRight = hasTail ? PAD + (plotRight - PAD) * 0.88 : plotRight;
  const x = (i: number) => PAD + (i / Math.max(points.length - 1, 1)) * (solidRight - PAD);
  const y = (v: number) => H - PAD - (v / maxVal) * (H - PAD * 2);

  const line = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`)
    .join(' ');
  const area = `${line} L${x(points.length - 1).toFixed(1)},${H - PAD} L${x(0).toFixed(1)},${H - PAD} Z`;

  // Mark the sample nearest the real peak date
  let peakIdx = 0;
  if (peak) {
    points.forEach((p, i) => {
      if (Math.abs(Date.parse(p.date) - Date.parse(peak.date)) < Math.abs(Date.parse(points[peakIdx].date) - Date.parse(peak.date))) peakIdx = i;
    });
  } else {
    points.forEach((p, i) => {
      if (p.value > points[peakIdx].value) peakIdx = i;
    });
  }
  const peakLabel = peak ?? points[peakIdx];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Franchise value over time">
      <path d={area} fill="rgba(212,178,106,0.10)" />
      <path d={line} fill="none" stroke="#d4b26a" strokeWidth="1.75" strokeLinejoin="round" />
      {hasTail && (
        <line
          x1={x(points.length - 1)}
          y1={y(last.value)}
          x2={plotRight}
          y2={y(current)}
          stroke="#d4b26a"
          strokeWidth="1.75"
          strokeDasharray="3 4"
          strokeOpacity="0.8"
        />
      )}
      {hasTail && <circle cx={plotRight} cy={y(current)} r="2.5" fill="#d4b26a" />}
      <circle cx={x(peakAtEnd ? points.length - 1 : peakIdx)} cy={y(points[peakAtEnd ? points.length - 1 : peakIdx].value)} r="3" fill="#eddcae">
        <title>{`Tracked peak: ${peakLabel.value.toLocaleString()} ${peakAtEnd ? '- today' : `on ${peakLabel.date}`}`}</title>
      </circle>
    </svg>
  );
}

// ---------------------------------------------------------------------------

function coverageBadge(trade: VaultTrade): string | null {
  const total = trade.sides.reduce((s, side) => s + side.totalAssets, 0);
  const tracked = trade.sides.reduce((s, side) => s + side.trackedAssets, 0);
  if (total === 0 || tracked === total) return null;
  return `${tracked}/${total} assets tracked`;
}

function isChartable(trade: VaultTrade): boolean {
  return (
    trade.sides.filter(s => s.points.length > 1).length >= 2 &&
    trade.sides.some(s => s.trackedAssets > 0)
  );
}

export default async function VaultPage({ params, searchParams }: LeaguePageProps) {
  const { leagueId } = params;

  try {
    const [league, users, rosters, players, historicalData, seasonTrades, draftMap, leagueChain] =
      await Promise.all([
        getLeague(leagueId),
        getLeagueUsers(leagueId),
        getLeagueRosters(leagueId),
        getAllPlayers(),
        fetchHistoricalValues(),
        getAllHistoricalTrades(leagueId),
        getAllHistoricalDrafts(leagueId),
        getLeagueHistory(leagueId),
      ]);

    if (historicalData.dates.length === 0) {
      return (
        <ErrorState
          title="The Vault Is Sealed"
          detail="Historical value data is unavailable right now, and the Vault runs entirely on it."
        />
      );
    }

    const playerMapping = buildPlayerNameMapping(players, historicalData.playerColumns);
    const allTrades = seasonTrades.flatMap(s => s.trades);

    // Team names keyed by roster id (current owners name the franchise)
    const names = new Map<number, string>();
    for (const roster of rosters) {
      names.set(roster.roster_id, getTeamName(getUserByOwnerId(users, roster.owner_id), roster.roster_id));
    }

    // A trade is credited to whoever ran the roster that season: three
    // rosters changed hands, and their old trades carried the new names
    const tradeNames = new Map<string, Map<number, string>>();
    for (const season of seasonTrades) {
      const seasonNames = new Map<number, string>();
      for (const roster of season.rosters) {
        seasonNames.set(
          roster.roster_id,
          getTeamName(getUserByOwnerId(season.users, roster.owner_id), roster.roster_id)
        );
      }
      for (const trade of season.trades) tradeNames.set(trade.transaction_id, seasonNames);
    }
    const namesFor = (trade: VaultTrade) => tradeNames.get(trade.tradeId) ?? names;

    // --- Trade aging series ---
    // FantasyCalc fills today's value for assets the sheet doesn't track,
    // rescaled onto the sheet's scale via the overlap between sources.
    const fc = await fetchFantasyCalcValues(
      deriveLeagueSettings(league.roster_positions || [], league.scoring_settings || {}, league.total_rosters)
    );
    const scale = estimateScaleFactor(
      historicalData.values.get(historicalData.dates[0]),
      fc.playerValues,
      playerMapping
    );
    const fallback = { playerValues: fc.playerValues, pickValues: fc.pickValues, scale };

    const vaultTrades = buildVaultTrades(
      allTrades, draftMap, historicalData, playerMapping, players, 60, fallback
    );
    const chartable = vaultTrades.filter(isChartable);
    const ledger = searchParams?.all ? chartable : chartable.slice(0, LEDGER_LIMIT);
    const { heist, photoFinish } = findSuperlatives(vaultTrades);

    // --- Franchise timelines: transactions + drafted players across the chain ---
    // Drafted players come from the shared draft map, which credits each
    // pick to the team that actually made it (Sleeper's 2023 board doesn't)
    const allTransactions = (
      await Promise.all(leagueChain.map(lg => getAllSeasonTransactions(lg.league_id)))
    ).flat();
    const draftedPlayers = [...draftMap.values()]
      .filter(d => d.draftedAt)
      .map(d => ({ playerId: d.playerId, rosterId: d.rosterId, ts: d.draftedAt! }));

    const events = buildRosterEvents(allTransactions, draftedPlayers);

    // Start franchise timelines at league inception, not the sheet's start:
    // before the startup draft every reconstructed roster is empty.
    const inceptionCandidates = [
      ...draftedPlayers.map(d => d.ts),
      ...allTransactions.map(t => t.created),
    ].filter(ts => ts > 0);
    const inceptionTs = inceptionCandidates.length > 0 ? Math.min(...inceptionCandidates) : 0;
    const franchiseSampleDates = sampleDates(historicalData.dates, inceptionTs, 48);
    // Peaks come from every day, not the 48 sparkline samples (which
    // missed real peaks by up to a year)
    const inceptionDay = new Date(inceptionTs).toISOString().slice(0, 10);
    const dailyDates = historicalData.dates.filter(d => d >= inceptionDay).reverse();
    const latestSheetValues = historicalData.values.get(historicalData.dates[0]);
    const franchises = rosters
      .map(roster => {
        const series = reconstructFranchiseSeries(
          roster.players || [],
          events.get(roster.roster_id) || [],
          historicalData,
          playerMapping,
          franchiseSampleDates
        );
        const daily = reconstructFranchiseSeries(
          roster.players || [],
          events.get(roster.roster_id) || [],
          historicalData,
          playerMapping,
          dailyDates
        );
        let peak = daily[0] || { date: '', value: 0 };
        for (const p of daily) if (p.value > peak.value) peak = p;

        // Current value gets the same treatment as trade chips: real sheet
        // value for tracked players plus rescaled FantasyCalc estimates for
        // the rest. Without this, rookie-heavy rosters rank artificially
        // low here while ranking high on the Teams page.
        const trackedNow = daily[daily.length - 1]?.value || 0;
        let estimate = 0;
        for (const playerId of roster.players || []) {
          const col = playerMapping.get(playerId);
          const tracked = col && latestSheetValues?.get(col);
          if (!tracked) {
            const fcVal = fallback.playerValues.get(playerId);
            if (fcVal) estimate += fcVal * fallback.scale;
          }
        }

        const current = Math.round(trackedNow + estimate);
        const currentIsEstimated = estimate > 0;
        // The peak is judged on sheet-tracked value alone, like the
        // history it's compared with; today's estimate-inclusive value is
        // shown separately. (Mixing them put half the league at an
        // all-time peak "right now".)
        const peakIsCurrent = peak.date === daily[daily.length - 1]?.date;
        return {
          rosterId: roster.roster_id,
          name: names.get(roster.roster_id) || `Team ${roster.roster_id}`,
          series,
          peak,
          peakIsCurrent,
          current,
          currentIsEstimated,
        };
      })
      .sort((a, b) => b.current - a.current);

    const peakFranchise = [...franchises].sort((a, b) => b.peak.value - a.peak.value)[0];

    const superlativeCard = (
      title: string,
      emoji: string,
      trade: VaultTrade | null,
      line: (t: VaultTrade) => string
    ) =>
      trade && (
        <div className="panel p-4">
          <p className="text-xs text-gray-500 mb-1">
            <span className="mr-1">{emoji}</span>
            {title}
          </p>
          <p className="text-sm text-white mb-1">
            {trade.sides.map(s => namesFor(trade).get(s.rosterId) || `Team ${s.rosterId}`).join(' vs ')}
            <span className="text-gray-500 ml-2 text-xs">{formatDate(trade.date)}</span>
          </p>
          <div className="space-y-1 mb-2">
            {trade.sides.map((s, i) => (
              <p key={s.rosterId} className="text-xs text-gray-400 flex items-baseline gap-1.5 min-w-0" title={s.assetLabels.join(', ')}>
                <span
                  className="w-1.5 h-1.5 rounded-full inline-block shrink-0 self-center"
                  style={{ backgroundColor: SIDE_COLORS[i % SIDE_COLORS.length] }}
                />
                <span className="text-gray-300 tabular-nums shrink-0">
                  {s.todayIsEstimated ? '\u2248' : ''}
                  {abbreviateNumber(s.todayValue)}
                </span>
                <span className="truncate min-w-0 flex-1">{s.assetLabels.join(', ') || 'nothing'}</span>
              </p>
            ))}
          </div>
          <TradeAgingChart trade={trade} names={namesFor(trade)} />
          <p className="text-xs text-gray-400 mt-2">{line(trade)}</p>
        </div>
      );

    return (
      <div className="space-y-8">
        <div>
          <p className="text-[11px] font-sans font-semibold uppercase tracking-[0.2em] text-gold-500 mb-2">
            The Vault
          </p>
          <h1 className="text-3xl text-white">Where the Receipts Live</h1>
          <p className="text-gray-400 mt-1">
            {league.name} &middot; every trade and franchise, replayed against{' '}
            {historicalData.dates.length.toLocaleString()} days of market values
          </p>
          <div className="keyline mt-4" />
        </div>

        {/* Superlatives */}
        {(heist || photoFinish || peakFranchise) && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {superlativeCard('The Heist', '\u{1F3C6}', heist, t =>
              `${namesFor(t).get(t.leaderRosterId!) || 'The winner'} has gained ${abbreviateNumber(Math.abs(Math.round(t.swing)))} of separation since trade day.`
            )}
            {superlativeCard('The Photo Finish', '\u{2696}\u{FE0F}', photoFinish, t =>
              `Still separated by just ${abbreviateNumber(Math.abs(Math.round(t.gapNow)))} after ${Math.round((Date.now() - t.date) / (30 * 24 * 3600 * 1000))} months.`
            )}
            {peakFranchise && peakFranchise.peak.value > 0 && (
              <div className="panel p-4">
                <p className="text-xs text-gray-500 mb-1">
                  <span className="mr-1">{'\u{1F3D4}\u{FE0F}'}</span>
                  Peak Franchise
                </p>
                <p className="text-sm text-white mb-2">{peakFranchise.name}</p>
                <FranchiseSparkline
                  points={peakFranchise.series}
                  current={peakFranchise.current}
                  peakAtEnd={peakFranchise.peakIsCurrent}
                  peak={peakFranchise.peak}
                />
                <p className="text-xs text-gray-400 mt-2">
                  Highest roster value in league history:{' '}
                  <span className="text-gold-400">{peakFranchise.peak.value.toLocaleString()}</span>
                  {peakFranchise.peakIsCurrent ? ' \u2014 right now.' : ` on ${peakFranchise.peak.date}.`}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Franchise timelines */}
        <div className="panel overflow-hidden">
          <div className="px-4 py-3 border-b border-white/[0.06]">
            <h2 className="text-lg font-semibold text-white">Franchise Timelines</h2>
            <p className="text-sm text-gray-400">
              Roster value reconstructed from every draft pick, trade, and waiver move.
              Lines chart sheet-tracked value; current values (&asymp;) also estimate
              untracked players, matching how the Teams page ranks rosters.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 divide-y sm:divide-y-0 divide-white/[0.05]">
            {franchises.map(f => (
              <div key={f.rosterId} className="p-4">
                <div className="flex items-baseline justify-between gap-2 mb-1">
                  <p className="text-sm font-medium text-white truncate">{truncateName(f.name, 20)}</p>
                  <p
                    className="text-sm text-gold-400 tabular-nums"
                    title={f.currentIsEstimated ? 'Includes estimates for players the value sheet does not track' : undefined}
                  >
                    {f.currentIsEstimated ? '\u2248' : ''}
                    {abbreviateNumber(f.current)}
                  </p>
                </div>
                <FranchiseSparkline points={f.series} current={f.current} peakAtEnd={f.peakIsCurrent} peak={f.peak} />
                <p className="text-[11px] text-gray-500 mt-1">
                  Tracked peak {abbreviateNumber(f.peak.value)} &middot; {f.peakIsCurrent ? 'today' : f.peak.date}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Trade ledger */}
        <div>
          <h2 className="text-xl font-semibold text-white mb-1">The Trade Ledger</h2>
          <p className="text-sm text-gray-400 mb-4">
            {chartable.length} of {vaultTrades.length} trades old enough to chart &mdash; watch them age
            {ledger.length < chartable.length && (
              <>
                {' '}&middot; showing the {ledger.length} most recent{' '}
                <a href="?all=1" className="text-sleeper-accent hover:underline">show all</a>
              </>
            )}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {ledger.map(trade => {
              const badge = coverageBadge(trade);
              const tradeTeamNames = namesFor(trade);
              const leaderName = trade.leaderRosterId !== null ? tradeTeamNames.get(trade.leaderRosterId) : null;
              return (
                <div key={trade.tradeId} className="panel panel-hover p-4">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <p className="text-xs text-gray-500">{formatDate(trade.date)}</p>
                    {badge && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-500/90">
                        {badge}
                      </span>
                    )}
                  </div>
                  <div className="space-y-1.5 mb-3">
                    {trade.sides.map((side, i) => (
                      <div key={side.rosterId} className="flex items-baseline gap-1.5 text-sm min-w-0">
                        <span
                          className="w-2 h-2 rounded-full inline-block shrink-0 self-center"
                          style={{ backgroundColor: SIDE_COLORS[i % SIDE_COLORS.length] }}
                        />
                        <span className="text-white shrink-0">
                          {truncateName(tradeTeamNames.get(side.rosterId) || `Team ${side.rosterId}`, 14)}
                        </span>
                        <span
                          className="text-gray-500 tabular-nums text-xs shrink-0"
                          title={side.todayIsEstimated ? 'Includes estimates for assets the value sheet does not track' : undefined}
                        >
                          {side.todayIsEstimated ? '\u2248' : ''}
                          {abbreviateNumber(side.todayValue)}
                        </span>
                        <span
                          className="text-gray-400 text-xs truncate min-w-0 flex-1"
                          title={side.assetLabels.join(', ')}
                        >
                          {side.assetLabels.join(', ') || 'nothing'}
                        </span>
                      </div>
                    ))}
                  </div>
                  <TradeAgingChart trade={trade} names={tradeTeamNames} />
                  {leaderName && (
                    <p className="text-xs text-gray-400 mt-2">
                      {trade.swing >= 0 ? (
                        <>
                          <span className="text-sleeper-green">{truncateName(leaderName, 18)}</span> ahead by{' '}
                          {abbreviateNumber(Math.abs(Math.round(trade.gapNow)))}, up{' '}
                          {abbreviateNumber(Math.abs(Math.round(trade.swing)))} since trade day
                          {trade.swingIsPartial && <span className="text-gray-500"> (tracked assets)</span>}
                        </>
                      ) : (
                        <>
                          <span className="text-gold-400">{truncateName(leaderName, 18)}</span> ahead by{' '}
                          {abbreviateNumber(Math.abs(Math.round(trade.gapNow)))}, but the gap has closed{' '}
                          {abbreviateNumber(Math.abs(Math.round(trade.swing)))}
                        </>
                      )}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <p className="text-xs text-gray-600">
          Chart lines use the historical market sheet ({historicalData.dates[0]} latest), which
          tracks a curated set of players &mdash; untracked assets are excluded from lines and
          flagged in coverage badges. Today&apos;s values marked &asymp; fill those gaps with
          FantasyCalc data rescaled onto the sheet&apos;s scale (&times;{scale.toFixed(2)});
          traded picks are valued as picks until their selection enters the data.
        </p>
      </div>
    );
  } catch (error) {
    console.error('Error loading vault:', error);
    return <ErrorState title="Error Loading The Vault" />;
  }
}
