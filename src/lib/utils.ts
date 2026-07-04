// Utility functions

import { SleeperUser } from './types';

export function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ');
}

// Canonical display name for a team: custom team name, then Sleeper
// display name, then username, then a roster-id fallback.
export function getTeamName(user: SleeperUser | null | undefined, rosterId: number): string {
  return (
    user?.metadata?.team_name ||
    user?.display_name ||
    user?.username ||
    `Team ${rosterId}`
  );
}

// Draft round label matching FantasyCalc's pick naming ("1st".."4th").
// Rounds past 4 clamp to "4th": external value sources only price rounds
// 1-4, and a late pick priced as a 4th beats being priced at zero.
export function pickRoundLabel(round: number): string {
  if (round === 1) return '1st';
  if (round === 2) return '2nd';
  if (round === 3) return '3rd';
  return '4th';
}

// Parse a single CSV line handling quoted fields
export function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      fields.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  fields.push(current);

  return fields;
}

// Normalize a player name for cross-source matching: strip generational
// suffixes, then everything that isn't a letter. Both sides of any lookup
// must use this same function.
export function normalizePlayerName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+(jr|sr|ii|iii|iv|v)\.?\s*$/i, '')
    .replace(/[^a-z]/g, '');
}

export function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatDateTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function timeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);

  const intervals = [
    { label: 'year', seconds: 31536000 },
    { label: 'month', seconds: 2592000 },
    { label: 'week', seconds: 604800 },
    { label: 'day', seconds: 86400 },
    { label: 'hour', seconds: 3600 },
    { label: 'minute', seconds: 60 },
  ];

  for (const interval of intervals) {
    const count = Math.floor(seconds / interval.seconds);
    if (count >= 1) {
      return `${count} ${interval.label}${count > 1 ? 's' : ''} ago`;
    }
  }

  return 'Just now';
}

export function getPositionColor(position: string): string {
  const colors: Record<string, string> = {
    QB: 'bg-red-500',
    RB: 'bg-green-500',
    WR: 'bg-blue-500',
    TE: 'bg-yellow-500',
    K: 'bg-purple-500',
    DEF: 'bg-orange-500',
    FLEX: 'bg-pink-500',
    SUPER_FLEX: 'bg-indigo-500',
    BN: 'bg-gray-500',
  };
  return colors[position] || 'bg-gray-500';
}

export function getPositionTextColor(position: string): string {
  const colors: Record<string, string> = {
    QB: 'text-red-400',
    RB: 'text-green-400',
    WR: 'text-blue-400',
    TE: 'text-yellow-400',
    K: 'text-purple-400',
    DEF: 'text-orange-400',
    FLEX: 'text-pink-400',
    SUPER_FLEX: 'text-indigo-400',
    BN: 'text-gray-400',
  };
  return colors[position] || 'text-gray-400';
}

export function ordinalSuffix(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export function getLeagueId(): string {
  return process.env.NEXT_PUBLIC_LEAGUE_ID || '';
}

export function abbreviateNumber(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return num.toString();
}
