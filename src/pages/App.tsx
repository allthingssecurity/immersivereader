import React, { useEffect, useMemo, useRef, useState } from 'react';
import { LibrarySidebar, TocItem } from '@/components/LibrarySidebar';
import { Reader } from '@/components/Reader';
import { SettingsDrawer } from '@/components/SettingsDrawer';
import { TopBar } from '@/components/TopBar';
import { DocumentStore, StoredDoc } from '@/lib/store';
import { extractPdf } from '@/lib/extractionClient';
import { PdfFallback } from '@/components/PdfFallback';

export type Theme = 'dark' | 'light' | 'sepia';

export function App() {
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem('theme') as Theme) || 'dark');
  const [docs, setDocs] = useState<StoredDoc[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(() => localStorage.getItem('currentId'));
  const [rightOpen, setRightOpen] = useState(false);
  const [showPdfView, setShowPdfView] = useState(false);
  const [toc, setToc] = useState<TocItem[]>([]);
  const [zenMode, setZenMode] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);

  const store = useMemo(() => new DocumentStore(), []);

  useEffect(() => {
    document.body.classList.remove('theme-light', 'theme-sepia');
    if (theme === 'light') document.body.classList.add('theme-light');
    if (theme === 'sepia') document.body.classList.add('theme-sepia');
    localStorage.setItem('theme', theme);
  }, [theme]);

  const refresh = async () => setDocs(await store.listDocs());
  useEffect(() => { refresh(); }, []);
  useEffect(() => {
    const onRefresh = () => refresh();
    window.addEventListener('lumen:refresh-library', onRefresh as any);
    return () => window.removeEventListener('lumen:refresh-library', onRefresh as any);
  }, []);

  useEffect(() => { if (currentId) localStorage.setItem('currentId', currentId); }, [currentId]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === 'f' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setZenMode(z => !z);
      }
      if (e.key === 'Escape') {
        if (zenMode) setZenMode(false);
        if (showShortcuts) setShowShortcuts(false);
      }
      if (e.key === '?' || (e.key === '/' && e.shiftKey)) {
        e.preventDefault();
        setShowShortcuts(s => !s);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [zenMode, showShortcuts]);

  // Listen for shortcuts dialog event
  useEffect(() => {
    const onShow = () => setShowShortcuts(true);
    window.addEventListener('lumen:show-shortcuts', onShow);
    return () => window.removeEventListener('lumen:show-shortcuts', onShow);
  }, []);

  const onImport = async (file: File, opts: { mode: 'fast' | 'accurate'; enableOcr: boolean }) => {
    const id = await store.importPdf(file);
    const doc = await store.getDoc(id);
    setCurrentId(id);
    await refresh();
    if (doc) {
      await store.setDoc({ ...doc, extractionStatus: 'processing' });
      extractPdf(id, doc.name, opts).catch(console.error);
    }
  };

  // derive TOC when current doc or content changes
  useEffect(() => {
    let ok = true;
    (async () => {
      if (!currentId) { setToc([]); return; }
      const content = await store.getExtracted(currentId);
      if (!ok || !content) return;
      const headings = content.blocks
        .map((b, i) => ({ b, i }))
        .filter(x => x.b.kind === 'h')
        .map(x => ({ title: stripHtml(x.b.text).slice(0, 80), index: x.i, level: x.b.level }));
      setToc(headings);
    })();
    return () => { ok = false; };
  }, [currentId, store]);

  function stripHtml(s: string): string {
    const el = document.createElement('div');
    el.innerHTML = s;
    return el.textContent || '';
  }

  // Zen mode render
  if (zenMode && currentId) {
    return (
      <div className="zen-mode animate-fade-in">
        <button
          className="fixed top-4 right-4 btn btn-ghost z-50"
          onClick={() => setZenMode(false)}
          title="Exit Zen Mode (Esc)"
        >
          <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        <Reader docId={currentId} store={store} onOpenPdfView={() => setShowPdfView(true)} />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-[var(--bg)]">
      <TopBar
        theme={theme}
        setTheme={setTheme}
        zenMode={zenMode}
        onToggleZen={() => setZenMode(z => !z)}
      />
      <div className="flex flex-1 min-h-0">
        <LibrarySidebar
          docs={docs}
          onImport={onImport}
          currentId={currentId}
          onSelect={setCurrentId}
          toc={toc}
          bookmarks={[]}
          onJumpToIndex={(i) => window.dispatchEvent(new CustomEvent('lumen:jump', { detail: i }))}
        />
        <div className="flex-1 min-w-0">
          {currentId ? (
            showPdfView ? (
              <PdfFallback docId={currentId} store={store} onClose={() => setShowPdfView(false)} />
            ) : (
              <Reader docId={currentId} store={store} onOpenPdfView={() => setShowPdfView(true)} />
            )
          ) : (
            <WelcomeScreen />
          )}
        </div>
        <SettingsDrawer open={rightOpen} setOpen={setRightOpen} />
      </div>

      {/* Keyboard shortcuts modal */}
      {showShortcuts && (
        <ShortcutsModal onClose={() => setShowShortcuts(false)} />
      )}
    </div>
  );
}

function WelcomeScreen() {
  return (
    <div className="welcome-screen animate-fade-in-up">
      <div className="max-w-md">
        <div className="mb-6">
          <svg width="64" height="64" viewBox="0 0 24 24" className="mx-auto">
            <defs>
              <linearGradient id="welcome-gradient" x1="0" y1="0" x2="24" y2="24">
                <stop stopColor="#3b82f6" />
                <stop offset="0.5" stopColor="#8b5cf6" />
                <stop offset="1" stopColor="#ec4899" />
              </linearGradient>
            </defs>
            <circle cx="12" cy="12" r="10" fill="url(#welcome-gradient)" />
            <path
              d="M8 12.5L11 15.5L16 9"
              stroke="white"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <h1 className="welcome-title">Welcome to Lumen Reader</h1>
        <p className="welcome-subtitle">
          Your premium, distraction-free reading environment. Import a PDF to begin your immersive reading experience.
        </p>
        <div className="flex flex-col gap-3 text-sm text-[var(--fg-muted)]">
          <Feature icon="✨" text="Bionic reading for faster comprehension" />
          <Feature icon="🎯" text="Focus modes to keep you on track" />
          <Feature icon="🔊" text="Read aloud with natural voices" />
          <Feature icon="📊" text="Track your reading progress" />
        </div>
        <div className="mt-8 text-xs text-[var(--fg-muted)]">
          Press <span className="kbd">?</span> for keyboard shortcuts
        </div>
      </div>
    </div>
  );
}

function Feature({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-lg">{icon}</span>
      <span>{text}</span>
    </div>
  );
}

function ShortcutsModal({ onClose }: { onClose: () => void }) {
  const shortcuts = [
    { keys: ['↑', '↓', 'j', 'k'], description: 'Navigate paragraphs' },
    { keys: ['Space'], description: 'Toggle read aloud' },
    { keys: ['Esc'], description: 'Stop TTS / Exit mode' },
    { keys: ['f'], description: 'Toggle Zen mode' },
    { keys: ['?'], description: 'Show keyboard shortcuts' },
    { keys: ['⌘', 'b'], description: 'Add bookmark' },
  ];

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center animate-fade-in"
      onClick={onClose}
    >
      <div
        className="glass rounded-xl p-6 max-w-md w-full mx-4 animate-fade-in-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-[var(--fg)]">Keyboard Shortcuts</h2>
          <button className="btn btn-ghost p-1" onClick={onClose}>
            <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="space-y-3">
          {shortcuts.map((s, i) => (
            <div key={i} className="flex items-center justify-between">
              <span className="text-sm text-[var(--fg)]">{s.description}</span>
              <div className="flex gap-1">
                {s.keys.map((k, j) => (
                  <span key={j} className="kbd">{k}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-6 pt-4 border-t border-[var(--border)] text-center text-xs text-[var(--fg-muted)]">
          Press <span className="kbd">Esc</span> to close
        </div>
      </div>
    </div>
  );
}
