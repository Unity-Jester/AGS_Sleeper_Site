'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { cn, getPositionTextColor, ordinalSuffix } from '@/lib/utils';
import { DraftGrade, gradeDraftValue } from '@/lib/draftValues';

export interface ExplorerManager {
  ownerId: string;
  teamName: string;
  avatarUrl: string;
  // Sleeper usernames/display names, used to preselect the viewer's team
  names: string[];
  // Rank in the overall draft rankings (startup excluded), if ranked
  rank: number | null;
}

export interface ExplorerPick {
  ownerId: string;
  draftId: string;
  season: string;
  isStartup: boolean;
  round: number;
  pickNo: number;
  pickInRound: number;
  playerId: string;
  playerName: string;
  position: string;
  pickValue: number;
  currentValue: number;
  valueDiff: number;
}

const STORAGE_KEY = 'draftExplorerOwner';

function formatValue(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 1000) return sign + (abs / 1000).toFixed(1) + 'K';
  return sign + Math.round(abs).toString();
}

function formatDiff(value: number): string {
  return (value >= 0 ? '+' : '') + formatValue(value);
}

function getValueColor(diff: number): string {
  if (diff > 2000) return 'text-sleeper-green';
  if (diff > 0) return 'text-green-400';
  if (diff > -2000) return 'text-yellow-400';
  return 'text-sleeper-red';
}

function gradeClasses(grade: DraftGrade): string {
  if (grade.startsWith('A')) return 'bg-sleeper-green/15 text-sleeper-green';
  if (grade.startsWith('B')) return 'bg-green-500/15 text-green-400';
  if (grade.startsWith('C')) return 'bg-yellow-500/15 text-yellow-400';
  return 'bg-red-500/15 text-sleeper-red';
}

function GradeBadge({ grade, large }: { grade: DraftGrade; large?: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center rounded font-bold',
        large ? 'w-12 h-12 text-xl' : 'w-9 h-6 text-xs',
        gradeClasses(grade)
      )}
    >
      {grade}
    </span>
  );
}

function readCookie(name: string): string | null {
  const match = document.cookie.split('; ').find(c => c.startsWith(name + '='));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

export default function DraftPicksExplorer({
  managers,
  picks,
}: {
  managers: ExplorerManager[];
  picks: ExplorerPick[];
}) {
  const [ownerId, setOwnerId] = useState(managers[0]?.ownerId ?? '');

  // Preselect the viewer's own team: last choice, else the Sleeper
  // username saved from the portfolio page
  useEffect(() => {
    let preferred: string | null = null;
    try {
      preferred = localStorage.getItem(STORAGE_KEY);
    } catch {
      // storage unavailable
    }
    if (!preferred || !managers.some(m => m.ownerId === preferred)) {
      const username = readCookie('portfolioUsername')?.toLowerCase();
      preferred = username
        ? managers.find(m => m.names.some(n => n.toLowerCase() === username))?.ownerId ?? null
        : null;
    }
    if (preferred && managers.some(m => m.ownerId === preferred)) {
      setOwnerId(preferred);
    }
  }, [managers]);

  const selectOwner = (id: string) => {
    setOwnerId(id);
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // storage unavailable
    }
  };

  const manager = managers.find(m => m.ownerId === ownerId);

  const { drafts, scored } = useMemo(() => {
    const mine = picks.filter(p => p.ownerId === ownerId);
    const byDraft = new Map<string, ExplorerPick[]>();
    for (const p of mine) {
      if (!byDraft.has(p.draftId)) byDraft.set(p.draftId, []);
      byDraft.get(p.draftId)!.push(p);
    }
    const drafts = Array.from(byDraft.values())
      .map(list => list.sort((a, b) => a.pickNo - b.pickNo))
      .sort((a, b) => parseInt(b[0].season) - parseInt(a[0].season));
    return { drafts, scored: mine.filter(p => !p.isStartup) };
  }, [picks, ownerId]);

  const totalPick = scored.reduce((s, p) => s + p.pickValue, 0);
  const totalCurrent = scored.reduce((s, p) => s + p.currentValue, 0);
  const totalDiff = totalCurrent - totalPick;

  if (managers.length === 0) return null;

  return (
    <div className="panel overflow-hidden">
      <div className="px-4 py-3 border-b border-white/[0.06] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">Draft Picks &amp; Grades</h2>
          <p className="text-sm text-gray-400">Every pick a manager has made, graded on value now vs. pick cost</p>
        </div>
        <select
          value={ownerId}
          onChange={e => selectOwner(e.target.value)}
          className="bg-gray-800 text-white text-sm rounded-lg px-3 py-2 border border-white/10 focus:outline-none focus:border-sleeper-green"
          aria-label="Select manager"
        >
          {managers.map(m => (
            <option key={m.ownerId} value={m.ownerId}>
              {m.teamName}
            </option>
          ))}
        </select>
      </div>

      {manager && (
        <div className="p-4 flex items-center gap-4 border-b border-white/[0.06]">
          <Image src={manager.avatarUrl} alt={manager.teamName} width={48} height={48} className="rounded-full" />
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-white truncate">{manager.teamName}</p>
            <p className="text-sm text-gray-400">
              {scored.length} scored pick{scored.length !== 1 ? 's' : ''}
              {manager.rank != null && ` · ${ordinalSuffix(manager.rank)} in draft rankings`}
            </p>
          </div>
          {scored.length > 0 && (
            <>
              <div className="text-right">
                <p className={`text-lg font-bold ${getValueColor(totalDiff)}`}>{formatDiff(totalDiff)}</p>
                <p className="text-xs text-gray-500">
                  {formatValue(totalPick)} → {formatValue(totalCurrent)}
                </p>
              </div>
              <GradeBadge grade={gradeDraftValue(totalPick, totalCurrent)} large />
            </>
          )}
        </div>
      )}

      {drafts.length === 0 && (
        <p className="p-4 text-sm text-gray-400">No draft picks found for this manager.</p>
      )}

      <div className="divide-y divide-white/[0.06]">
        {drafts.map(list => {
          const first = list[0];
          const dPick = list.reduce((s, p) => s + p.pickValue, 0);
          const dCurrent = list.reduce((s, p) => s + p.currentValue, 0);
          return (
            <div key={first.draftId}>
              <div className="px-4 py-2 bg-gray-800/30 flex items-center justify-between">
                <p className="text-sm font-semibold text-white">
                  {first.season} {first.isStartup ? 'Startup Draft' : 'Draft'}
                  {first.isStartup && (
                    <span className="ml-2 text-xs font-normal text-gray-500">not scored</span>
                  )}
                </p>
                {!first.isStartup && (
                  <div className="flex items-center gap-3">
                    <span className={`text-sm font-medium ${getValueColor(dCurrent - dPick)}`}>
                      {formatDiff(dCurrent - dPick)}
                    </span>
                    <GradeBadge grade={gradeDraftValue(dPick, dCurrent)} />
                  </div>
                )}
              </div>
              <div className="divide-y divide-white/[0.04]">
                {list.map(p => (
                  <div
                    key={`${p.draftId}-${p.pickNo}`}
                    className={cn('px-4 py-2.5 flex items-center gap-3', p.isStartup && 'opacity-70')}
                  >
                    <span className="w-12 shrink-0 text-xs text-gray-500 tabular-nums">
                      {p.round}.{String(p.pickInRound).padStart(2, '0')}
                    </span>
                    <Image
                      src={`https://sleepercdn.com/content/nfl/players/${p.playerId}.jpg`}
                      alt={p.playerName}
                      width={32}
                      height={32}
                      className="rounded-full"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-medium truncate">{p.playerName}</p>
                      <p className="text-xs text-gray-400">
                        <span className={getPositionTextColor(p.position)}>{p.position || '—'}</span>
                        <span className="ml-2">Pick {p.pickNo}</span>
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-medium ${getValueColor(p.valueDiff)}`}>{formatDiff(p.valueDiff)}</p>
                      <p className="text-xs text-gray-500">
                        {formatValue(p.pickValue)} → {formatValue(p.currentValue)}
                      </p>
                    </div>
                    {p.isStartup ? (
                      <span className="w-9 text-center text-xs text-gray-600">—</span>
                    ) : (
                      <GradeBadge grade={gradeDraftValue(p.pickValue, p.currentValue)} />
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
