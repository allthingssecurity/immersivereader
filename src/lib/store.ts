// Minimal IndexedDB wrapper for documents and extracted content
export type StoredDoc = {
  id: string;
  name: string;
  pages?: number;
  size?: number;
  addedAt: number;
  lastOpened?: number;
  progress?: number; // 0..1
  extractionStatus?: 'pending' | 'processing' | 'done' | 'failed';
  lastParagraphIndex?: number;
};

export type ExtractedBlock = { kind: 'p' | 'h'; level?: 1|2|3; text: string };
export type ExtractedContent = { id: string; blocks: ExtractedBlock[] };

export type Bookmark = { id: string; docId: string; paragraphIndex: number; note?: string; createdAt: number };
export type Highlight = { id: string; docId: string; paragraphIndex: number; start: number; end: number; color: string; createdAt: number };

const DB_NAME = 'lumen-reader-db';
const DB_VERSION = 2;

export class DocumentStore {
  private dbp: Promise<IDBDatabase>;
  constructor() {
    this.dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
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
  }

  private async tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => void): Promise<T> {
    const db = await this.dbp;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, mode);
      const st = tx.objectStore(store);
      tx.oncomplete = () => resolve((undefined as unknown) as T);
      tx.onerror = () => reject(tx.error);
      fn(st);
    });
  }

  async importPdf(file: File): Promise<string> {
    const id = crypto.randomUUID();
    const doc: StoredDoc = { id, name: file.name, size: file.size, addedAt: Date.now(), extractionStatus: 'pending' };
    const buf = await file.arrayBuffer();
    const db = await this.dbp;
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['docs', 'files'], 'readwrite');
      tx.objectStore('docs').put(doc);
      tx.objectStore('files').put({ id, blob: new Blob([buf], { type: file.type }) });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    return id;
  }

  async getFileBlob(id: string): Promise<Blob | null> {
    const db = await this.dbp;
    return new Promise((resolve, reject) => {
      const tx = db.transaction('files', 'readonly');
      const req = tx.objectStore('files').get(id);
      req.onsuccess = () => resolve(req.result?.blob ?? null);
      req.onerror = () => reject(req.error);
    });
  }

  async listDocs(): Promise<StoredDoc[]> {
    const db = await this.dbp;
    return new Promise((resolve, reject) => {
      const tx = db.transaction('docs', 'readonly');
      const req = tx.objectStore('docs').getAll();
      req.onsuccess = () => resolve((req.result as StoredDoc[]).sort((a, b) => (b.lastOpened ?? 0) - (a.lastOpened ?? 0)));
      req.onerror = () => reject(req.error);
    });
  }

  async getDoc(id: string): Promise<StoredDoc | undefined> {
    const db = await this.dbp;
    return new Promise((resolve, reject) => {
      const tx = db.transaction('docs', 'readonly');
      const req = tx.objectStore('docs').get(id);
      req.onsuccess = () => resolve(req.result as StoredDoc | undefined);
      req.onerror = () => reject(req.error);
    });
  }

  async setDoc(doc: StoredDoc): Promise<void> {
    const db = await this.dbp;
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('docs', 'readwrite');
      tx.objectStore('docs').put(doc);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async setExtracted(content: ExtractedContent): Promise<void> {
    const db = await this.dbp;
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('content', 'readwrite');
      tx.objectStore('content').put(content);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async getExtracted(id: string): Promise<ExtractedContent | undefined> {
    const db = await this.dbp;
    return new Promise((resolve, reject) => {
      const tx = db.transaction('content', 'readonly');
      const req = tx.objectStore('content').get(id);
      req.onsuccess = () => resolve(req.result as ExtractedContent | undefined);
      req.onerror = () => reject(req.error);
    });
  }

  async updateProgress(id: string, partial: Partial<Pick<StoredDoc, 'progress' | 'lastParagraphIndex' | 'lastOpened'>>): Promise<void> {
    const db = await this.dbp;
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('docs', 'readwrite');
      const st = tx.objectStore('docs');
      const get = st.get(id);
      get.onsuccess = () => {
        const cur = (get.result as StoredDoc) || { id, name: 'Unknown', addedAt: Date.now() } as StoredDoc;
        st.put({ ...cur, ...partial });
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async addBookmark(docId: string, paragraphIndex: number, note?: string): Promise<Bookmark> {
    const bm: Bookmark = { id: crypto.randomUUID(), docId, paragraphIndex, note, createdAt: Date.now() };
    const db = await this.dbp;
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('bookmarks', 'readwrite');
      tx.objectStore('bookmarks').put(bm);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    return bm;
  }

  async addHighlight(docId: string, paragraphIndex: number, start: number, end: number, color: string): Promise<Highlight> {
    const hl: Highlight = { id: crypto.randomUUID(), docId, paragraphIndex, start, end, color, createdAt: Date.now() };
    const db = await this.dbp;
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('highlights', 'readwrite');
      tx.objectStore('highlights').put(hl);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    return hl;
  }

  async listBookmarks(docId: string): Promise<Bookmark[]> {
    const db = await this.dbp;
    return new Promise((resolve, reject) => {
      const tx = db.transaction('bookmarks', 'readonly');
      const req = tx.objectStore('bookmarks').getAll();
      req.onsuccess = () => resolve((req.result as Bookmark[]).filter(b => b.docId === docId));
      req.onerror = () => reject(req.error);
    });
  }

  async listHighlights(docId: string): Promise<Highlight[]> {
    const db = await this.dbp;
    return new Promise((resolve, reject) => {
      const tx = db.transaction('highlights', 'readonly');
      const req = tx.objectStore('highlights').getAll();
      req.onsuccess = () => resolve((req.result as Highlight[]).filter(h => h.docId === docId));
      req.onerror = () => reject(req.error);
    });
  }

  async deleteDoc(id: string): Promise<void> {
    const db = await this.dbp;
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['docs','files','content','bookmarks','highlights'], 'readwrite');
      tx.objectStore('docs').delete(id);
      tx.objectStore('files').delete(id);
      tx.objectStore('content').delete(id);
      // best-effort clean bookmarks/highlights
      const bmStore = tx.objectStore('bookmarks');
      const hlStore = tx.objectStore('highlights');
      const bmReq = bmStore.getAll();
      bmReq.onsuccess = () => {
        (bmReq.result as Bookmark[]).filter(b => b.docId === id).forEach(b => bmStore.delete(b.id));
      };
      const hlReq = hlStore.getAll();
      hlReq.onsuccess = () => {
        (hlReq.result as Highlight[]).filter(h => h.docId === id).forEach(h => hlStore.delete(h.id));
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
}
