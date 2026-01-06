import React, { useEffect, useMemo, useState } from 'react';
import { ExtractedContent } from '@/lib/store';

export function SearchBar({ content, onJump }: { content: ExtractedContent | null; onJump: (index: number) => void }) {
  const [q, setQ] = useState('');
  const hits = useMemo(() => {
    if (!content || !q) return [] as number[];
    const needle = q.toLowerCase();
    const idxs: number[] = [];
    content.blocks.forEach((b, i) => {
      if (b.text.toLowerCase().includes(needle)) idxs.push(i);
    });
    return idxs;
  }, [content, q]);
  const [pos, setPos] = useState(0);

  useEffect(() => { setPos(0); }, [q]);

  return (
    <div className="flex items-center gap-2 text-sm">
      <input className="border rounded px-2 py-1" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} />
      <span className="text-slate-500">{hits.length} hits</span>
      <button className="px-2 py-1 border rounded" disabled={!hits.length} onClick={() => { const next = (pos - 1 + hits.length) % hits.length; setPos(next); onJump(hits[next]); }}>Prev</button>
      <button className="px-2 py-1 border rounded" disabled={!hits.length} onClick={() => { const next = (pos + 1) % hits.length; setPos(next); onJump(hits[next]); }}>Next</button>
    </div>
  );
}

