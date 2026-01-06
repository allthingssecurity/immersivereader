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
  const [searchQuery, setSearchQuery] = useState('');
  const [isDragging, setIsDragging] = useState(false);

  const onFiles = (files: FileList | null) => {
    if (!files || !files[0]) return;
    const file = files[0];
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) return;
    onImport(file, { mode, enableOcr });
    if (inputRef.current) inputRef.current.value = '';
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = () => setIsDragging(false);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) onFiles(e.dataTransfer.files);
  };

  const filteredDocs = useMemo(() => {
    if (!searchQuery.trim()) return docs;
    const q = searchQuery.toLowerCase();
    return docs.filter(d => d.name.toLowerCase().includes(q));
  }, [docs, searchQuery]);

  const formatDate = (ts?: number) => {
    if (!ts) return '';
    const date = new Date(ts);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    return date.toLocaleDateString();
  };

  return (
    <aside
      className={`w-72 border-r border-[var(--border)] glass flex flex-col overflow-hidden transition-all
        ${isDragging ? 'ring-2 ring-[var(--accent)] ring-inset' : ''}`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {/* Header */}
      <div className="p-4 border-b border-[var(--border)]">
        <button
          className="btn btn-primary w-full justify-center"
          onClick={() => inputRef.current?.click()}
        >
          <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Import PDF
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(e) => onFiles(e.target.files)}
        />

        {/* Import options */}
        <div className="mt-3 flex items-center gap-3 text-xs">
          <label className="flex items-center gap-1.5 text-[var(--fg-muted)] cursor-pointer">
            <input
              type="checkbox"
              checked={enableOcr}
              onChange={(e) => setEnableOcr(e.target.checked)}
            />
            OCR
          </label>
          <select
            className="select text-xs py-1 px-2 ml-auto"
            value={mode}
            onChange={(e) => setMode(e.target.value as any)}
            aria-label="Extraction quality"
          >
            <option value="fast">⚡ Fast</option>
            <option value="accurate">🎯 Accurate</option>
          </select>
        </div>
      </div>

      {/* Tab navigation */}
      <div className="flex border-b border-[var(--border)]">
        {(['library', 'contents', 'bookmarks'] as const).map((t) => (
          <button
            key={t}
            className={`flex-1 py-2.5 text-xs font-medium capitalize transition-colors
              ${tab === t
                ? 'text-[var(--accent)] border-b-2 border-[var(--accent)] bg-[var(--highlight-bg)]'
                : 'text-[var(--fg-muted)] hover:text-[var(--fg)] hover:bg-[var(--bg-secondary)]'
              }`}
            onClick={() => setTab(t)}
            disabled={(t === 'contents' && (!toc || !toc.length)) || (t === 'bookmarks' && (!bookmarks || !bookmarks.length))}
          >
            {t === 'library' && '📚'}
            {t === 'contents' && '📖'}
            {t === 'bookmarks' && '🔖'}
            <span className="ml-1">{t}</span>
            {t === 'library' && docs.length > 0 && (
              <span className="ml-1 text-[var(--fg-muted)]">({docs.length})</span>
            )}
          </button>
        ))}
      </div>

      {/* Search (library only) */}
      {tab === 'library' && (
        <div className="p-3 border-b border-[var(--border)]">
          <div className="relative">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--fg-muted)]"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search library..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input w-full pl-10 py-2 text-sm"
            />
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {/* Library tab */}
        {tab === 'library' && (
          <ul className="p-2 space-y-1">
            {filteredDocs.length === 0 && (
              <li className="text-center py-8 text-sm text-[var(--fg-muted)]">
                {docs.length === 0 ? (
                  <div>
                    <div className="text-3xl mb-2">📄</div>
                    <p>Drop a PDF here or click Import</p>
                  </div>
                ) : (
                  'No matches found'
                )}
              </li>
            )}
            {filteredDocs.map((d) => (
              <li key={d.id} className="group">
                <div
                  className={`card card-interactive cursor-pointer p-3
                    ${currentId === d.id ? 'border-[var(--accent)] bg-[var(--highlight-bg)]' : ''}`}
                  onClick={() => onSelect(d.id)}
                  aria-current={currentId === d.id ? 'page' : undefined}
                >
                  <div className="flex items-start gap-3">
                    {/* Thumbnail placeholder */}
                    <div className="w-10 h-12 rounded bg-[var(--bg-secondary)] border border-[var(--border)] flex items-center justify-center text-lg flex-shrink-0">
                      📄
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate text-[var(--fg)]">{d.name}</div>
                      <div className="flex items-center gap-2 text-xs text-[var(--fg-muted)] mt-1">
                        <span>{d.pages ?? '—'} pages</span>
                        {d.lastOpened && (
                          <span className="text-[var(--fg-muted)]">• {formatDate(d.lastOpened)}</span>
                        )}
                      </div>
                      {/* Progress bar */}
                      {(d.progress ?? 0) > 0 && (
                        <div className="mt-2">
                          <div className="progress-bar">
                            <div
                              className="progress-bar-fill"
                              style={{ width: `${Math.round((d.progress ?? 0) * 100)}%` }}
                            />
                          </div>
                          <div className="text-xs text-[var(--fg-muted)] mt-0.5">
                            {Math.round((d.progress ?? 0) * 100)}% complete
                          </div>
                        </div>
                      )}
                    </div>
                    {/* Delete button */}
                    <button
                      className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-500/20 text-[var(--fg-muted)] hover:text-red-500 transition-all"
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
                      <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        {/* Contents tab */}
        {tab === 'contents' && (
          <ul className="p-2 space-y-0.5">
            {(toc || []).map((t, i) => (
              <li key={t.index}>
                <button
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-[var(--highlight-bg)] transition-colors text-sm"
                  onClick={() => onJumpToIndex && onJumpToIndex(t.index)}
                  style={{ paddingLeft: `${((t.level ?? 2) - 1) * 12 + 12}px` }}
                >
                  <span className={`truncate block text-[var(--fg)] ${t.level === 1 ? 'font-semibold' : ''}`}>
                    {t.title}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* Bookmarks tab */}
        {tab === 'bookmarks' && (
          <ul className="p-2 space-y-1">
            {(bookmarks || []).map((b) => (
              <li key={b.id} className="group">
                <div className="card p-3 hover:border-[var(--accent)]">
                  <div className="flex items-center gap-3">
                    <span className="text-lg">🔖</span>
                    <button
                      className="flex-1 text-left"
                      onClick={() => onJumpToIndex && onJumpToIndex(b.paragraphIndex)}
                    >
                      <div className="font-medium text-sm text-[var(--fg)]">Paragraph {b.paragraphIndex + 1}</div>
                      {b.note && (
                        <div className="text-xs text-[var(--fg-muted)] truncate mt-0.5">{b.note}</div>
                      )}
                    </button>
                    <button
                      className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-500/20 text-[var(--fg-muted)] hover:text-red-500 transition-all"
                      onClick={() => onRemoveBookmark && onRemoveBookmark(b.id)}
                      aria-label="Remove bookmark"
                    >
                      <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Footer with drag hint */}
      <div className="p-3 border-t border-[var(--border)] text-center text-xs text-[var(--fg-muted)]">
        {isDragging ? (
          <span className="text-[var(--accent)] font-medium">Drop PDF to import</span>
        ) : (
          <span>Drag & drop PDFs here</span>
        )}
      </div>
    </aside>
  );
}
