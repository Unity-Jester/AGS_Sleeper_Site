'use client';

import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { weekLabel } from '@/lib/leagueWeeks';

interface WeekSelectorProps {
  currentWeek: number;
  totalWeeks: number;
  playoffSettings: { playoff_week_start: number; playoff_teams: number; playoff_round_type: number };
  seasonParam?: string;
}

export default function WeekSelector({ currentWeek, totalWeeks, playoffSettings, seasonParam }: WeekSelectorProps) {
  const router = useRouter();
  const pathname = usePathname();

  const handleWeekChange = (week: number) => {
    const params = new URLSearchParams();
    params.set('week', week.toString());
    // Stay on the season being viewed
    if (seasonParam) {
      params.set('season', seasonParam);
    }
    router.push(`${pathname}?${params.toString()}`);
  };

  const weeks = Array.from({ length: totalWeeks }, (_, i) => i + 1);

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => handleWeekChange(Math.max(1, currentWeek - 1))}
        disabled={currentWeek <= 1}
        className={cn(
          'p-2 rounded-lg transition-colors',
          currentWeek <= 1
            ? 'text-gray-600 cursor-not-allowed'
            : 'text-gray-400 hover:bg-gray-800 hover:text-white'
        )}
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
      </button>

      <select
        value={currentWeek}
        onChange={(e) => handleWeekChange(parseInt(e.target.value))}
        className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-sleeper-accent"
      >
        {weeks.map((week) => (
          <option key={week} value={week}>
            {weekLabel(playoffSettings, week)}
          </option>
        ))}
      </select>

      <button
        onClick={() => handleWeekChange(Math.min(totalWeeks, currentWeek + 1))}
        disabled={currentWeek >= totalWeeks}
        className={cn(
          'p-2 rounded-lg transition-colors',
          currentWeek >= totalWeeks
            ? 'text-gray-600 cursor-not-allowed'
            : 'text-gray-400 hover:bg-gray-800 hover:text-white'
        )}
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </div>
  );
}
