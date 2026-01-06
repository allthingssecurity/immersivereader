import React, { useEffect, useMemo, useRef, useState } from 'react';
import { DocumentStore, StoredDoc, ExtractedContent, Bookmark } from '@/lib/store';
import { useVirtualizer } from '@tanstack/react-virtual';
import DOMPurify from 'dompurify';
import { SearchBar } from './SearchBar';
import { download, toMarkdown, toPlainText } from '@/lib/exporters';
import { speakParagraphs, TtsController } from '@/lib/tts';

type Props = { docId: string; store: DocumentStore; onOpenPdfView: () => void };

export function Reader({ docId, store, onOpenPdfView }: Props) {
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
  const ttsRef = useRef<TtsController | null>(null);
  const [focusMode, setFocusMode] = useState<'off' | '1line' | '3lines' | 'paragraph'>(() => {
    try { return JSON.parse(localStorage.getItem('typography') || '{}').focus || 'off'; } catch { return 'off'; }
  });
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [typoPrefs, setTypoPrefs] = useState<{ justify?: boolean; bionic?: boolean }>({});

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
  const rowVirtualizer = useVirtualizer({
    count: blocks.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 72,
    overscan: 8
  });

  useEffect(() => {
    if (scrollToIndex != null) {
      rowVirtualizer.scrollToIndex(scrollToIndex, { align: 'center' });
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
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => el.removeEventListener('scroll', onScroll);
  }, [blocks.length, rowVirtualizer]);

  useEffect(() => {
    if (!doc) return;
    store.updateProgress(doc.id, { progress, lastParagraphIndex: currentIndex, lastOpened: Date.now() }).catch(() => {});
  }, [progress, currentIndex]);

  // TTS from index
  const speakFrom = async (index: number) => {
    if (!blocks.length) return;
    ttsRef.current?.stop();
    const paragraphs = blocks.slice(index).filter(b => b.kind === 'p').map(b => b.text).slice(0, 50);
    try {
      const ctrl = await speakParagraphs(paragraphs, { rate: Math.max(0.5, Math.min(1.2, wpm / 220)) });
      ttsRef.current = ctrl;
      setTtsActive(true);
    } catch {
      setTtsActive(false);
    }
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

  return (
    <div className="h-full overflow-hidden">
      <div className="border-b border-slate-200/60 px-4 py-2 text-sm text-slate-600 flex gap-4 items-center">
        <span className="truncate">{doc?.name}</span>
        <span>Pages: {doc?.pages ?? '—'}</span>
        <span className="ml-auto">Extraction: {doc?.extractionStatus ?? 'pending'}</span>
        <button className="ml-2 underline" onClick={onOpenPdfView}>Open PDF View</button>
        <div className="ml-4">
          <SearchBar content={content} onJump={(i) => setScrollToIndex(i)} />
        </div>
        <div className="ml-4 flex items-center gap-3">
          <div className="w-48 h-1 bg-slate-200 rounded overflow-hidden" aria-label="Reading progress">
            <div className="h-full bg-brand-600" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
          <span className="text-xs text-slate-500">{Math.round(progress * 100)}%</span>
          <TimeEstimate words={Math.max(1, blocks.reduce((a, b) => a + (b.text.split(/\s+/).length), 0))} wpm={wpm} progress={progress} />
        </div>
        <div className="ml-4 flex items-center gap-2">
          <button className="px-2 py-1 border rounded" onClick={() => content && download('document.txt', toPlainText(content))}>Export .txt</button>
          <button className="px-2 py-1 border rounded" onClick={() => content && download('document.md', toMarkdown(content), 'text/markdown')}>Export .md</button>
          <button className="px-2 py-1 border rounded" onClick={() => ttsRef.current?.pause()} disabled={!ttsActive}>Pause</button>
          <button className="px-2 py-1 border rounded" onClick={() => ttsRef.current?.resume()} disabled={!ttsActive}>Resume</button>
          <button className="px-2 py-1 border rounded" onClick={() => { ttsRef.current?.stop(); setTtsActive(false); }} disabled={!ttsActive}>Stop</button>
          <button className="px-2 py-1 border rounded" onClick={async () => { await store.addBookmark(docId, currentIndex); setBookmarks(await store.listBookmarks(docId)); }}>Bookmark</button>
        </div>
      </div>
      <div ref={parentRef} className="h-[calc(100%-40px)] overflow-auto">
        <div className="max-w-[var(--measure,70ch)] mx-auto px-6 py-6" style={{
          fontSize: 'var(--font-size, 18px)',
          lineHeight: 'var(--line-height, 1.6)',
          fontFamily: 'var(--reader-font, ui-sans-serif)',
        }}>
          {blocks.length === 0 && (
            <div className="text-slate-500 text-center py-8">Extracting text… If this takes too long, open PDF View fallback in settings.</div>
          )}
          <div
            style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: 'relative' }}
            aria-label="Reading content"
          >
            {rowVirtualizer.getVirtualItems().map((item) => {
              const b = blocks[item.index];
              const Tag = b.kind === 'h' ? (`h${b.level ?? 2}` as any) : 'p';
              const innerHtml = DOMPurify.sanitize(typoPrefs.bionic ? bionicTransform(b.text) : b.text);
              return (
                <div
                  key={item.key}
                  ref={rowVirtualizer.measureElement}
                  className={`absolute left-0 right-0 px-1 ${focusMode === 'paragraph' && item.index === currentIndex ? 'bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] rounded-sm' : ''}`}
                  style={{ transform: `translateY(${item.start}px)`, top: 0, paddingBottom: b.kind === 'h' ? '0.6em' : 'var(--paragraph-spacing, 12px)', boxSizing: 'border-box' }}
                  data-index={item.index}
                >
                  <Tag
                    onClick={() => speakFrom(item.index)}
                    style={{ textAlign: typoPrefs.justify ? 'justify' : 'start' }}
                    dangerouslySetInnerHTML={{ __html: innerHtml }}
                  />
                </div>
              );
            })}
          </div>
        </div>
        <ReadingRuler parentRef={parentRef} focusMode={focusMode} />
      </div>
    </div>
  );
}

function TimeEstimate({ words, wpm, progress }: { words: number; wpm: number; progress: number }) {
  const remaining = Math.max(0, 1 - progress) * words;
  const minutes = Math.ceil(remaining / Math.max(120, wpm));
  return <span className="text-xs text-slate-500">~{minutes} min left</span>;
}

function ReadingRuler({ parentRef, focusMode }: { parentRef: React.RefObject<HTMLDivElement>; focusMode: 'off'|'1line'|'3lines'|'paragraph' }) {
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
  if (y == null || focusMode === 'off' || focusMode === 'paragraph') return null;
  const size = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--font-size')) || 18;
  const lh = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--line-height')) || 1.6;
  const lines = focusMode === '1line' ? 1 : 3;
  const height = Math.round(size * lh * lines);
  return <div className="ruler" style={{ top: y - height / 2, height }} aria-hidden />;
}

function bionicTransform(html: string): string {
  // Simple bionic reading: bold first ~40% of each word
  const decode = (s: string) => { const el = document.createElement('textarea'); el.innerHTML = s; return el.value; };
  const text = decode(html);
  const out = text.replace(/([A-Za-zÀ-ÖØ-öø-ÿ]{3,})/g, (w) => {
    const n = Math.max(1, Math.round(w.length * 0.4));
    return `<b>${w.slice(0, n)}</b>${w.slice(n)}`;
  });
  return out;
}
