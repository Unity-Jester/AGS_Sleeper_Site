'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

const navItems = [
  { path: '', label: 'Dashboard' },
  { path: '/matchups', label: 'Matchups' },
  { path: '/draft', label: 'Draft' },
  { path: '/trades', label: 'Trades' },
  { path: '/history', label: 'History' },
  { path: '/settings', label: 'Settings' },
];

export default function Navigation() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  // Close the mobile menu on navigation
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  // League pages live under /league/[leagueId]; outside a league there is
  // nothing to link to except the picker.
  const leagueMatch = pathname.match(/^\/league\/([^/]+)/);
  const base = leagueMatch ? `/league/${leagueMatch[1]}` : null;
  const links = base
    ? navItems.map(item => ({ href: `${base}${item.path}`, label: item.label }))
    : [];

  return (
    <nav className="bg-sleeper-darker border-b border-gray-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center">
            <Link href="/" className="flex items-center gap-2">
              <div className="w-8 h-8 bg-sleeper-accent rounded-lg flex items-center justify-center">
                <span className="text-sleeper-dark font-bold text-lg">S</span>
              </div>
              <span className="text-white font-semibold text-lg hidden sm:block">
                Sleeper League
              </span>
            </Link>
          </div>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-1">
            {links.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'px-3 py-2 rounded-md text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-sleeper-accent text-sleeper-dark'
                      : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
            <Link
              href="/start"
              className="ml-2 px-3 py-2 rounded-md text-sm font-medium text-gray-500 hover:bg-gray-800 hover:text-white transition-colors"
              title="Switch league"
            >
              {base ? 'Switch League' : 'Find a League'}
            </Link>
          </div>

          {/* Mobile hamburger */}
          <button
            type="button"
            onClick={() => setMenuOpen(open => !open)}
            className="md:hidden p-2 rounded-md text-gray-300 hover:bg-gray-800 hover:text-white transition-colors"
            aria-expanded={menuOpen}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          >
            {menuOpen ? (
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Mobile menu panel */}
      {menuOpen && (
        <div className="md:hidden border-t border-gray-800 px-4 py-3 space-y-1">
          {links.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'block px-3 py-2 rounded-md text-base font-medium transition-colors',
                  isActive
                    ? 'bg-sleeper-accent text-sleeper-dark'
                    : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                )}
              >
                {item.label}
              </Link>
            );
          })}
          <Link
            href="/start"
            className="block px-3 py-2 rounded-md text-base font-medium text-gray-500 hover:bg-gray-800 hover:text-white transition-colors"
          >
            {base ? 'Switch League' : 'Find a League'}
          </Link>
        </div>
      )}
    </nav>
  );
}
