let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!audioCtx) audioCtx = new Ctor();
  if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
  return audioCtx;
}

export function isSoundEnabled(): boolean {
  return localStorage.getItem('mj_sound_enabled') !== 'false';
}

function playNote(ctx: AudioContext, freq: number, type: OscillatorType, start: number, duration: number, peakGain: number): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(peakGain, start + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

// Bandpass-filtered white noise burst — used for "clack"/"knock" textures
function playNoiseBurst(ctx: AudioContext, start: number, duration: number, filterFreq: number, q: number, peakGain: number): void {
  const bufferSize = Math.ceil(ctx.sampleRate * duration);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

  const src = ctx.createBufferSource();
  src.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = filterFreq;
  filter.Q.value = q;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(peakGain, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  src.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  src.start(start);
  src.stop(start + duration + 0.02);
}

// Plastic clack — tile hitting the table
export function playDiscardSound(): void {
  if (!isSoundEnabled()) return;
  const ctx = getCtx();
  if (!ctx) return;
  const t = ctx.currentTime;
  playNoiseBurst(ctx, t, 0.05, 1600, 3, 0.45);
  playNote(ctx, 700, 'triangle', t, 0.04, 0.15);
}

// Double knock — chi / pong
export function playMeldSound(): void {
  if (!isSoundEnabled()) return;
  const ctx = getCtx();
  if (!ctx) return;
  const t = ctx.currentTime;
  playNote(ctx, 260, 'triangle', t, 0.09, 0.25);
  playNote(ctx, 260, 'triangle', t + 0.09, 0.09, 0.25);
}

// Triple knock — kong (open/closed/added)
export function playKongSound(): void {
  if (!isSoundEnabled()) return;
  const ctx = getCtx();
  if (!ctx) return;
  const t = ctx.currentTime;
  for (let i = 0; i < 3; i++) {
    playNote(ctx, 240, 'triangle', t + i * 0.085, 0.09, 0.28);
  }
}

// Bell chime — flower tile replacement
export function playFlowerSound(): void {
  if (!isSoundEnabled()) return;
  const ctx = getCtx();
  if (!ctx) return;
  const t = ctx.currentTime;
  playNote(ctx, 1046.5, 'sine', t, 0.35, 0.18);
  playNote(ctx, 1318.5, 'sine', t + 0.12, 0.4, 0.18);
}

// Rising arpeggio — winning hand (和牌)
export function playWinSound(): void {
  if (!isSoundEnabled()) return;
  const ctx = getCtx();
  if (!ctx) return;
  const t = ctx.currentTime;
  const notes = [523.25, 659.25, 784.0, 1046.5];
  notes.forEach((freq, i) => {
    playNote(ctx, freq, 'triangle', t + i * 0.1, 0.5, 0.22);
  });
}
