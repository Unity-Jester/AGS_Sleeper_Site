'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface FoundLeague {
  league_id: string;
  name: string;
  season: string;
  total_rosters: number;
}

const SLEEPER_API_BASE = 'https://api.sleeper.app/v1';

function rememberLeague(leagueId: string) {
  document.cookie = `lastLeagueId=${leagueId}; path=/; max-age=31536000; samesite=lax`;
}

// Entry point when no league is configured: paste a league ID directly, or
// look up leagues by Sleeper username (the Sleeper API is public and CORS-
// enabled, so lookups run straight from the browser).
export default function LeaguePicker() {
  const router = useRouter();
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [leagues, setLeagues] = useState<FoundLeague[] | null>(null);
  const [searchedUser, setSearchedUser] = useState('');

  const openLeague = (leagueId: string) => {
    rememberLeague(leagueId);
    router.push(`/league/${leagueId}`);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = input.trim();
    if (!value) return;

    // Pure digits = league ID
    if (/^\d+$/.test(value)) {
      openLeague(value);
      return;
    }

    // Otherwise treat as a Sleeper username
    setLoading(true);
    setError(null);
    setLeagues(null);
    try {
      const userRes = await fetch(`${SLEEPER_API_BASE}/user/${encodeURIComponent(value)}`);
      const user = userRes.ok ? await userRes.json() : null;
      if (!user?.user_id) {
        setError(`No Sleeper user named "${value}" found.`);
        return;
      }

      const year = new Date().getFullYear();
      let found: FoundLeague[] = [];
      for (const season of [year, year - 1]) {
        const res = await fetch(`${SLEEPER_API_BASE}/user/${user.user_id}/leagues/nfl/${season}`);
        if (res.ok) {
          const data: FoundLeague[] = await res.json();
          if (data?.length) {
            found = data;
            break;
          }
        }
      }

      if (found.length === 0) {
        setError(`"${value}" has no NFL leagues in ${year} or ${year - 1}.`);
        return;
      }
      setSearchedUser(value);
      setLeagues(found);
    } catch {
      setError('Could not reach the Sleeper API. Try again in a moment.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-lg mx-auto py-12">
      <div className="text-center mb-8">
        <div className="w-14 h-14 bg-sleeper-accent rounded-2xl flex items-center justify-center mx-auto mb-4">
          <span className="text-sleeper-dark font-bold text-2xl">S</span>
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">Sleeper League Hub</h1>
        <p className="text-gray-400">
          Standings, matchups, trade grades, draft analysis, and league history for any Sleeper league.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="League ID or Sleeper username"
          className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-sleeper-accent"
          autoFocus
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="w-full px-4 py-3 bg-sleeper-accent text-sleeper-dark font-semibold rounded-lg hover:bg-sleeper-accent/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Looking up…' : 'View League'}
        </button>
      </form>

      {error && <p className="text-sleeper-red text-sm mt-4 text-center">{error}</p>}

      {leagues && (
        <div className="mt-6 space-y-2">
          <p className="text-sm text-gray-400">
            Leagues for <span className="text-white">{searchedUser}</span>:
          </p>
          {leagues.map(league => (
            <button
              key={league.league_id}
              onClick={() => openLeague(league.league_id)}
              className="w-full flex items-center justify-between px-4 py-3 bg-sleeper-darker border border-gray-800 rounded-lg hover:border-sleeper-accent transition-colors text-left"
            >
              <div>
                <p className="text-white font-medium">{league.name}</p>
                <p className="text-xs text-gray-500">
                  {league.season} season &middot; {league.total_rosters} teams
                </p>
              </div>
              <span className="text-sleeper-accent">→</span>
            </button>
          ))}
        </div>
      )}

      <p className="text-xs text-gray-600 mt-8 text-center">
        Find your League ID in the Sleeper app under League Settings.
      </p>
    </div>
  );
}
