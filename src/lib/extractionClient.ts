// Client helper to call the extraction worker
export type ExtractOptions = { mode: 'fast' | 'accurate'; enableOcr: boolean };

export function extractPdf(id: string, name: string, opts: ExtractOptions) {
  return new Promise<void>((resolve, reject) => {
    const worker = new Worker(new URL('../workers/extractorWorker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (ev) => {
      const { type } = ev.data;
      if (type === 'done') {
        worker.terminate();
        resolve();
      } else if (type === 'error') {
        console.error('Extraction error', ev.data.error);
        worker.terminate();
        reject(new Error(ev.data.error));
      }
    };
    worker.postMessage({ type: 'extract', id, name, opts });
  });
}

