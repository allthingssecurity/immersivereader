import React, { useEffect, useRef, useState } from 'react';
import { DocumentStore } from '@/lib/store';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';

// @ts-ignore
GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.mjs', import.meta.url).toString();

export function PdfFallback({ docId, store, onClose }: { docId: string; store: DocumentStore; onClose: () => void }) {
  const [pages, setPages] = useState<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      const blob = await store.getFileBlob(docId);
      if (!blob) return;
      const ab = await blob.arrayBuffer();
      const pdf = await getDocument({ data: ab }).promise;
      setPages(pdf.numPages);
      const container = containerRef.current!;
      container.innerHTML = '';
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 1.2 });
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d')!;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        container.appendChild(canvas);
        await page.render({ canvasContext: context, viewport }).promise;
      }
    })();
  }, [docId, store]);

  return (
    <div className="h-full overflow-auto">
      <div className="border-b border-amber-300 bg-amber-50 text-amber-800 px-4 py-2 text-sm flex items-center gap-3">
        <span>Fallback PDF View: some pages may not extract cleanly.</span>
        <button className="ml-auto underline" onClick={onClose}>Back to Reading View</button>
      </div>
      <div ref={containerRef} className="p-6 grid gap-6 justify-center" />
    </div>
  );
}

