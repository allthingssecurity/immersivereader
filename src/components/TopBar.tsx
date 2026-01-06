import React, { useEffect, useState } from 'react';
import type { Theme } from '@/pages/App';

type Props = {
  theme: Theme;
  setTheme: (t: Theme) => void;
  zenMode?: boolean;
  onToggleZen?: () => void;
  sessionTime?: number;
};

export function TopBar({ theme, setTheme, zenMode, onToggleZen, sessionTime = 0 }: Props) {
  const [time, setTime] = useState(sessionTime);

  useEffect(() => {
    const interval = setInterval(() => setTime((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  };

  if (zenMode) return null;

  return (
    <header className="h-14 border-b border-[var(--border)] glass flex items-center px-5 gap-4 sticky top-0 z-50">
      <Logo />
      <div className="font-semibold tracking-tight text-[var(--fg)] text-lg">
        Lumen Reader
      </div>

      <div className="ml-auto flex items-center gap-3">
        {/* Reading session timer */}
        <div className="stat-badge" title="Reading session time">
          <svg className="stat-badge-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>{formatTime(time)}</span>
        </div>

        {/* Zen mode toggle */}
        {onToggleZen && (
          <button
            className="btn btn-ghost tooltip"
            data-tooltip="Zen Mode (F)"
            onClick={onToggleZen}
            aria-label="Toggle Zen Mode"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M8 14s1.5 2 4 2 4-2 4-2" />
              <line x1="9" y1="9" x2="9.01" y2="9" />
              <line x1="15" y1="9" x2="15.01" y2="9" />
            </svg>
          </button>
        )}

        {/* Theme selector */}
        <div className="relative">
          <select
            aria-label="Theme"
            className="select appearance-none pr-8 pl-3 py-1.5 text-sm font-medium cursor-pointer"
            value={theme}
            onChange={(e) => setTheme(e.target.value as Theme)}
          >
            <option value="light">☀️ Light</option>
            <option value="dark">🌙 Dark</option>
            <option value="sepia">📜 Sepia</option>
          </select>
          <svg
            className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none text-[var(--fg-muted)]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>

        {/* Keyboard shortcuts hint */}
        <button
          className="btn btn-ghost tooltip"
          data-tooltip="Keyboard Shortcuts"
          onClick={() => window.dispatchEvent(new CustomEvent('lumen:show-shortcuts'))}
          aria-label="Show keyboard shortcuts"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="4" width="20" height="16" rx="2" ry="2" />
            <path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M6 12h.01M10 12h.01M14 12h.01M18 12h.01M6 16h12" />
          </svg>
        </button>
      </div>
    </header>
  );
}

function Logo() {
  return (
    <div className="flex items-center gap-2 select-none">
      <div className="relative">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
          <defs>
            <linearGradient id="logo-gradient" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
              <stop stopColor="#3b82f6" />
              <stop offset="0.5" stopColor="#8b5cf6" />
              <stop offset="1" stopColor="#ec4899" />
            </linearGradient>
            <filter id="glow">
              <feGaussianBlur stdDeviation="2" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <circle cx="12" cy="12" r="10" fill="url(#logo-gradient)" filter="url(#glow)" />
          <path
            d="M8 12.5L11 15.5L16 9"
            stroke="white"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <div className="absolute inset-0 rounded-full bg-[var(--accent)] opacity-20 blur-lg animate-pulse" />
      </div>
    </div>
  );
}
