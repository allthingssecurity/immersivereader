import React, { useEffect, useState } from 'react';
import { detectTtsSupport, speakTextOnce } from '@/lib/tts';

export type Typography = {
  family: 'serif' | 'sans' | 'opendyslexic';
  size: number;
  lineHeight: number;
  paragraphSpacing: number;
  measure: number; // max width in ch
  focus: 'off' | '1line' | '3lines' | 'paragraph';
  wpm: number;
  justify: boolean;
  bionic: boolean;
};

const defaultTypo: Typography = {
  family: 'serif',
  size: 18,
  lineHeight: 1.6,
  paragraphSpacing: 12,
  measure: 70,
  focus: 'off',
  wpm: 220,
  justify: false,
  bionic: false,
};

export function SettingsDrawer({ open, setOpen }: { open: boolean; setOpen: (v: boolean) => void }) {
  const [typo, setTypo] = useState<Typography>(() => {
    const raw = localStorage.getItem('typography');
    return raw ? JSON.parse(raw) as Typography : defaultTypo;
  });

  useEffect(() => {
    localStorage.setItem('typography', JSON.stringify(typo));
    document.documentElement.style.setProperty('--measure', `${typo.measure}ch`);
    document.documentElement.style.setProperty('--font-size', `${typo.size}px`);
    document.documentElement.style.setProperty('--line-height', String(typo.lineHeight));
    document.documentElement.style.setProperty('--paragraph-spacing', `${typo.paragraphSpacing}px`);
    const ff = typo.family === 'serif' ? 'Georgia, Cambria, "Times New Roman", Times, serif'
      : typo.family === 'opendyslexic' ? 'OpenDyslexic, system-ui, sans-serif'
      : 'Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, Helvetica Neue, Arial';
    document.documentElement.style.setProperty('--reader-font', ff);
    document.documentElement.style.setProperty('--focus-mode', typo.focus);
    document.documentElement.style.setProperty('--wpm', String(typo.wpm));
  }, [typo]);

  return (
    <aside
      className={`w-80 border-l border-slate-200/60 p-3 bg-[var(--panel)]/40 transition-transform duration-300 ${open ? 'translate-x-0' : 'translate-x-80'}`}
      aria-label="Settings"
    >
      <div className="flex items-center mb-2">
        <div className="font-semibold text-sm">Settings</div>
        <button className="ml-auto text-sm underline" onClick={() => setOpen(!open)}>{open ? 'Close' : 'Open'}</button>
      </div>
      <div className="space-y-3 text-sm">
        <div>
          <label className="block text-xs text-slate-500 mb-1">Font family</label>
          <select className="w-full border rounded px-2 py-1" value={typo.family} onChange={(e) => setTypo({ ...typo, family: e.target.value as any })}>
            <option value="serif">Serif</option>
            <option value="sans">Sans</option>
            <option value="opendyslexic">OpenDyslexic</option>
          </select>
        </div>
        <Slider label="Font size" min={14} max={28} step={1} value={typo.size} onChange={(v) => setTypo({ ...typo, size: v })} />
        <Slider label="Line height" min={1.2} max={2} step={0.05} value={typo.lineHeight} onChange={(v) => setTypo({ ...typo, lineHeight: v })} />
        <Slider label="Paragraph spacing" min={0} max={32} step={2} value={typo.paragraphSpacing} onChange={(v) => setTypo({ ...typo, paragraphSpacing: v })} />
        <Slider label="Measure (column width in ch)" min={40} max={90} step={2} value={typo.measure} onChange={(v) => setTypo({ ...typo, measure: v })} />

        <div>
          <label className="block text-xs text-slate-500 mb-1">Focus mode</label>
          <select className="w-full border rounded px-2 py-1" value={typo.focus} onChange={(e) => setTypo({ ...typo, focus: e.target.value as any })}>
            <option value="off">Off</option>
            <option value="1line">1 line</option>
            <option value="3lines">3 lines</option>
            <option value="paragraph">Paragraph</option>
          </select>
        </div>

        <Slider label="Reading speed (WPM)" min={100} max={220} step={10} value={typo.wpm} onChange={(v) => setTypo({ ...typo, wpm: v })} />

        <div className="pt-2 border-t border-slate-200/60">
          <div className="text-xs text-slate-500 mb-1">Read Aloud (Web Speech API)</div>
          <TtsControls defaultRate={Math.max(0.5, Math.min(1.2, typo.wpm / 220))} />
        </div>

        <div className="pt-2 border-t border-slate-200/60 grid grid-cols-2 gap-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={typo.justify} onChange={(e)=> setTypo({ ...typo, justify: e.target.checked })} />
            Justify text
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={typo.bionic} onChange={(e)=> setTypo({ ...typo, bionic: e.target.checked })} />
            Bionic reading
          </label>
        </div>
      </div>
    </aside>
  );
}

function Slider({ label, min, max, step, value, onChange }: { label: string; min: number; max: number; step: number; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <label className="block text-xs text-slate-500 mb-1">{label}</label>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full" />
      <div className="text-xs text-slate-500">{value}</div>
    </div>
  );
}

function TtsControls({ defaultRate }: { defaultRate: number }) {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceIndex, setVoiceIndex] = useState<number>(() => {
    const saved = localStorage.getItem('ttsVoiceName');
    if (!saved) return 0;
    const vs = window.speechSynthesis.getVoices();
    const idx = vs.findIndex(v => v.name === saved);
    return idx >= 0 ? idx : 0;
  });
  const [rate, setRate] = useState<number>(defaultRate);
  const [speaking, setSpeaking] = useState<boolean>(false);

  useEffect(() => {
    const loadVoices = () => setVoices(window.speechSynthesis.getVoices());
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }, []);

  const speakSelection = () => {
    const sel = window.getSelection?.();
    const text = sel?.toString() || document.querySelector('[aria-label="Reading content"]')?.textContent || '';
    if (!text) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = rate;
    u.voice = voices[voiceIndex];
    u.onend = () => setSpeaking(false);
    window.speechSynthesis.speak(u);
    setSpeaking(true);
  };

  const stop = () => { window.speechSynthesis.cancel(); setSpeaking(false); };
  const pause = () => window.speechSynthesis.pause();
  const resume = () => window.speechSynthesis.resume();

  useEffect(() => {
    if (voices[voiceIndex]?.name) {
      localStorage.setItem('ttsVoiceName', voices[voiceIndex].name);
    }
  }, [voiceIndex, voices]);

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <button className="px-2 py-1 border rounded" onClick={speaking ? pause : speakSelection}>{speaking ? 'Pause' : 'Play'}</button>
        <button className="px-2 py-1 border rounded" onClick={resume}>Resume</button>
        <button className="px-2 py-1 border rounded" onClick={stop}>Stop</button>
      </div>
      <div>
        <label className="block text-xs text-slate-500 mb-1">Voice</label>
        <select className="w-full border rounded px-2 py-1" value={voiceIndex} onChange={(e) => setVoiceIndex(Number(e.target.value))} disabled={!detectTtsSupport().available}>
          {voices.map((v, i) => (
            <option key={v.name + i} value={i}>{v.name}</option>
          ))}
        </select>
        <div className="text-xs text-slate-500 mt-1">{detectTtsSupport().available ? `${voices.length} voices available` : 'Speech synthesis not supported in this browser'}</div>
        <button
          className="mt-2 px-2 py-1 border rounded"
          onClick={async () => {
            try {
              await speakTextOnce('Hello from Lumen Reader', { rate, voiceName: voices[voiceIndex]?.name });
            } catch (e) {
              alert((e as Error).message);
            }
          }}
        >
          Test Voice
        </button>
      </div>
      <div>
        <label className="block text-xs text-slate-500 mb-1">Rate</label>
        <input type="range" min={0.5} max={2} step={0.1} value={rate} onChange={(e) => setRate(Number(e.target.value))} className="w-full" />
      </div>
    </div>
  );
}
