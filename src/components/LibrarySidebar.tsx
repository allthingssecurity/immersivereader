import React, { useMemo, useRef, useState } from 'react';
import { Bookmark, StoredDoc } from '@/lib/store';

export type TocItem = { title: string; index: number; level?: number };

export function LibrarySidebar({
  docs,
  onImport,
  currentId,
  onSelect,
  toc,
  bookmarks,
  onJumpToIndex,
  onRemoveBookmark
}: {
  docs: StoredDoc[];
  onImport: (file: File, opts: { mode: 'fast' | 'accurate'; enableOcr: boolean }) => void;
  currentId: string | null;
  onSelect: (id: string) => void;
  toc?: TocItem[];
  bookmarks?: Bookmark[];
  onJumpToIndex?: (index: number) => void;
  onRemoveBookmark?: (id: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<'fast' | 'accurate'>('fast');
  const [enableOcr, setEnableOcr] = useState(false);
  const [tab, setTab] = useState<'library' | 'contents' | 'bookmarks'>('library');

  const onFiles = (files: FileList | null) => {
    if (!files || !files[0]) return;
    const file = files[0];
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) return;
    onImport(file, { mode, enableOcr });
    if (inputRef.current) inputRef.current.value = '';
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) onFiles(e.dataTransfer.files);
  };

  return (
    <aside
      className="w-72 border-r border-slate-200/60 p-3 flex flex-col gap-3 overflow-auto"
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
    >
      <div>
        <button className="w-full bg-brand-600 text-white rounded px-3 py-2 hover:bg-brand-700 transition" onClick={() => inputRef.current?.click()}>
          Import PDF
        </button>
        <input ref={inputRef} type="file" accept="application/pdf" className="hidden" onChange={(e) => onFiles(e.target.files)} />
        <div className="mt-2 text-xs text-slate-500 flex items-center gap-2">
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={enableOcr} onChange={(e) => setEnableOcr(e.target.checked)} /> Enable OCR (Tesseract.js)
          </label>
          <select className="ml-auto border rounded px-1 py-0.5" value={mode} onChange={(e) => setMode(e.target.value as any)} aria-label="Extraction quality">
            <option value="fast">Fast</option>
            <option value="accurate">Accurate</option>
          </select>
        </div>
      </div>
      <div className="text-xs uppercase tracking-wide text-slate-500 flex gap-2">
        <button className={`px-2 py-1 rounded ${tab==='library'?'bg-slate-200/70':''}`} onClick={()=>setTab('library')}>Library</button>
        <button className={`px-2 py-1 rounded ${tab==='contents'?'bg-slate-200/70':''}`} onClick={()=>setTab('contents')} disabled={!toc || !toc.length}>Contents</button>
        <button className={`px-2 py-1 rounded ${tab==='bookmarks'?'bg-slate-200/70':''}`} onClick={()=>setTab('bookmarks')} disabled={!bookmarks || !bookmarks.length}>Bookmarks</button>
      </div>

      {tab === 'library' && (
        <ul className="flex-1 space-y-1">
          {docs.map((d) => (
            <li key={d.id} className="group">
              <div className={`rounded px-2 py-2 hover:bg-slate-200/50 transition ${currentId === d.id ? 'bg-slate-200/60' : ''}`}>
                <button
                  className="w-[calc(100%-2rem)] text-left"
                  onClick={() => onSelect(d.id)}
                  aria-current={currentId === d.id ? 'page' : undefined}
                >
                  <div className="font-medium truncate">{d.name}</div>
                  <div className="text-xs text-slate-500 flex justify-between">
                    <span>Pages: {d.pages ?? '—'}</span>
                    <span>{d.progress ? Math.round(d.progress * 100) + '%' : ''}</span>
                  </div>
                </button>
                <button
                  className="float-right text-slate-500 hover:text-red-600 opacity-0 group-hover:opacity-100 transition"
                  title="Remove from library"
                  onClick={async (e) => {
                    e.stopPropagation();
                    const store = new (await import('@/lib/store')).DocumentStore();
                    await store.deleteDoc(d.id);
                    if (currentId === d.id) onSelect('');
                    window.dispatchEvent(new Event('lumen:refresh-library'));
                  }}
                  aria-label={`Remove ${d.name}`}
                >
                  ✕
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {tab === 'contents' && (
        <ul className="flex-1 space-y-1">
          {(toc || []).map((t) => (
            <li key={t.index}>
              <button
                className="w-full text-left px-2 py-1 rounded hover:bg-slate-200/60"
                onClick={() => onJumpToIndex && onJumpToIndex(t.index)}
                style={{ paddingLeft: `${((t.level ?? 2)-1) * 8 + 8}px` }}
              >
                <span className="truncate inline-block max-w-[15rem]">{t.title}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {tab === 'bookmarks' && (
        <ul className="flex-1 space-y-1">
          {(bookmarks || []).map((b) => (
            <li key={b.id} className="group">
              <div className="rounded px-2 py-2 hover:bg-slate-200/50 transition">
                <button className="w-[calc(100%-2rem)] text-left" onClick={() => onJumpToIndex && onJumpToIndex(b.paragraphIndex)}>
                  <div className="font-medium truncate">Paragraph {b.paragraphIndex + 1}</div>
                  {b.note && <div className="text-xs text-slate-500 truncate">{b.note}</div>}
                </button>
                <button className="float-right text-slate-500 hover:text-red-600 opacity-0 group-hover:opacity-100 transition" onClick={() => onRemoveBookmark && onRemoveBookmark(b.id)} aria-label="Remove bookmark">✕</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
