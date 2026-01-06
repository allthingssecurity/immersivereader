export type TtsOptions = {
  rate?: number; // 0.5..2
  voiceName?: string;
};

export type TtsController = {
  stop: () => void;
  pause: () => void;
  resume: () => void;
};

export type TtsSupport = {
  available: boolean;
  voices: number;
};

export function detectTtsSupport(): TtsSupport {
  const has = typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
  const voices = has ? (window.speechSynthesis.getVoices() || []).length : 0;
  return { available: !!has, voices };
}

function waitForVoices(timeoutMs = 1500): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    const voices = window.speechSynthesis.getVoices();
    if (voices && voices.length) return resolve(voices);
    const t = setTimeout(() => resolve(window.speechSynthesis.getVoices() || []), timeoutMs);
    window.speechSynthesis.onvoiceschanged = () => {
      clearTimeout(t);
      resolve(window.speechSynthesis.getVoices() || []);
    };
  });
}

function htmlDecode(s: string): string {
  const el = document.createElement('textarea');
  el.innerHTML = s;
  return el.value;
}

export async function speakParagraphs(paragraphs: string[], opts: TtsOptions = {}): Promise<TtsController> {
  if (!('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) {
    throw new Error('Speech synthesis is not supported in this browser.');
  }
  const voices = await waitForVoices();
  const voice = voices.find(v => v.name === opts.voiceName) || voices[0];
  const rate = Math.max(0.5, Math.min(2, opts.rate ?? 1));

  // Cancel anything currently speaking
  window.speechSynthesis.cancel();
  // Some browsers get stuck paused; ensure resumed
  try { window.speechSynthesis.resume(); } catch {}

  let cancelled = false;
  let paused = false;
  let index = 0;

  const speakNext = () => {
    if (cancelled || index >= paragraphs.length) return;
    const text = htmlDecode(paragraphs[index] || '');
    const u = new SpeechSynthesisUtterance(text);
    u.rate = rate;
    if (voice) u.voice = voice;
    u.volume = 1;
    u.pitch = 1;
    u.lang = navigator.language || 'en-US';
    u.onend = () => {
      if (!cancelled) {
        index += 1;
        speakNext();
      }
    };
    u.onerror = () => {
      // Skip problematic utterances to avoid stalling
      index += 1;
      speakNext();
    };
    window.speechSynthesis.speak(u);
  };

  speakNext();

  return {
    stop: () => { cancelled = true; window.speechSynthesis.cancel(); },
    pause: () => { paused = true; window.speechSynthesis.pause(); },
    resume: () => { if (paused) { paused = false; window.speechSynthesis.resume(); } }
  };
}

export async function speakTextOnce(text: string, opts: TtsOptions = {}): Promise<void> {
  if (!('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) {
    throw new Error('Speech synthesis is not supported in this browser.');
  }
  const voices = await waitForVoices();
  const voice = voices.find(v => v.name === opts.voiceName) || voices[0];
  const rate = Math.max(0.5, Math.min(2, opts.rate ?? 1));
  window.speechSynthesis.cancel();
  try { window.speechSynthesis.resume(); } catch {}
  const u = new SpeechSynthesisUtterance(text);
  if (voice) u.voice = voice;
  u.rate = rate;
  u.volume = 1;
  u.pitch = 1;
  u.lang = navigator.language || 'en-US';
  window.speechSynthesis.speak(u);
}
