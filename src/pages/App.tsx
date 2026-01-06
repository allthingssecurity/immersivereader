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
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem('theme') as Theme) || 'light');
  const [docs, setDocs] = useState<StoredDoc[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(() => localStorage.getItem('currentId'));
  const [rightOpen, setRightOpen] = useState(true);
  const [showPdfView, setShowPdfView] = useState(false);
  const [toc, setToc] = useState<TocItem[]>([]);

  const store = useMemo(() => new DocumentStore(), []);

  useEffect(() => {
    document.body.classList.toggle('theme-light', theme === 'light');
    document.body.classList.toggle('theme-sepia', theme === 'sepia');
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

  const onImport = async (file: File, opts: { mode: 'fast' | 'accurate'; enableOcr: boolean }) => {
    const id = await store.importPdf(file);
    const doc = await store.getDoc(id);
    setCurrentId(id);
    await refresh();
    // Kick off extraction via worker
    if (doc) {
      await store.setDoc({ ...doc, extractionStatus: 'processing' });
      extractPdf(id, doc.name, opts).catch(console.error);
    }
  };

  // derive TOC when current doc or content changes (basic: headings only)
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

  return (
    <div className="h-full flex flex-col">
      <TopBar theme={theme} setTheme={setTheme} />
      <div className="flex flex-1 min-h-0">
        <LibrarySidebar
          docs={docs}
          onImport={onImport}
          currentId={currentId}
          onSelect={setCurrentId}
          toc={toc}
          bookmarks={[]}
          onJumpToIndex={(i) => window.dispatchEvent(new CustomEvent('lumen:jump',{ detail: i }))}
        />
        <div className="flex-1 min-w-0">
          {currentId ? (
            showPdfView ? (
              <PdfFallback docId={currentId} store={store} onClose={() => setShowPdfView(false)} />
            ) : (
              <Reader docId={currentId} store={store} onOpenPdfView={() => setShowPdfView(true)} />
            )
          ) : (
            <div className="h-full grid place-items-center text-center text-slate-600 p-6">
              <div>
                <h2 className="text-2xl font-semibold mb-2">Welcome to Lumen Reader</h2>
                <p>Import a PDF to start reading in immersive mode.</p>
              </div>
            </div>
          )}
        </div>
        <SettingsDrawer open={rightOpen} setOpen={setRightOpen} />
      </div>
    </div>
  );
}
