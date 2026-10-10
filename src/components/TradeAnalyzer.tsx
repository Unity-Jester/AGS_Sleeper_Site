'use client';

import { useState, useMemo, useCallback, useRef } from 'react';
import { SleeperPlayersMap, SleeperRoster, SleeperUser, DraftPickSelection } from '@/lib/types';
import { getPlayerAvatarUrl } from '@/lib/sleeper';
import { getPositionTextColor, getTeamName, pickRoundLabel } from '@/lib/utils';
import { getDraftPickOptions, getPickKey, calculateTradeValue } from '@/lib/rankings';
import {
  OwnedPick,
  PickTier,
  TierRatios,
  calculateValueAdjustment,
  fairTradeBand,
  netChanges,
  projectPickTier,
  tieredPickValue,
} from '@/lib/tradeCalculator';
import Image from 'next/image';

interface TradeAnalyzerProps {
  players: SleeperPlayersMap;
  rosters: SleeperRoster[];
  users: SleeperUser[];
  playerValues: Record<string, number>;
  pickValues: Record<string, number>;
  // This-season (redraft) values, for the win-now vs long-term view
  redraftValues: Record<string, number>;
  // Every future pick in the league and who holds it
  ownedPicks: OwnedPick[];
  // Early/Late pick value relative to Mid, per round
  tierRatios: TierRatios;
}

interface PlayerOption {
  id: string;
  name: string;
  position: string;
  team: string;
  value: number;
  redraftValue: number;
}

type SelectedPlayer = PlayerOption;

interface SelectedPick {
  id: string;
  pick: DraftPickSelection;
  value: number;
  tier: PickTier;
  // Team whose slot this is; null for a generic pick
  originalRosterId: number | null;
}

interface PickOption {
  id: string;
  season: string;
  round: number;
  tier: PickTier;
  value: number;
  originalRosterId: number;
  ownerRosterId: number;
}

interface TradeSideState {
  players: SelectedPlayer[];
  picks: SelectedPick[];
  search: string;
  showSearch: boolean;
  showPickSelector: boolean;
  selectedTeam: number | null;
}

const createEmptySide = (): TradeSideState => ({
  players: [],
  picks: [],
  search: '',
  showSearch: false,
  showPickSelector: false,
  selectedTeam: null,
});

const TEAM_LABELS = ['A', 'B', 'C'];

const ownedPickId = (season: string, round: number, originalRosterId: number) =>
  `${season}-${round}-${originalRosterId}`;

export default function TradeAnalyzer({
  players,
  rosters,
  users,
  playerValues,
  pickValues,
  redraftValues,
  ownedPicks,
  tierRatios,
}: TradeAnalyzerProps) {
  const [sides, setSides] = useState<TradeSideState[]>([
    createEmptySide(),
    createEmptySide(),
  ]);
  const genericPickCounter = useRef(0);

  const pickOptions = useMemo(() => getDraftPickOptions(pickValues), [pickValues]);
  const nextSeason = pickOptions.seasons[0];

  // Build team list for dropdowns
  const teamOptions = useMemo(() => {
    return rosters.map(roster => {
      const user = users.find(u => u.user_id === roster.owner_id);
      const teamName = getTeamName(user, roster.roster_id);
      return {
        rosterId: roster.roster_id,
        teamName,
        user,
      };
    }).sort((a, b) => a.teamName.localeCompare(b.teamName));
  }, [rosters, users]);

  const teamNameById = useCallback(
    (rosterId: number) => teamOptions.find(t => t.rosterId === rosterId)?.teamName || `Team ${rosterId}`,
    [teamOptions]
  );

  const toPlayerOption = useCallback((id: string): PlayerOption | null => {
    const p = players[id];
    if (!p || !p.full_name) return null;
    return {
      id,
      name: p.full_name,
      position: p.position || '',
      team: p.team || 'FA',
      value: playerValues[id] || 0,
      redraftValue: redraftValues[id] || 0,
    };
  }, [players, playerValues, redraftValues]);

  const playersList = useMemo(() => {
    return Object.entries(players)
      .filter(([, p]) => p.fantasy_positions?.length > 0 && p.team && p.full_name)
      .map(([id, p]) => ({ ...toPlayerOption(id)!, searchRank: p.search_rank || 9999 }))
      .sort((a, b) => a.searchRank - b.searchRank);
  }, [players, toPlayerOption]);

  // Each team's players, most valuable first
  const rosterPlayers = useMemo(() => {
    const map = new Map<number, PlayerOption[]>();
    for (const roster of rosters) {
      const list = (roster.players || [])
        .map(toPlayerOption)
        .filter((p): p is PlayerOption => p !== null)
        .sort((a, b) => b.value - a.value);
      map.set(roster.roster_id, list);
    }
    return map;
  }, [rosters, toPlayerOption]);

  // Projected finish this season from win-now (redraft) roster strength,
  // used to place each team's next pick early, mid or late
  const projectedFinish = useMemo(() => {
    const strength = rosters.map(r => ({
      rosterId: r.roster_id,
      total: (r.players || []).reduce((s, id) => s + (redraftValues[id] || 0), 0),
    }));
    strength.sort((a, b) => b.total - a.total);
    return new Map(strength.map((t, i) => [t.rosterId, i + 1]));
  }, [rosters, redraftValues]);

  // Every future pick, valued for its projected slot, grouped by holder
  const pickOptionsByOwner = useMemo(() => {
    const map = new Map<number, PickOption[]>();
    for (const p of ownedPicks) {
      const tier = projectPickTier(p.season, nextSeason, projectedFinish.get(p.originalRosterId), rosters.length);
      const option: PickOption = {
        id: ownedPickId(p.season, p.round, p.originalRosterId),
        season: p.season,
        round: p.round,
        tier,
        value: tieredPickValue(p.season, p.round, tier, pickValues, tierRatios),
        originalRosterId: p.originalRosterId,
        ownerRosterId: p.ownerRosterId,
      };
      if (!map.has(p.ownerRosterId)) map.set(p.ownerRosterId, []);
      map.get(p.ownerRosterId)!.push(option);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.season.localeCompare(b.season) || a.round - b.round || b.value - a.value);
    }
    return map;
  }, [ownedPicks, nextSeason, projectedFinish, rosters.length, pickValues, tierRatios]);

  // Get all selected player and pick IDs across all sides
  const allSelectedPlayerIds = useMemo(() => {
    return new Set(sides.flatMap(s => s.players.map(p => p.id)));
  }, [sides]);

  const allSelectedPickIds = useMemo(() => {
    return new Set(sides.flatMap(s => s.picks.map(p => p.id)));
  }, [sides]);

  // Get all selected team IDs
  const allSelectedTeamIds = useMemo(() => {
    return sides.map(s => s.selectedTeam).filter((id): id is number => id !== null);
  }, [sides]);

  // A column lists what its team receives, so its assets come from the
  // other teams in the trade
  const sourceTeamsFor = useCallback((sideIndex: number) => {
    return sides
      .map((s, idx) => (idx !== sideIndex ? s.selectedTeam : null))
      .filter((id): id is number => id !== null);
  }, [sides]);

  // Player suggestions for a side: the trading partners' rosters first
  const getFilteredPlayers = useCallback((sideIndex: number) => {
    const searchTerm = sides[sideIndex].search.toLowerCase().trim();
    const sourcePlayers = sourceTeamsFor(sideIndex).flatMap(id => rosterPlayers.get(id) || []);
    const available = (p: PlayerOption) => !allSelectedPlayerIds.has(p.id);

    if (!searchTerm) {
      return sourcePlayers.filter(available).sort((a, b) => b.value - a.value).slice(0, 15);
    }

    const sourceIds = new Set(sourcePlayers.map(p => p.id));
    const matches = (p: PlayerOption) => p.name.toLowerCase().includes(searchTerm) && available(p);
    const fromSource = sourcePlayers.filter(matches);
    const others = playersList.filter(p => !sourceIds.has(p.id) && matches(p));
    return [...fromSource, ...others].slice(0, 10);
  }, [sides, sourceTeamsFor, rosterPlayers, playersList, allSelectedPlayerIds]);

  const getAvailablePicks = useCallback((sideIndex: number) => {
    return sourceTeamsFor(sideIndex)
      .flatMap(id => pickOptionsByOwner.get(id) || [])
      .filter(p => !allSelectedPickIds.has(p.id));
  }, [sourceTeamsFor, pickOptionsByOwner, allSelectedPickIds]);

  // Raw totals for each side
  const sideTotals = useMemo(() => {
    return sides.map(side => {
      const playerTotal = side.players.reduce((sum, p) => sum + p.value, 0);
      const pickTotal = side.picks.reduce((sum, p) => sum + p.value, 0);
      return playerTotal + pickTotal;
    });
  }, [sides]);

  // Win-now totals: picks don't help anyone this season
  const sideRedraftTotals = useMemo(() => {
    return sides.map(side => side.players.reduce((sum, p) => sum + p.redraftValue, 0));
  }, [sides]);

  // Determine which sides have assets (for partial population handling)
  const populatedSideIndices = useMemo(() => {
    return sides
      .map((side, idx) => ({ idx, hasAssets: side.players.length > 0 || side.picks.length > 0 }))
      .filter(s => s.hasAssets)
      .map(s => s.idx);
  }, [sides]);

  // Consolidation premium for two-team trades
  const sideAdjustments = useMemo(() => {
    const adjustments = sides.map(() => 0);
    if (populatedSideIndices.length !== 2) return adjustments;
    const [i1, i2] = populatedSideIndices;
    const assetValues = (side: TradeSideState) => [
      ...side.players.map(p => p.value),
      ...side.picks.map(p => p.value),
    ];
    const { adjustments: adj } = calculateValueAdjustment(assetValues(sides[i1]), assetValues(sides[i2]));
    adjustments[i1] = adj[0];
    adjustments[i2] = adj[1];
    return adjustments;
  }, [sides, populatedSideIndices]);

  const adjustedTotals = useMemo(
    () => sideTotals.map((total, idx) => total + sideAdjustments[idx]),
    [sideTotals, sideAdjustments]
  );

  const sideName = useCallback((idx: number) => {
    const id = sides[idx].selectedTeam;
    return id !== null ? teamNameById(id) : `Team ${TEAM_LABELS[idx]}`;
  }, [sides, teamNameById]);

  // Calculate trade for populated sides
  const tradeCalc = useMemo(() => {
    if (populatedSideIndices.length < 2) return null;

    // For 2 populated teams, compare totals after the value adjustment
    if (populatedSideIndices.length === 2) {
      const [idx1, idx2] = populatedSideIndices;
      return calculateTradeValue(
        {
          players: sides[idx1].players,
          picks: sides[idx1].picks,
          totalValue: adjustedTotals[idx1],
        },
        {
          players: sides[idx2].players,
          picks: sides[idx2].picks,
          totalValue: adjustedTotals[idx2],
        },
        [sideName(idx1), sideName(idx2)]
      );
    }

    // For 3 populated teams, compare each side to the average
    const total = populatedSideIndices.reduce((sum, idx) => sum + sideTotals[idx], 0);
    const average = total / populatedSideIndices.length;
    const maxDeviation = Math.max(...populatedSideIndices.map(idx => Math.abs(sideTotals[idx] - average)));
    const deviationPercent = average > 0 ? (maxDeviation / average) * 100 : 0;
    const band = fairTradeBand(average);

    return {
      isThreeTeam: true,
      isBalanced: maxDeviation <= band,
      band,
      deviationPercent,
      average,
      total,
      sideValues: populatedSideIndices.map(idx => ({
        index: idx,
        value: sideTotals[idx],
        deviation: sideTotals[idx] - average,
        deviationPercent: average > 0 ? ((sideTotals[idx] - average) / average) * 100 : 0,
      })),
    };
  }, [sides, sideTotals, adjustedTotals, populatedSideIndices, sideName]);

  // Team value rank impact: players plus the picks each team holds
  const powerRankingsImpact = useMemo(() => {
    // Need at least 2 teams selected with assets
    const teamsWithAssets = populatedSideIndices
      .filter(idx => sides[idx].selectedTeam !== null)
      .map(idx => ({ sideIndex: idx, teamId: sides[idx].selectedTeam! }));

    if (teamsWithAssets.length < 2) return null;

    // Check for duplicate teams
    const uniqueTeamIds = new Set(teamsWithAssets.map(t => t.teamId));
    if (uniqueTeamIds.size !== teamsWithAssets.length) return null;

    // Calculate current team values
    const teamValues = new Map<number, number>();
    for (const roster of rosters) {
      let total = 0;
      for (const playerId of roster.players || []) {
        total += playerValues[playerId] || 0;
      }
      for (const pick of pickOptionsByOwner.get(roster.roster_id) || []) {
        total += pick.value;
      }
      teamValues.set(roster.roster_id, total);
    }

    const rankIn = (values: Map<number, number>, rosterId: number) => {
      const sortedTeams = [...values.entries()].sort((a, b) => b[1] - a[1]);
      return sortedTeams.findIndex(([id]) => id === rosterId) + 1;
    };

    const changes = netChanges(teamsWithAssets.map(t => sideTotals[t.sideIndex]));

    // Create new values map with trade impact
    const newTeamValues = new Map(teamValues);
    teamsWithAssets.forEach(({ teamId }, i) => {
      newTeamValues.set(teamId, (teamValues.get(teamId) || 0) + changes[i]);
    });

    return teamsWithAssets.map(({ sideIndex, teamId }, i) => {
      const oldRank = rankIn(teamValues, teamId);
      const newRank = rankIn(newTeamValues, teamId);
      return {
        sideIndex,
        rosterId: teamId,
        name: teamNameById(teamId),
        oldRank,
        newRank,
        rankChange: oldRank - newRank,
        valueChange: changes[i],
      };
    });
  }, [sides, sideTotals, populatedSideIndices, rosters, playerValues, pickOptionsByOwner, teamNameById]);

  // Win-now vs long-term: this-season vs dynasty change for each team
  const horizonImpact = useMemo(() => {
    if (populatedSideIndices.length < 2) return null;
    const dynasty = netChanges(populatedSideIndices.map(idx => sideTotals[idx]));
    const winNow = netChanges(populatedSideIndices.map(idx => sideRedraftTotals[idx]));
    return populatedSideIndices.map((idx, i) => ({
      sideIndex: idx,
      name: sideName(idx),
      dynasty: dynasty[i],
      winNow: winNow[i],
    }));
  }, [populatedSideIndices, sideTotals, sideRedraftTotals, sideName]);

  // Handler functions
  const updateSide = useCallback((sideIndex: number, updates: Partial<TradeSideState>) => {
    setSides(prev => prev.map((side, idx) =>
      idx === sideIndex ? { ...side, ...updates } : side
    ));
  }, []);

  const addPlayer = useCallback((sideIndex: number, player: SelectedPlayer) => {
    setSides(prev => prev.map((side, idx) =>
      idx === sideIndex
        ? { ...side, players: [...side.players, player], search: '', showSearch: false }
        : side
    ));
  }, []);

  const removePlayer = useCallback((sideIndex: number, playerId: string) => {
    setSides(prev => prev.map((side, idx) =>
      idx === sideIndex
        ? { ...side, players: side.players.filter(p => p.id !== playerId) }
        : side
    ));
  }, []);

  const addSelectedPick = useCallback((sideIndex: number, pick: SelectedPick) => {
    setSides(prev => prev.map((side, idx) =>
      idx === sideIndex
        ? { ...side, picks: [...side.picks, pick], showPickSelector: false }
        : side
    ));
  }, []);

  const addGenericPick = useCallback((sideIndex: number, season: string, round: number) => {
    genericPickCounter.current += 1;
    addSelectedPick(sideIndex, {
      id: `generic-${genericPickCounter.current}`,
      pick: { season, round, key: getPickKey({ season, round, key: '' }) },
      value: tieredPickValue(season, round, 'Mid', pickValues, tierRatios),
      tier: 'Mid',
      originalRosterId: null,
    });
  }, [addSelectedPick, pickValues, tierRatios]);

  const addOwnedPick = useCallback((sideIndex: number, option: PickOption) => {
    addSelectedPick(sideIndex, {
      id: option.id,
      pick: {
        season: option.season,
        round: option.round,
        key: getPickKey({ season: option.season, round: option.round, key: '' }),
      },
      value: option.value,
      tier: option.tier,
      originalRosterId: option.originalRosterId,
    });
  }, [addSelectedPick]);

  const removePick = useCallback((sideIndex: number, pickId: string) => {
    setSides(prev => prev.map((side, idx) =>
      idx === sideIndex
        ? { ...side, picks: side.picks.filter(p => p.id !== pickId) }
        : side
    ));
  }, []);

  const addTeamC = useCallback(() => {
    if (sides.length < 3) {
      setSides(prev => [...prev, createEmptySide()]);
    }
  }, [sides.length]);

  const removeTeamC = useCallback(() => {
    if (sides.length === 3) {
      setSides(prev => prev.slice(0, 2));
    }
  }, [sides.length]);

  const clearAll = useCallback(() => {
    setSides([createEmptySide(), createEmptySide()]);
  }, []);

  // Format value for display
  const formatValue = (value: number) => {
    return Math.round(value).toLocaleString();
  };

  const formatSigned = (value: number) => (value >= 0 ? '+' : '') + formatValue(value);

  // Check if there are any assets
  const hasAnyAssets = sides.some(s => s.players.length > 0 || s.picks.length > 0);

  // Calculate percentages for bar display
  const totalValue = adjustedTotals.reduce((sum, val) => sum + val, 0);
  const sidePercents = totalValue > 0
    ? adjustedTotals.map(val => (val / totalValue) * 100)
    : sides.map(() => 100 / sides.length);

  return (
    <div className="panel p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-white">Trade Calculator</h2>
        <div className="flex items-center gap-3">
          {sides.length === 2 && (
            <button
              onClick={addTeamC}
              className="text-sm text-sleeper-accent hover:text-sleeper-accent/80 transition-colors"
            >
              + Add Team C
            </button>
          )}
          {hasAnyAssets && (
            <button
              onClick={clearAll}
              className="text-sm text-gray-400 hover:text-white transition-colors"
            >
              Clear All
            </button>
          )}
        </div>
      </div>

      {/* Team Selection */}
      <div className={`grid gap-4 mb-2 ${sides.length === 3 ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}>
        {sides.map((side, idx) => (
          <div key={idx}>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs text-gray-500">
                Select Team {TEAM_LABELS[idx]}
              </label>
              {idx === 2 && (
                <button
                  onClick={removeTeamC}
                  className="text-xs text-gray-500 hover:text-sleeper-red transition-colors"
                >
                  Remove
                </button>
              )}
            </div>
            <select
              value={side.selectedTeam ?? ''}
              onChange={(e) => updateSide(idx, { selectedTeam: e.target.value ? Number(e.target.value) : null })}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-sleeper-accent"
            >
              <option value="">-- Select Team --</option>
              {teamOptions.map(team => (
                <option
                  key={team.rosterId}
                  value={team.rosterId}
                  disabled={allSelectedTeamIds.includes(team.rosterId) && side.selectedTeam !== team.rosterId}
                >
                  {team.teamName}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
      <p className="text-xs text-gray-500 mb-4">
        Select teams to add straight from their rosters and the picks they own. Next year&apos;s
        picks are valued early, mid or late by each team&apos;s projected finish.
      </p>

      <div className={`grid gap-4 ${sides.length === 3 ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}>
        {sides.map((side, sideIndex) => {
          const sourceTeams = sourceTeamsFor(sideIndex);
          return (
            <TradeSide
              key={sideIndex}
              sideIndex={sideIndex}
              side={side}
              sideTotal={sideTotals[sideIndex]}
              adjustment={sideAdjustments[sideIndex]}
              teamLabel={TEAM_LABELS[sideIndex]}
              teamName={side.selectedTeam !== null ? teamNameById(side.selectedTeam) : null}
              sourceNames={sourceTeams.map(teamNameById)}
              teamNameById={teamNameById}
              filteredPlayers={side.showSearch ? getFilteredPlayers(sideIndex) : []}
              availablePicks={getAvailablePicks(sideIndex)}
              hasSourceTeams={sourceTeams.length > 0}
              pickOptions={pickOptions}
              pickValues={pickValues}
              onUpdateSide={updateSide}
              onAddPlayer={addPlayer}
              onRemovePlayer={removePlayer}
              onAddGenericPick={addGenericPick}
              onAddOwnedPick={addOwnedPick}
              onRemovePick={removePick}
              formatValue={formatValue}
            />
          );
        })}
      </div>

      {/* Trade comparison bar and verdict */}
      {(totalValue > 0 || populatedSideIndices.length >= 2) && (
        <div className="mt-6 space-y-4">
          {/* Visual comparison bar */}
          {totalValue > 0 && (
            <div className="space-y-2">
              <div className="h-6 rounded-full overflow-hidden flex bg-gray-800">
                {sides.map((_, idx) => {
                  const percent = sidePercents[idx];
                  const bgColor = idx === 0 ? 'bg-sleeper-accent' : idx === 1 ? 'bg-sleeper-green' : 'bg-purple-500';
                  return (
                    <div
                      key={idx}
                      className={`${bgColor} transition-all duration-300 flex items-center justify-center`}
                      style={{ width: `${percent}%` }}
                    >
                      {percent >= 15 && (
                        <span className="text-xs font-medium text-black">
                          {percent.toFixed(1)}%
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
              {sides.length === 3 && (
                <div className="flex justify-between text-xs text-gray-500">
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-sleeper-accent"></span> Team A
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-sleeper-green"></span> Team B
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-purple-500"></span> Team C
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Trade verdict */}
          {tradeCalc && (
            <div className={`text-center py-3 rounded-lg ${
              'isThreeTeam' in tradeCalc
                ? tradeCalc.isBalanced ? 'bg-gray-800' : 'bg-yellow-500/10'
                : tradeCalc.verdict === 'fair'
                  ? 'bg-gray-800'
                  : tradeCalc.verdict === 'side1_wins'
                    ? 'bg-sleeper-accent/10'
                    : 'bg-sleeper-green/10'
            }`}>
              {'isThreeTeam' in tradeCalc ? (
                <>
                  <p className={`text-lg font-semibold ${
                    tradeCalc.isBalanced ? 'text-white' : 'text-yellow-400'
                  }`}>
                    {tradeCalc.isBalanced ? 'Balanced Trade' : 'Imbalanced Trade'}
                  </p>
                  {!tradeCalc.isBalanced && (
                    <div className="text-sm text-gray-400 mt-1">
                      {tradeCalc.sideValues.map(sv => {
                        const diff = sv.deviation;
                        if (Math.abs(diff) <= tradeCalc.band) return null;
                        return (
                          <span key={sv.index} className="block">
                            {sideName(sv.index)}: {formatSigned(diff)} ({diff > 0 ? 'over' : 'under'} average)
                          </span>
                        );
                      })}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <p className={`text-lg font-semibold ${
                    tradeCalc.verdict === 'fair'
                      ? 'text-white'
                      : tradeCalc.verdict === 'side1_wins'
                        ? 'text-sleeper-accent'
                        : 'text-sleeper-green'
                  }`}>
                    {tradeCalc.verdictText}
                  </p>
                  <p className="text-sm text-gray-400">
                    {tradeCalc.verdict !== 'fair'
                      ? `${formatValue(tradeCalc.valueDiff)} value difference`
                      : `Within ${formatValue(fairTradeBand(Math.max(tradeCalc.side1.totalValue, tradeCalc.side2.totalValue)))} either way`}
                    {sideAdjustments.some(a => a > 0) && ' · includes value adjustment'}
                  </p>
                </>
              )}
            </div>
          )}

          {/* Win-now vs long-term */}
          {horizonImpact && (
            <div className="bg-gray-800 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-gray-400 mb-1">Win-Now vs Long-Term</h3>
              <p className="text-xs text-gray-500 mb-3">
                Long-term uses dynasty values; this season uses redraft values, where picks count for nothing.
              </p>
              <div className="space-y-2">
                {horizonImpact.map(team => (
                  <div key={team.sideIndex} className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    <span className="text-white truncate flex-1 min-w-[8rem]">{team.name}</span>
                    <span className="text-sm">
                      <span className="text-gray-500">Long-term </span>
                      <span className={team.dynasty >= 0 ? 'text-sleeper-green' : 'text-sleeper-red'}>
                        {formatSigned(team.dynasty)}
                      </span>
                    </span>
                    <span className="text-sm">
                      <span className="text-gray-500">This season </span>
                      <span className={team.winNow >= 0 ? 'text-sleeper-green' : 'text-sleeper-red'}>
                        {formatSigned(team.winNow)}
                      </span>
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded bg-gray-700 text-gray-300">
                      {horizonLabel(team.dynasty, team.winNow)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Team value rank impact */}
          {powerRankingsImpact && powerRankingsImpact.length >= 2 && (
            <div className="bg-gray-800 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-gray-400 mb-1">Team Value Rank Impact</h3>
              <p className="text-xs text-gray-500 mb-3">League rank by total dynasty value of players plus owned picks.</p>
              <div className={`grid gap-4 ${powerRankingsImpact.length === 3 ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}>
                {powerRankingsImpact.map((team) => (
                  <div key={team.rosterId} className="flex items-center justify-between">
                    <span className="text-white truncate mr-2">{team.name}</span>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-gray-400">#{team.oldRank}</span>
                      <span className="text-gray-500">→</span>
                      <span className="text-white">#{team.newRank}</span>
                      {team.rankChange !== 0 && (
                        <span className={`text-sm ${
                          team.rankChange > 0
                            ? 'text-sleeper-green'
                            : 'text-sleeper-red'
                        }`}>
                          ({team.rankChange > 0 ? '↑' : '↓'}
                          {Math.abs(team.rankChange)})
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Short read on what kind of move this is for a team
function horizonLabel(dynasty: number, winNow: number): string {
  const noise = 250;
  const gainsLong = dynasty > noise;
  const losesLong = dynasty < -noise;
  const gainsNow = winNow > noise;
  const losesNow = winNow < -noise;
  if (gainsLong && gainsNow) return 'Wins both';
  if (losesLong && losesNow) return 'Loses both';
  if (gainsNow) return 'Win-now move';
  if (gainsLong) return 'Rebuilding move';
  return 'Roughly even';
}

// Trade Side Component
interface TradeSideProps {
  sideIndex: number;
  side: TradeSideState;
  sideTotal: number;
  adjustment: number;
  teamLabel: string;
  teamName: string | null;
  sourceNames: string[];
  teamNameById: (rosterId: number) => string;
  filteredPlayers: PlayerOption[];
  availablePicks: PickOption[];
  hasSourceTeams: boolean;
  pickOptions: ReturnType<typeof getDraftPickOptions>;
  pickValues: Record<string, number>;
  onUpdateSide: (sideIndex: number, updates: Partial<TradeSideState>) => void;
  onAddPlayer: (sideIndex: number, player: SelectedPlayer) => void;
  onRemovePlayer: (sideIndex: number, playerId: string) => void;
  onAddGenericPick: (sideIndex: number, season: string, round: number) => void;
  onAddOwnedPick: (sideIndex: number, option: PickOption) => void;
  onRemovePick: (sideIndex: number, pickId: string) => void;
  formatValue: (value: number) => string;
}

function TradeSide({
  sideIndex,
  side,
  sideTotal,
  adjustment,
  teamLabel,
  teamName,
  sourceNames,
  teamNameById,
  filteredPlayers,
  availablePicks,
  hasSourceTeams,
  pickOptions,
  pickValues,
  onUpdateSide,
  onAddPlayer,
  onRemovePlayer,
  onAddGenericPick,
  onAddOwnedPick,
  onRemovePick,
  formatValue,
}: TradeSideProps) {
  const hasNoAssets = side.players.length === 0 && side.picks.length === 0;
  const fromLabel = sourceNames.length > 0 ? ` from ${sourceNames.join(' / ')}` : '';

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-gray-400">
        {teamName ? `${teamName} Receives` : `Team ${teamLabel} Receives`}
      </h3>

      {/* Selected players and picks */}
      <div className="space-y-2">
        {side.players.map(player => (
          <div
            key={player.id}
            className="flex items-center gap-2 p-2 bg-gray-800/50 rounded-lg"
          >
            <Image
              src={getPlayerAvatarUrl(player.id)}
              alt={player.name}
              width={32}
              height={32}
              className="rounded-full"
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{player.name}</p>
              <p className={`text-xs ${getPositionTextColor(player.position)}`}>
                {player.position} - {player.team}
              </p>
            </div>
            <span className="text-sm text-sleeper-accent font-medium">
              {formatValue(player.value)}
            </span>
            <button
              onClick={() => onRemovePlayer(sideIndex, player.id)}
              className="text-gray-500 hover:text-sleeper-red transition-colors"
              aria-label={`Remove ${player.name}`}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}

        {/* Selected picks */}
        {side.picks.map(pickItem => (
          <div
            key={pickItem.id}
            className="flex items-center gap-2 p-2 bg-gray-800/50 rounded-lg"
          >
            <div className="w-8 h-8 rounded-full bg-sleeper-accent/20 flex items-center justify-center">
              <span className="text-sleeper-accent text-xs font-bold">
                {pickItem.pick.round}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white">
                {pickItem.pick.key}
                {pickItem.tier !== 'Mid' && <span className="text-gray-400 font-normal"> ({pickItem.tier})</span>}
              </p>
              <p className="text-xs text-gray-400 truncate">
                {pickItem.originalRosterId !== null
                  ? `${teamNameById(pickItem.originalRosterId)}'s pick`
                  : 'Draft Pick'}
              </p>
            </div>
            <span className="text-sm text-sleeper-accent font-medium">
              {formatValue(pickItem.value)}
            </span>
            <button
              onClick={() => onRemovePick(sideIndex, pickItem.id)}
              className="text-gray-500 hover:text-sleeper-red transition-colors"
              aria-label={`Remove ${pickItem.pick.key}`}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}

        {/* Empty state placeholder for 3-team mode */}
        {hasNoAssets && (
          <div className="p-4 bg-gray-800/30 rounded-lg border border-dashed border-gray-700">
            <p className="text-xs text-gray-500 text-center">
              Add players or picks to include in trade
            </p>
          </div>
        )}
      </div>

      {/* Search input */}
      <div className="relative">
        <input
          type="text"
          placeholder={`+ Add Player${fromLabel}`}
          value={side.search}
          onChange={(e) => {
            onUpdateSide(sideIndex, { search: e.target.value, showSearch: true });
          }}
          onFocus={() => onUpdateSide(sideIndex, { showSearch: true })}
          // The input keeps focus after a pick, so a click must reopen the list
          onClick={() => !side.showSearch && onUpdateSide(sideIndex, { showSearch: true })}
          onBlur={() => onUpdateSide(sideIndex, { showSearch: false })}
          className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 text-sm focus:outline-none focus:border-sleeper-accent"
        />

        {side.showSearch && filteredPlayers.length > 0 && (
          <div className="absolute z-10 w-full mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-lg max-h-60 overflow-y-auto">
            {filteredPlayers.map(player => (
              <button
                key={player.id}
                // Keep focus in the input so blur doesn't close the list
                // before the click lands
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onAddPlayer(sideIndex, player)}
                className="w-full flex items-center gap-2 p-2 hover:bg-gray-700 transition-colors text-left"
              >
                <Image
                  src={getPlayerAvatarUrl(player.id)}
                  alt={player.name}
                  width={24}
                  height={24}
                  className="rounded-full"
                />
                <span className="text-sm text-white flex-1">{player.name}</span>
                <span className={`text-xs ${getPositionTextColor(player.position)}`}>
                  {player.position}
                </span>
                <span className="text-xs text-gray-500">{player.team}</span>
                <span className="text-xs text-sleeper-accent">{formatValue(player.value)}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Pick selector */}
      <PickSelector
        show={side.showPickSelector}
        onToggle={() => onUpdateSide(sideIndex, { showPickSelector: !side.showPickSelector })}
        onAddGeneric={(season, round) => onAddGenericPick(sideIndex, season, round)}
        onAddOwned={(option) => onAddOwnedPick(sideIndex, option)}
        availablePicks={availablePicks}
        hasSourceTeams={hasSourceTeams}
        fromLabel={fromLabel}
        teamNameById={teamNameById}
        pickOptions={pickOptions}
        pickValues={pickValues}
        formatValue={formatValue}
      />

      {/* Side Total */}
      <div className="pt-2 border-t border-gray-700 space-y-1">
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-400">Total:</span>
          <span className="text-lg font-bold text-white">{formatValue(sideTotal + adjustment)}</span>
        </div>
        {adjustment > 0 && (
          <div
            className="flex justify-between items-center text-xs"
            title="Receiving fewer, better pieces: the other side's extra depth pieces count for less"
          >
            <span className="text-gray-500">Includes value adjustment</span>
            <span className="text-sleeper-green">+{formatValue(adjustment)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// Pick Selector Component
interface PickSelectorProps {
  show: boolean;
  onToggle: () => void;
  onAddGeneric: (season: string, round: number) => void;
  onAddOwned: (option: PickOption) => void;
  availablePicks: PickOption[];
  hasSourceTeams: boolean;
  fromLabel: string;
  teamNameById: (rosterId: number) => string;
  pickOptions: ReturnType<typeof getDraftPickOptions>;
  pickValues: Record<string, number>;
  formatValue: (value: number) => string;
}

function PickSelector({
  show,
  onToggle,
  onAddGeneric,
  onAddOwned,
  availablePicks,
  hasSourceTeams,
  fromLabel,
  teamNameById,
  pickOptions,
  pickValues,
  formatValue,
}: PickSelectorProps) {
  const [season, setSeason] = useState(pickOptions.seasons[0]);
  const [round, setRound] = useState(1);
  const [generic, setGeneric] = useState(false);

  const currentKey = `${season} ${pickRoundLabel(round)}`;
  const currentValue = pickValues[currentKey] || 0;

  const close = () => {
    setGeneric(false);
    onToggle();
  };

  if (!show) {
    return (
      <button
        onClick={onToggle}
        className="w-full px-3 py-2 bg-gray-800 border border-gray-700 border-dashed rounded-lg text-gray-500 text-sm hover:border-sleeper-accent hover:text-sleeper-accent transition-colors"
      >
        + Add Pick{fromLabel}
      </button>
    );
  }

  // Trading partners selected: list the picks they actually hold
  if (hasSourceTeams && !generic) {
    return (
      <div className="p-3 bg-gray-800 border border-gray-700 rounded-lg space-y-2">
        <div className="max-h-60 overflow-y-auto">
          {availablePicks.length === 0 && (
            <p className="text-xs text-gray-500 py-2">No remaining picks{fromLabel}.</p>
          )}
          {availablePicks.map(option => (
            <button
              key={option.id}
              onClick={() => onAddOwned(option)}
              className="w-full flex items-center gap-2 py-1.5 px-1 hover:bg-gray-700 transition-colors text-left rounded"
            >
              <span className="text-sm text-white">
                {option.season} {pickRoundLabel(option.round)}
                {option.tier !== 'Mid' && <span className="text-gray-400"> ({option.tier})</span>}
              </span>
              <span className="text-xs text-gray-500 flex-1 truncate">
                {option.originalRosterId !== option.ownerRosterId
                  ? `via ${teamNameById(option.originalRosterId)}`
                  : ''}
              </span>
              <span className="text-xs text-sleeper-accent">{formatValue(option.value)}</span>
            </button>
          ))}
        </div>
        <div className="flex items-center justify-between">
          <button
            onClick={() => setGeneric(true)}
            className="text-xs text-gray-500 hover:text-white transition-colors"
          >
            Add a generic pick instead
          </button>
          <button
            onClick={close}
            className="px-3 py-1 text-sm text-gray-400 hover:text-white transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 bg-gray-800 border border-gray-700 rounded-lg space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Year</label>
          <select
            value={season}
            onChange={(e) => setSeason(e.target.value)}
            className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white text-sm focus:outline-none focus:border-sleeper-accent"
          >
            {pickOptions.seasons.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Round</label>
          <select
            value={round}
            onChange={(e) => setRound(Number(e.target.value))}
            className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white text-sm focus:outline-none focus:border-sleeper-accent"
          >
            {pickOptions.rounds.map(r => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-400">
          {currentKey}: <span className="text-sleeper-accent">{currentValue.toLocaleString()}</span>
        </span>
        <div className="flex gap-2">
          <button
            onClick={close}
            className="px-3 py-1 text-sm text-gray-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              setGeneric(false);
              onAddGeneric(season, round);
            }}
            className="px-3 py-1 bg-sleeper-accent text-black text-sm font-medium rounded hover:bg-sleeper-accent/80 transition-colors"
          >
            Add
          </button>
        </div>
      </div>
    </div>
  );
}
