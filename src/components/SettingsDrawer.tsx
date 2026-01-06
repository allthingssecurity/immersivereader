import React, { useEffect, useState } from 'react';
import { detectTtsSupport, speakTextOnce } from '@/lib/tts';

export type Typography = {
  family: 'serif' | 'sans' | 'opendyslexic';
  size: number;
  lineHeight: number;
  paragraphSpacing: number;
  measure: number;
  focus: 'off' | '1line' | '3lines' | 'paragraph' | 'spotlight';
  wpm: number;
  justify: boolean;
  bionic: boolean;
};

const defaultTypo: Typography = {
  family: 'serif',
  size: 18,
  lineHeight: 1.7,
  paragraphSpacing: 16,
  measure: 70,
  focus: 'off',
  wpm: 220,
  justify: false,
  bionic: false,
};

// Preset profiles
const presets: Record<string, Partial<Typography>> = {
  relaxed: {
    family: 'serif',
    size: 20,
    lineHeight: 1.8,
    paragraphSpacing: 20,
    measure: 65,
    focus: 'off',
    wpm: 180,
  },
  focused: {
    family: 'sans',
    size: 18,
    lineHeight: 1.6,
    paragraphSpacing: 14,
    measure: 70,
    focus: 'paragraph',
    bionic: true,
  },
  speed: {
    family: 'sans',
    size: 16,
    lineHeight: 1.5,
    paragraphSpacing: 10,
    measure: 80,
    focus: 'spotlight',
    wpm: 300,
    bionic: true,
  },
};

export function SettingsDrawer({ open, setOpen }: { open: boolean; setOpen: (v: boolean) => void }) {
  const [typo, setTypo] = useState<Typography>(() => {
    const raw = localStorage.getItem('typography');
    return raw ? { ...defaultTypo, ...JSON.parse(raw) } as Typography : defaultTypo;
  });
  const [activeSection, setActiveSection] = useState<'typography' | 'focus' | 'tts' | 'presets'>('typography');

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

  const applyPreset = (preset: keyof typeof presets) => {
    setTypo({ ...typo, ...presets[preset] });
  };

  return (
    <>
      {/* Toggle button when closed - positioned at bottom right to avoid overlapping reader toolbar */}
      {!open && (
        <button
          className="fixed right-4 bottom-20 md:bottom-8 btn btn-primary shadow-lg z-40 rounded-full p-3"
          onClick={() => setOpen(true)}
          aria-label="Open Settings"
          title="Reading Settings"
        >
          <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
      )}

      {/* Settings panel */}
      <aside
        className={`
          fixed right-0 top-0 bottom-0 w-80 glass border-l border-[var(--border)]
          transform transition-transform duration-300 ease-out z-50
          ${open ? 'translate-x-0' : 'translate-x-full'}
        `}
        aria-label="Settings"
      >
        <div className="h-full flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
            <h2 className="font-semibold text-[var(--fg)]">Settings</h2>
            <button
              className="btn btn-ghost p-1"
              onClick={() => setOpen(false)}
              aria-label="Close settings"
            >
              <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Section tabs */}
          <div className="flex border-b border-[var(--border)]">
            {(['presets', 'typography', 'focus', 'tts'] as const).map((section) => (
              <button
                key={section}
                className={`flex-1 py-2 text-xs font-medium capitalize transition-colors
                  ${activeSection === section
                    ? 'text-[var(--accent)] border-b-2 border-[var(--accent)]'
                    : 'text-[var(--fg-muted)] hover:text-[var(--fg)]'
                  }`}
                onClick={() => setActiveSection(section)}
              >
                {section}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-auto p-4 space-y-4">
            {/* Presets */}
            {activeSection === 'presets' && (
              <div className="space-y-3 animate-fade-in">
                <p className="text-xs text-[var(--fg-muted)]">Quick presets for different reading styles:</p>
                <PresetCard
                  name="Relaxed"
                  description="Comfortable reading with larger text"
                  icon="🌙"
                  onClick={() => applyPreset('relaxed')}
                />
                <PresetCard
                  name="Focused"
                  description="Distraction-free with bionic reading"
                  icon="🎯"
                  onClick={() => applyPreset('focused')}
                />
                <PresetCard
                  name="Speed Reading"
                  description="Optimized for fast consumption"
                  icon="🚀"
                  onClick={() => applyPreset('speed')}
                />
              </div>
            )}

            {/* Typography */}
            {activeSection === 'typography' && (
              <div className="space-y-4 animate-fade-in">
                <div>
                  <label className="block text-xs text-[var(--fg-muted)] mb-2">Font Family</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['serif', 'sans', 'opendyslexic'] as const).map((f) => (
                      <button
                        key={f}
                        className={`btn text-xs capitalize ${typo.family === f ? 'btn-primary' : ''}`}
                        onClick={() => setTypo({ ...typo, family: f })}
                      >
                        {f === 'opendyslexic' ? 'Dyslexic' : f}
                      </button>
                    ))}
                  </div>
                </div>
                <Slider
                  label="Font Size"
                  min={14} max={28} step={1}
                  value={typo.size}
                  onChange={(v) => setTypo({ ...typo, size: v })}
                  unit="px"
                />
                <Slider
                  label="Line Height"
                  min={1.2} max={2.2} step={0.1}
                  value={typo.lineHeight}
                  onChange={(v) => setTypo({ ...typo, lineHeight: v })}
                />
                <Slider
                  label="Paragraph Spacing"
                  min={0} max={32} step={2}
                  value={typo.paragraphSpacing}
                  onChange={(v) => setTypo({ ...typo, paragraphSpacing: v })}
                  unit="px"
                />
                <Slider
                  label="Column Width"
                  min={40} max={90} step={2}
                  value={typo.measure}
                  onChange={(v) => setTypo({ ...typo, measure: v })}
                  unit="ch"
                />
                <div className="pt-2 border-t border-[var(--border)] space-y-2">
                  <Toggle
                    label="Justify Text"
                    checked={typo.justify}
                    onChange={(v) => setTypo({ ...typo, justify: v })}
                  />
                  <Toggle
                    label="Bionic Reading"
                    checked={typo.bionic}
                    onChange={(v) => setTypo({ ...typo, bionic: v })}
                    hint="Bold first part of words"
                  />
                </div>
              </div>
            )}

            {/* Focus Mode */}
            {activeSection === 'focus' && (
              <div className="space-y-4 animate-fade-in">
                <p className="text-xs text-[var(--fg-muted)]">Choose how to highlight your reading position:</p>
                <div className="space-y-2">
                  {([
                    { value: 'off', label: 'Off', desc: 'No focus highlighting' },
                    { value: '1line', label: '1 Line', desc: 'Highlight single line under cursor' },
                    { value: '3lines', label: '3 Lines', desc: 'Highlight 3 lines under cursor' },
                    { value: 'paragraph', label: 'Paragraph', desc: 'Highlight current paragraph' },
                    { value: 'spotlight', label: 'Spotlight', desc: 'Dim everything except current' },
                  ] as const).map((opt) => (
                    <button
                      key={opt.value}
                      className={`w-full text-left p-3 rounded-lg border transition-all
                        ${typo.focus === opt.value
                          ? 'border-[var(--accent)] bg-[var(--highlight-bg)]'
                          : 'border-[var(--border)] hover:border-[var(--border-hover)]'
                        }`}
                      onClick={() => setTypo({ ...typo, focus: opt.value })}
                    >
                      <div className="font-medium text-sm text-[var(--fg)]">{opt.label}</div>
                      <div className="text-xs text-[var(--fg-muted)]">{opt.desc}</div>
                    </button>
                  ))}
                </div>
                <Slider
                  label="Reading Speed (WPM)"
                  min={100} max={400} step={10}
                  value={typo.wpm}
                  onChange={(v) => setTypo({ ...typo, wpm: v })}
                />
              </div>
            )}

            {/* TTS */}
            {activeSection === 'tts' && (
              <div className="animate-fade-in">
                <TtsControls defaultRate={Math.max(0.5, Math.min(1.2, typo.wpm / 220))} />
              </div>
            )}
          </div>

          {/* Reset button */}
          <div className="p-4 border-t border-[var(--border)]">
            <button
              className="btn w-full"
              onClick={() => setTypo(defaultTypo)}
            >
              Reset to Defaults
            </button>
          </div>
        </div>
      </aside>

      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40"
          onClick={() => setOpen(false)}
        />
      )}
    </>
  );
}

function PresetCard({ name, description, icon, onClick }: {
  name: string;
  description: string;
  icon: string;
  onClick: () => void;
}) {
  return (
    <button
      className="w-full text-left p-4 rounded-lg border border-[var(--border)] hover:border-[var(--accent)] hover:bg-[var(--highlight-bg)] transition-all group"
      onClick={onClick}
    >
      <div className="flex items-center gap-3">
        <span className="text-2xl">{icon}</span>
        <div>
          <div className="font-medium text-[var(--fg)] group-hover:text-[var(--accent)]">{name}</div>
          <div className="text-xs text-[var(--fg-muted)]">{description}</div>
        </div>
      </div>
    </button>
  );
}

function Slider({ label, min, max, step, value, onChange, unit = '' }: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
  unit?: string;
}) {
  return (
    <div>
      <div className="flex justify-between text-xs mb-2">
        <label className="text-[var(--fg-muted)]">{label}</label>
        <span className="font-medium text-[var(--fg)]">{value}{unit}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full"
      />
    </div>
  );
}

function Toggle({ label, checked, onChange, hint }: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  hint?: string;
}) {
  return (
    <label className="flex items-center gap-3 cursor-pointer group">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <div>
        <span className="text-sm text-[var(--fg)] group-hover:text-[var(--accent)]">{label}</span>
        {hint && <span className="text-xs text-[var(--fg-muted)] ml-2">({hint})</span>}
      </div>
    </label>
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
  const support = detectTtsSupport();

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
    const u = new SpeechSynthesisUtterance(text.slice(0, 500));
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

  if (!support.available) {
    return (
      <div className="text-center py-8">
        <div className="text-4xl mb-3">🔇</div>
        <p className="text-sm text-[var(--fg-muted)]">Speech synthesis is not supported in this browser.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <button
          className={`btn flex-1 ${speaking ? '' : 'btn-primary'}`}
          onClick={speaking ? pause : speakSelection}
        >
          {speaking ? (
            <>
              <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
              </svg>
              Pause
            </>
          ) : (
            <>
              <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
              Play
            </>
          )}
        </button>
        <button className="btn" onClick={resume}>Resume</button>
        <button className="btn" onClick={stop}>Stop</button>
      </div>

      <div>
        <label className="block text-xs text-[var(--fg-muted)] mb-2">Voice</label>
        <select
          className="select w-full"
          value={voiceIndex}
          onChange={(e) => setVoiceIndex(Number(e.target.value))}
        >
          {voices.map((v, i) => (
            <option key={v.name + i} value={i}>{v.name}</option>
          ))}
        </select>
        <div className="text-xs text-[var(--fg-muted)] mt-1">{voices.length} voices available</div>
      </div>

      <Slider
        label="Speech Rate"
        min={0.5} max={2} step={0.1}
        value={rate}
        onChange={setRate}
        unit="x"
      />

      <button
        className="btn w-full"
        onClick={async () => {
          try {
            await speakTextOnce('Hello from Lumen Reader. Your voice is ready.', { rate, voiceName: voices[voiceIndex]?.name });
          } catch (e) {
            alert((e as Error).message);
          }
        }}
      >
        <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
        </svg>
        Test Voice
      </button>
    </div>
  );
}
