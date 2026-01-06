/// <reference lib="webworker" />
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import type { TextContent } from 'pdfjs-dist/types/src/display/api';

// pdf.js worker config: use the bundled worker entry
// Vite will resolve the path from pdfjs-dist/build/pdf.worker.mjs
// We keep parsing in this worker (our worker), not pdf.js worker.
// @ts-ignore
GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.mjs', import.meta.url).toString();

type ExtractOptions = { mode: 'fast' | 'accurate'; enableOcr: boolean };

type PageParagraph = { text: string; fontSize: number; bold: boolean; y: number; heading?: number };

self.onmessage = async (ev: MessageEvent) => {
  const data = ev.data as { type: 'extract'; id: string; name: string; opts: ExtractOptions };
  if (data.type !== 'extract') return;

  try {
    const { id, opts } = data;
    const db = await openDb();
    const fileBlob = await getFileBlob(db, id);
    if (!fileBlob) throw new Error('File blob missing');

    const arrayBuffer = await fileBlob.arrayBuffer();
    const pdf = await getDocument({ data: arrayBuffer }).promise;

    const blocks: { kind: 'p' | 'h'; level?: number; text: string }[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      try {
        const content = await page.getTextContent();
        const merged = mergeText(content, opts);
        merged.forEach(p => {
          const text = escapeAndFormat(p.text);
          if (p.heading) blocks.push({ kind: 'h', level: p.heading, text });
          else blocks.push({ kind: 'p', text });
        });
      } catch (e) {
        // Extraction failed for this page; optionally OCR if enabled
        if (opts.enableOcr) {
          const viewport = page.getViewport({ scale: 2.0 });
          const canvas = new OffscreenCanvas(viewport.width, viewport.height);
          const ctx = canvas.getContext('2d')!;
          // @ts-ignore
          await page.render({ canvasContext: ctx, viewport }).promise;
          // Defer OCR import to reduce bundle size
          const { createWorker } = await import('tesseract.js');
          const worker = await createWorker({ logger: () => {} });
          await worker.loadLanguage('eng');
          await worker.initialize('eng');
          const bitmap = await canvas.convertToBlob();
          const { data: { text } } = await worker.recognize(bitmap);
          await worker.terminate();
          blocks.push({ kind: 'p', text: escapeAndFormat(text) });
        } else {
          // Mark page as unextracted; UI will offer PDF view
          blocks.push({ kind: 'p', text: escapeAndFormat('[Unextracted page; open PDF view]') });
        }
      }
    }

    await putExtracted(db, { id, blocks });
    await updateDoc(db, id, { pages: pdf.numPages, extractionStatus: 'done' });
    (self as any).postMessage({ type: 'done', id });
    try {
      const bc = new BroadcastChannel('lumen-extraction');
      bc.postMessage({ type: 'done', id });
      bc.close();
    } catch {}
  } catch (e: any) {
    (self as any).postMessage({ type: 'error', error: e?.message ?? String(e) });
    try {
      const bc = new BroadcastChannel('lumen-extraction');
      bc.postMessage({ type: 'error', error: e?.message ?? String(e) });
      bc.close();
    } catch {}
  }
};

function escapeAndFormat(text: string): string {
  // Basic HTML text paragraph; convert quotes minimally, preserve emphasis markers later if needed.
  const esc = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return esc;
}

function mergeText(content: TextContent, opts: ExtractOptions): PageParagraph[] {
  // Heuristics: group text items by y proximity; merge lines considering hyphenation and punctuation.
  const items = content.items as any[];
  type Raw = { str: string; x: number; y: number; fontSize: number; width: number };
  const raws: Raw[] = items.map((it: any) => {
    const a = it.transform[0], b = it.transform[1], c = it.transform[2], d = it.transform[3];
    const scaleX = Math.hypot(a, b);
    const scaleY = Math.hypot(c, d);
    return {
      str: it.str as string,
      x: it.transform[4],
      y: it.transform[5],
      fontSize: scaleY,
      width: (it.width || 0) * scaleX
    };
  });

  // Sort by y desc (PDF origin bottom-left), then x asc
  raws.sort((a, b) => (b.y - a.y) || (a.x - b.x));

  // Cluster lines by y, then within each line sort by x and join tokens
  const lines: Raw[][] = [];
  for (const r of raws) {
    const last = lines[lines.length - 1];
    if (!last || Math.abs(last[0].y - r.y) > (opts.mode === 'accurate' ? 1.5 : 2.5)) {
      lines.push([r]);
    } else {
      last.push(r);
    }
  }
  for (const line of lines) line.sort((a, b) => a.x - b.x);

  const yThreshold = opts.mode === 'accurate' ? 2.0 : 3.0;
  const paragraphs: PageParagraph[] = [];
  let current: PageParagraph | null = null;

  const pushCurrent = () => {
    if (!current) return;
    current.text = postProcessLineBreaks(current.text);
    paragraphs.push(current);
    current = null;
  };

  const avgFont = averageFontSize(raws);
  for (const line of lines) {
    const r = line[0];
    if (!current) {
      current = { text: line.map(t => t.str).join(' '), fontSize: r.fontSize, bold: false, y: r.y };
      continue;
    }
    const dy = Math.abs(r.y - current.y);
    const sameLine = dy < yThreshold;
    if (sameLine) {
      if (needsSpace(current.text, line[0].str)) current.text += ' ';
      current.text += line.map(t => t.str).join(' ');
      current.y = (current.y + r.y) / 2;
      current.fontSize = (current.fontSize + r.fontSize) / 2;
    } else {
      // new line
      // decide paragraph boundary based on punctuation and font size change
      const boundary = /[.!?\u2026]["'”)\]]?\s*$/.test(current.text) || r.fontSize > current.fontSize * 1.12 || opts.mode === 'accurate';
      if (boundary) {
        // mark heading if font is significantly larger
        if (current.fontSize >= avgFont * 1.3) current.heading = 2;
        pushCurrent();
        current = { text: line.map(t => t.str).join(' '), fontSize: r.fontSize, bold: false, y: r.y };
      } else {
        // merge as soft line break (remove hyphenation if any)
        if (/[A-Za-z]-$/.test(current.text)) current.text = current.text.replace(/-$/, '');
        else current.text += ' ';
        current.text += line.map(t => t.str).join(' ');
        current.y = r.y;
        current.fontSize = (current.fontSize + r.fontSize) / 2;
      }
    }
  }
  pushCurrent();
  return paragraphs;
}

function needsSpace(prev: string, next: string): boolean {
  if (prev.length === 0) return false;
  if (/[\s\u00A0]$/.test(prev)) return false;
  // No space before following punctuation
  if (/^[,.;:!?)]/.test(next)) return false;
  // No extra space before hyphen/en dash
  if (/[\-\u2013\u2014]$/.test(prev)) return false;
  return true;
}

function postProcessLineBreaks(text: string): string {
  // Remove hyphenation at breaks (already handled), collapse multiple spaces, basic sentence spacing.
  return text.replace(/\s+/g, ' ').trim();
}

// IndexedDB helpers in worker
const DB_NAME = 'lumen-reader-db';
const openDb = (): Promise<IDBDatabase> => new Promise((resolve, reject) => {
  const req = indexedDB.open(DB_NAME, 2);
  req.onupgradeneeded = () => {
    const db = req.result;
    if (!db.objectStoreNames.contains('docs')) db.createObjectStore('docs', { keyPath: 'id' });
    if (!db.objectStoreNames.contains('content')) db.createObjectStore('content', { keyPath: 'id' });
    if (!db.objectStoreNames.contains('files')) db.createObjectStore('files', { keyPath: 'id' });
    if (!db.objectStoreNames.contains('bookmarks')) db.createObjectStore('bookmarks', { keyPath: 'id' });
    if (!db.objectStoreNames.contains('highlights')) db.createObjectStore('highlights', { keyPath: 'id' });
  };
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

const getFileBlob = (db: IDBDatabase, id: string): Promise<Blob | null> => new Promise((resolve, reject) => {
  const tx = db.transaction('files', 'readonly');
  const req = tx.objectStore('files').get(id);
  req.onsuccess = () => resolve(req.result?.blob ?? null);
  req.onerror = () => reject(req.error);
});

const putExtracted = (db: IDBDatabase, content: { id: string; blocks: { kind: 'p' | 'h'; level?: number; text: string }[] }) => new Promise<void>((resolve, reject) => {
  const tx = db.transaction('content', 'readwrite');
  tx.objectStore('content').put(content);
  tx.oncomplete = () => resolve();
  tx.onerror = () => reject(tx.error);
});

const updateDoc = (db: IDBDatabase, id: string, partial: any) => new Promise<void>((resolve, reject) => {
  const tx = db.transaction('docs', 'readwrite');
  const store = tx.objectStore('docs');
  const req = store.get(id);
  req.onsuccess = () => {
    const cur = req.result || { id };
    store.put({ ...cur, ...partial });
  };
  tx.oncomplete = () => resolve();
  tx.onerror = () => reject(tx.error);
});

function averageFontSize(raws: { fontSize: number }[]): number {
  if (raws.length === 0) return 12;
  return raws.reduce((a, r) => a + r.fontSize, 0) / raws.length;
}
