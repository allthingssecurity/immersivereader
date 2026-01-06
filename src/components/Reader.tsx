import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DocumentStore, StoredDoc, ExtractedContent, Bookmark } from '@/lib/store';
import { useVirtualizer } from '@tanstack/react-virtual';
import DOMPurify from 'dompurify';
import { SearchBar } from './SearchBar';
import { download, toMarkdown, toPlainText } from '@/lib/exporters';
import { speakParagraphs, TtsController } from '@/lib/tts';

type Props = {
  docId: string;
  store: DocumentStore;
  onOpenPdfView: () => void;
  spotlightMode?: boolean;
};

export function Reader({ docId, store, onOpenPdfView, spotlightMode = false }: Props) {
  const [doc, setDoc] = useState<StoredDoc | null>(null);
  const [content, setContent] = useState<ExtractedContent | null>(null);
  const parentRef = useRef<HTMLDivElement>(null);
  const [scrollToIndex, setScrollToIndex] = useState<number | null>(null);
  const [progress, setProgress] = useState<number>(0);
  const [wpm, setWpm] = useState<number>(() => {
    try { return JSON.parse(localStorage.getItem('typography') || '{}').wpm || 220; } catch { return 220; }
  });
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [ttsActive, setTtsActive] = useState(false);
  const [ttsCurrentIndex, setTtsCurrentIndex] = useState<number | null>(null);
  const ttsRef = useRef<TtsController | null>(null);
  const [focusMode, setFocusMode] = useState<'off' | '1line' | '3lines' | 'paragraph' | 'spotlight'>(() => {
    try { return JSON.parse(localStorage.getItem('typography') || '{}').focus || 'off'; } catch { return 'off'; }
  });
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [typoPrefs, setTypoPrefs] = useState<{ justify?: boolean; bionic?: boolean }>({});
  const [showStats, setShowStats] = useState(false);
  const [wordsRead, setWordsRead] = useState(0);
  const [readingStartTime] = useState(Date.now());

  useEffect(() => {
    let mounted = true;
    (async () => {
      const d = await store.getDoc(docId);
      if (!mounted) return;
      setDoc(d ?? null);
      const extracted = await store.getExtracted(docId);
      if (!mounted) return;
      setContent(extracted ?? null);
      setBookmarks(await store.listBookmarks(docId));
    })();
    return () => { mounted = false; };
  }, [docId, store]);

  // Refresh when worker broadcasts completion
  useEffect(() => {
    const bc = new BroadcastChannel('lumen-extraction');
    const onMsg = (ev: MessageEvent) => {
      if (ev.data?.type === 'done' && ev.data.id === docId) {
        (async () => {
          const extracted = await store.getExtracted(docId);
          setContent(extracted ?? null);
        })();
      }
    };
    bc.addEventListener('message', onMsg);
    return () => bc.close();
  }, [docId, store]);

  const blocks = content?.blocks ?? [];
  const totalWords = useMemo(() =>
    blocks.reduce((a, b) => a + (b.text.split(/\s+/).length), 0), [blocks]);

  const rowVirtualizer = useVirtualizer({
    count: blocks.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 72,
    overscan: 8
  });

  useEffect(() => {
    if (scrollToIndex != null) {
      rowVirtualizer.scrollToIndex(scrollToIndex, { align: 'center', behavior: 'smooth' });
      setScrollToIndex(null);
    }
  }, [scrollToIndex]);

  // External jump (TOC click)
  useEffect(() => {
    const onJump = (e: Event) => {
      const ce = e as CustomEvent<number>;
      if (typeof ce.detail === 'number') setScrollToIndex(ce.detail);
    };
    window.addEventListener('lumen:jump', onJump as any);
    return () => window.removeEventListener('lumen:jump', onJump as any);
  }, []);

  // Track progress and last paragraph index
  useEffect(() => {
    const el = parentRef.current;
    if (!el || blocks.length === 0) return;
    const onScroll = () => {
      const total = el.scrollHeight - el.clientHeight;
      const p = total > 0 ? el.scrollTop / total : 0;
      setProgress(p);
      // current middle item index
      const middle = el.scrollTop + el.clientHeight / 2;
      const vItems = rowVirtualizer.getVirtualItems();
      let idx = currentIndex;
      for (const it of vItems) {
        if (it.start <= middle && middle <= it.end) { idx = it.index; break; }
      }
      setCurrentIndex(idx);
      // Estimate words read
      const wordsBeforeCurrent = blocks.slice(0, idx).reduce((a, b) => a + b.text.split(/\s+/).length, 0);
      setWordsRead(wordsBeforeCurrent);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => el.removeEventListener('scroll', onScroll);
  }, [blocks.length, rowVirtualizer]);

  useEffect(() => {
    if (!doc) return;
    store.updateProgress(doc.id, { progress, lastParagraphIndex: currentIndex, lastOpened: Date.now() }).catch(() => { });
  }, [progress, currentIndex]);

  // Keyboard navigation
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      switch (e.key) {
        case 'ArrowDown':
        case 'j':
          e.preventDefault();
          setScrollToIndex(Math.min(currentIndex + 1, blocks.length - 1));
          break;
        case 'ArrowUp':
        case 'k':
          e.preventDefault();
          setScrollToIndex(Math.max(currentIndex - 1, 0));
          break;
        case ' ':
          e.preventDefault();
          if (ttsActive) {
            ttsRef.current?.pause();
          } else {
            speakFrom(currentIndex);
          }
          break;
        case 'Escape':
          ttsRef.current?.stop();
          setTtsActive(false);
          break;
        case 'b':
          if (e.metaKey || e.ctrlKey) {
            e.preventDefault();
            handleBookmark();
          }
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [currentIndex, blocks.length, ttsActive]);

  // TTS from index
  const speakFrom = async (index: number) => {
    if (!blocks.length) return;
    ttsRef.current?.stop();
    setTtsCurrentIndex(index);
    const paragraphs = blocks.slice(index).filter(b => b.kind === 'p').map(b => b.text).slice(0, 50);
    try {
      const ctrl = await speakParagraphs(paragraphs, { rate: Math.max(0.5, Math.min(1.2, wpm / 220)) });
      ttsRef.current = ctrl;
      setTtsActive(true);
    } catch {
      setTtsActive(false);
      setTtsCurrentIndex(null);
    }
  };

  const handleBookmark = async () => {
    await store.addBookmark(docId, currentIndex);
    setBookmarks(await store.listBookmarks(docId));
  };

  // Keep focus mode in sync
  useEffect(() => {
    const t = localStorage.getItem('typography');
    if (!t) return;
    try {
      const parsed = JSON.parse(t);
      setFocusMode(parsed.focus || 'off');
      setTypoPrefs({ justify: parsed.justify, bionic: parsed.bionic });
    } catch { /* noop */ }
  }, [localStorage.getItem('typography')]);

  const readingTimeElapsed = Math.floor((Date.now() - readingStartTime) / 1000 / 60);
  const pagesPerHour = readingTimeElapsed > 0
    ? Math.round((wordsRead / 250) / (readingTimeElapsed / 60))
    : 0;

  return (
    <div className="h-full overflow-hidden flex flex-col bg-[var(--bg)]">
      {/* Enhanced toolbar */}
      <div className="reader-toolbar glass border-b border-[var(--border)] px-3 md:px-5 py-2 md:py-3 flex items-center gap-2 md:gap-4 animate-fade-in">
        <div className="flex items-center gap-2 md:gap-3 min-w-0 flex-1">
          <span className="font-medium truncate max-w-[120px] md:max-w-[200px] text-[var(--fg)] text-sm md:text-base">{doc?.name}</span>
          <span className="stat-badge hidden md:inline-flex">
            <svg className="stat-badge-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            {doc?.type === 'url' ? 'Web Article' : `${doc?.pages ?? '—'} pages`}
          </span>
          <span className={`stat-badge hidden md:inline-flex ${doc?.extractionStatus === 'done' ? 'text-green-500' : ''}`}>
            {doc?.extractionStatus === 'done' ? '✓ Ready' : doc?.extractionStatus === 'processing' ? '⏳ Processing...' : '○ Pending'}
          </span>
        </div>

        {/* Reading progress */}
        <div className="flex items-center gap-2 md:gap-3 flex-shrink-0">
          <CircularProgress progress={progress} />
          <div className="text-sm">
            <div className="font-medium text-[var(--fg)]">{Math.round(progress * 100)}%</div>
            <div className="text-xs text-[var(--fg-muted)] hidden sm:block">
              <TimeEstimate words={Math.max(1, totalWords - wordsRead)} wpm={wpm} />
            </div>
          </div>
        </div>

        {/* Stats toggle */}
        <button
          className={`btn btn-ghost hidden sm:flex ${showStats ? 'bg-[var(--highlight-bg)]' : ''}`}
          onClick={() => setShowStats(!showStats)}
          title="Reading Statistics"
        >
          <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        </button>

        <SearchBar content={content} onJump={(i) => setScrollToIndex(i)} />
      </div>

      {/* Stats panel (collapsible) */}
      {showStats && (
        <div className="stats-panel glass border-b border-[var(--border)] px-3 md:px-5 py-2 md:py-3 flex items-center gap-4 md:gap-6 text-sm animate-fade-in overflow-x-auto">
          <StatItem icon="📖" label="Words Read" value={wordsRead.toLocaleString()} />
          <StatItem icon="📚" label="Total Words" value={totalWords.toLocaleString()} />
          <StatItem icon="⏱️" label="Time" value={`${readingTimeElapsed}m`} />
          <StatItem icon="🚀" label="Speed" value={`${pagesPerHour} pages/hr`} />
          <StatItem icon="🎯" label="Current Para" value={`${currentIndex + 1} / ${blocks.length}`} />
        </div>
      )}

      {/* Action bar */}
      <div className="action-bar border-b border-[var(--border)] px-3 md:px-5 py-2 flex items-center gap-2 bg-[var(--bg-secondary)] overflow-x-auto flex-shrink-0">
        {/* PDF View - only show for PDF documents */}
        {doc?.type === 'pdf' && (
          <>
            <button className="btn flex-shrink-0" onClick={onOpenPdfView}>
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              <span className="hidden sm:inline">PDF View</span>
            </button>
            <div className="w-px h-6 bg-[var(--border)] hidden sm:block" />
          </>
        )}

        {/* Source Link - for URL documents */}
        {doc?.type === 'url' && doc.url && (
          <>
            <a
              href={doc.url}
              target="_blank"
              rel="noopener noreferrer"
              className="btn flex-shrink-0"
            >
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              <span className="hidden sm:inline">Source</span>
            </a>
            <div className="w-px h-6 bg-[var(--border)] hidden sm:block" />
          </>
        )}

        <button className="btn flex-shrink-0" onClick={() => content && download('document.txt', toPlainText(content))}>
          <span className="hidden sm:inline">Export</span> .txt
        </button>
        <button className="btn flex-shrink-0" onClick={() => content && download('document.md', toMarkdown(content), 'text/markdown')}>
          <span className="hidden sm:inline">Export</span> .md
        </button>
        <div className="w-px h-6 bg-[var(--border)]" />
        <TtsControls
          ttsActive={ttsActive}
          onPlay={() => speakFrom(currentIndex)}
          onPause={() => ttsRef.current?.pause()}
          onResume={() => ttsRef.current?.resume()}
          onStop={() => { ttsRef.current?.stop(); setTtsActive(false); setTtsCurrentIndex(null); }}
        />
        <div className="w-px h-6 bg-[var(--border)]" />
        <button
          className="btn btn-ghost flex-shrink-0"
          onClick={handleBookmark}
          title="Add Bookmark (⌘B)"
        >
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
          </svg>
          <span className="hidden sm:inline">Bookmark</span>
        </button>
        <div className="kbd-hints ml-auto hidden md:flex items-center gap-2 text-xs text-[var(--fg-muted)] flex-shrink-0">
          <span className="kbd">↑↓</span> Navigate
          <span className="kbd">Space</span> TTS
          <span className="kbd">Esc</span> Stop
        </div>
      </div>

      {/* Reading content */}
      <div ref={parentRef} className="flex-1 overflow-auto relative">
        {/* Spotlight overlay */}
        {(focusMode === 'spotlight' || focusMode === 'paragraph') && (
          <div
            className={`spotlight-overlay ${focusMode === 'spotlight' ? 'active' : ''}`}
            style={{ '--spotlight-y': `${50}%` } as React.CSSProperties}
          />
        )}

        <div
          className="max-w-[var(--measure,70ch)] mx-auto px-8 py-10 reading-content"
          style={{
            fontSize: 'var(--font-size, 18px)',
            lineHeight: 'var(--line-height, 1.7)',
            fontFamily: 'var(--reader-font, Georgia, serif)',
          }}
        >
          {blocks.length === 0 && (
            <div className="text-center py-16 animate-fade-in">
              <div className="spinner mx-auto mb-4" />
              <p className="text-[var(--fg-muted)]">Extracting text from PDF...</p>
              <p className="text-xs text-[var(--fg-muted)] mt-2">
                Taking too long? Try the PDF View fallback.
              </p>
            </div>
          )}
          <div
            style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: 'relative' }}
            aria-label="Reading content"
          >
            {rowVirtualizer.getVirtualItems().map((item) => {
              const b = blocks[item.index];
              const Tag = b.kind === 'h' ? (`h${b.level ?? 2}` as any) : 'p';
              const innerHtml = DOMPurify.sanitize(typoPrefs.bionic ? bionicTransform(b.text) : b.text);
              const isCurrent = item.index === currentIndex;
              const isTtsCurrent = ttsCurrentIndex !== null && item.index === ttsCurrentIndex;

              const dimmed = focusMode === 'spotlight' && !isCurrent;
              const focused = (focusMode === 'paragraph' || focusMode === 'spotlight') && isCurrent;

              return (
                <div
                  key={item.key}
                  ref={rowVirtualizer.measureElement}
                  className={`
                    absolute left-0 right-0 px-2
                    reading-paragraph
                    ${focused ? 'focused' : ''}
                    ${dimmed ? 'dimmed' : ''}
                    ${isTtsCurrent ? 'tts-active' : ''}
                  `}
                  style={{
                    transform: `translateY(${item.start}px)`,
                    top: 0,
                    paddingBottom: b.kind === 'h' ? '0.6em' : 'var(--paragraph-spacing, 16px)',
                    boxSizing: 'border-box',
                    transition: 'all 0.2s ease-out'
                  }}
                  data-index={item.index}
                >
                  <Tag
                    onClick={() => speakFrom(item.index)}
                    style={{
                      textAlign: typoPrefs.justify ? 'justify' : 'start',
                      cursor: 'pointer'
                    }}
                    className={b.kind === 'h' ? 'font-bold text-[var(--fg)]' : 'text-[var(--fg)]'}
                    dangerouslySetInnerHTML={{ __html: innerHtml }}
                  />
                </div>
              );
            })}
          </div>
        </div>
        <ReadingRuler parentRef={parentRef} focusMode={focusMode} />
      </div>

      {/* Floating TTS controls for mobile */}
      <div className="md:hidden fixed bottom-16 left-1/2 -translate-x-1/2 z-40">
        <div className="glass rounded-full px-4 py-2 flex items-center gap-3 shadow-lg border border-[var(--border)]">
          {!ttsActive ? (
            <button
              className="btn btn-primary rounded-full p-3"
              onClick={() => speakFrom(currentIndex)}
              aria-label="Read aloud"
            >
              <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            </button>
          ) : (
            <>
              <button
                className="btn rounded-full p-3"
                onClick={() => ttsRef.current?.pause()}
                aria-label="Pause"
              >
                <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                </svg>
              </button>
              <button
                className="btn btn-ghost rounded-full p-3 text-red-500"
                onClick={() => { ttsRef.current?.stop(); setTtsActive(false); setTtsCurrentIndex(null); }}
                aria-label="Stop"
              >
                <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 6h12v12H6z" />
                </svg>
              </button>
            </>
          )}
          <div className="text-xs text-[var(--fg-muted)] hidden sm:block">
            {ttsActive ? 'Reading...' : 'Read Aloud'}
          </div>
        </div>
      </div>

      {/* Progress bar at bottom */}
      <div className="h-1 bg-[var(--border)]">
        <div
          className="h-full progress-bar-fill"
          style={{ width: `${Math.round(progress * 100)}%` }}
        />
      </div>
    </div>
  );
}

function CircularProgress({ progress }: { progress: number }) {
  const radius = 16;
  const stroke = 3;
  const normalizedRadius = radius - stroke;
  const circumference = normalizedRadius * 2 * Math.PI;
  const strokeDashoffset = circumference - progress * circumference;

  return (
    <svg height={radius * 2} width={radius * 2} className="progress-ring">
      <circle
        className="progress-ring-bg"
        strokeWidth={stroke}
        fill="transparent"
        r={normalizedRadius}
        cx={radius}
        cy={radius}
      />
      <circle
        className="progress-ring-circle"
        strokeWidth={stroke}
        strokeDasharray={`${circumference} ${circumference}`}
        style={{ strokeDashoffset }}
        fill="transparent"
        r={normalizedRadius}
        cx={radius}
        cy={radius}
      />
    </svg>
  );
}

function StatItem({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <span>{icon}</span>
      <div>
        <div className="text-xs text-[var(--fg-muted)]">{label}</div>
        <div className="font-medium text-[var(--fg)]">{value}</div>
      </div>
    </div>
  );
}

function TtsControls({ ttsActive, onPlay, onPause, onResume, onStop }: {
  ttsActive: boolean;
  onPlay: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
}) {
  const [paused, setPaused] = useState(false);

  return (
    <div className="flex items-center gap-1">
      {!ttsActive ? (
        <button className="btn btn-primary" onClick={onPlay}>
          <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" />
          </svg>
          Read Aloud
        </button>
      ) : (
        <>
          {paused ? (
            <button
              className="btn"
              onClick={() => { onResume(); setPaused(false); }}
            >
              <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
              Resume
            </button>
          ) : (
            <button
              className="btn"
              onClick={() => { onPause(); setPaused(true); }}
            >
              <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
              </svg>
              Pause
            </button>
          )}
          <button
            className="btn btn-ghost"
            onClick={() => { onStop(); setPaused(false); }}
          >
            <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 6h12v12H6z" />
            </svg>
          </button>
        </>
      )}
    </div>
  );
}

function TimeEstimate({ words, wpm }: { words: number; wpm: number }) {
  const minutes = Math.ceil(words / Math.max(120, wpm));
  if (minutes < 1) return <span>Less than a minute</span>;
  if (minutes === 1) return <span>~1 min left</span>;
  return <span>~{minutes} min left</span>;
}

function ReadingRuler({ parentRef, focusMode }: { parentRef: React.RefObject<HTMLDivElement>; focusMode: string }) {
  const [y, setY] = useState<number | null>(null);
  useEffect(() => {
    const el = parentRef.current;
    if (!el) return;
    const onMove = (e: MouseEvent) => setY(e.clientY);
    const onLeave = () => setY(null);
    el.addEventListener('mousemove', onMove);
    el.addEventListener('mouseleave', onLeave);
    return () => { el.removeEventListener('mousemove', onMove); el.removeEventListener('mouseleave', onLeave); };
  }, [parentRef]);
  if (y == null || focusMode === 'off' || focusMode === 'paragraph' || focusMode === 'spotlight') return null;
  const size = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--font-size')) || 18;
  const lh = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--line-height')) || 1.7;
  const lines = focusMode === '1line' ? 1 : 3;
  const height = Math.round(size * lh * lines);
  return <div className="ruler" style={{ top: y - height / 2, height }} aria-hidden />;
}

function bionicTransform(html: string): string {
  const decode = (s: string) => { const el = document.createElement('textarea'); el.innerHTML = s; return el.value; };
  const text = decode(html);
  const out = text.replace(/([A-Za-zÀ-ÖØ-öø-ÿ]{3,})/g, (w) => {
    const n = Math.max(1, Math.round(w.length * 0.4));
    return `<b>${w.slice(0, n)}</b>${w.slice(n)}`;
  });
  return out;
}
