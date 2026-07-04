'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

// Username entry for the portfolio view; remembers the last username.
export default function PortfolioEntry() {
  const router = useRouter();
  const [username, setUsername] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const value = username.trim();
    if (!value) return;
    document.cookie = `portfolioUsername=${encodeURIComponent(value)}; path=/; max-age=31536000; samesite=lax`;
    router.push(`/portfolio/${encodeURIComponent(value)}`);
  };

  return (
    <div className="max-w-lg mx-auto py-16">
      <div className="text-center mb-10">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-b from-gold-400 to-gold-600 flex items-center justify-center mx-auto mb-6 shadow-gold-glow animate-rise">
          <svg viewBox="0 0 24 24" className="w-9 h-9 text-sleeper-dark" fill="currentColor" aria-hidden="true">
            <path d="M3 7.5l4.6 4.1L12 4.5l4.4 7.1L21 7.5l-1.7 9.7a1 1 0 01-1 .8H5.7a1 1 0 01-1-.8L3 7.5z" />
          </svg>
        </div>
        <h1 className="font-display text-4xl text-white mb-4 animate-rise" style={{ animationDelay: '80ms' }}>
          Your <span className="text-gold-gradient">Portfolio</span>
        </h1>
        <p className="text-gray-400 animate-rise" style={{ animationDelay: '160ms' }}>
          Every league, every window, every shared player &mdash; one command center for
          your whole dynasty empire.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3 animate-rise" style={{ animationDelay: '240ms' }}>
        <input
          type="text"
          value={username}
          onChange={e => setUsername(e.target.value)}
          placeholder="Sleeper username"
          className="w-full px-4 py-3.5 bg-white/[0.04] border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-gold-500/60 focus:bg-white/[0.06] transition-colors"
          autoFocus
        />
        <button
          type="submit"
          disabled={!username.trim()}
          className="w-full px-4 py-3.5 bg-gradient-to-b from-gold-400 to-gold-600 text-sleeper-dark font-semibold rounded-xl hover:shadow-gold-glow hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-none"
        >
          View My Leagues
        </button>
      </form>
    </div>
  );
}
