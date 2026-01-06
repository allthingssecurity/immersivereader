import React from 'react';
import type { Theme } from '@/pages/App';

export function TopBar({ theme, setTheme }: { theme: Theme, setTheme: (t: Theme) => void }) {
  return (
    <header className="h-14 border-b border-slate-200/60 bg-[var(--panel)]/60 backdrop-blur flex items-center px-4 gap-3">
      <Logo />
      <div className="font-semibold tracking-tight">Lumen Reader</div>
      <div className="ml-auto flex items-center gap-2">
        <select
          aria-label="Theme"
          className="bg-transparent border rounded px-2 py-1"
          value={theme}
          onChange={(e) => setTheme(e.target.value as Theme)}
        >
          <option value="light">Light</option>
          <option value="dark">Dark</option>
          <option value="sepia">Sepia</option>
        </select>
      </div>
    </header>
  );
}

function Logo() {
  return (
    <div className="flex items-center gap-2 select-none">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
        <circle cx="12" cy="12" r="10" fill="url(#g)"/>
        <defs>
          <linearGradient id="g" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
            <stop stopColor="#2a98ff"/>
            <stop offset="1" stopColor="#0f7ae5"/>
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}
