'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

interface CollapsibleSectionProps {
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

export default function CollapsibleSection({
  title,
  subtitle,
  defaultOpen = false,
  children,
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="bg-sleeper-darker rounded-lg overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-3 border-b border-gray-800 flex items-center justify-between hover:bg-gray-800/30 transition-colors"
      >
        <div className="text-left">
          <h2 className="text-lg font-semibold text-white">{title}</h2>
          {subtitle && <p className="text-sm text-gray-400">{subtitle}</p>}
        </div>
        <svg
          className={cn(
            'w-5 h-5 text-gray-400 transition-transform',
            isOpen && 'rotate-180'
          )}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {isOpen && <div className="divide-y divide-gray-800">{children}</div>}
    </div>
  );
}
