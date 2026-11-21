// ─────────────────────────────────────────────────────────────────────────────
//  Raj Subway Game — audio.ts
//  Day 6: Synthesised sound effects + procedural background music
//  By Raj Computers
//
//  HOW IT WORKS
//  We use the browser's built-in Web Audio API to generate all sounds
//  mathematically — no sound files needed, no downloads, no licensing.
//  Every sound is a shaped waveform (sine, square, sawtooth) with an envelope
//  (how fast it fades in/out).
//
//  To add real music/SFX later just call:
//    new Howl({ src: ['music.mp3'], loop: true }).play();
// ─────────────────────────────────────────────────────────────────────────────

let ctx: AudioContext | null = null;
let musicGain: GainNode | null = null;
let sfxGain:   GainNode | null = null;
let musicNodes: AudioNode[] = [];
let musicPlaying = false;
let sfxEnabled   = true;

// Lazily create AudioContext on first user gesture (browser policy)
function getCtx(): AudioContext {
  if (!ctx) {
    ctx       = new AudioContext();
    musicGain = ctx.createGain(); musicGain.gain.value = 0.35; musicGain.connect(ctx.destination);
    sfxGain   = ctx.createGain(); sfxGain.gain.value   = 0.55; sfxGain.connect(ctx.destination);
  }
  return ctx;
}

// ── Low-level tone helper ─────────────────────────────────────────────────────
function playTone(
  freq: number, type: OscillatorType,
  startVol: number, endVol: number,
  duration: number, startTime = 0,
  dest?: AudioNode
): void {
  const c   = getCtx();
  const osc = c.createOscillator();
  const env = c.createGain();
  osc.type      = type;
  osc.frequency.value = freq;
  env.gain.setValueAtTime(startVol, c.currentTime + startTime);
  env.gain.linearRampToValueAtTime(endVol, c.currentTime + startTime + duration);
  osc.connect(env);
  env.connect(dest ?? sfxGain ?? c.destination);
  osc.start(c.currentTime + startTime);
  osc.stop(c.currentTime  + startTime + duration + 0.01);
}

// ═══════════════════════════════════════════════════════════════════════════════
//  SOUND EFFECTS
// ═══════════════════════════════════════════════════════════════════════════════

/** Short bright "ping" when collecting a coin */
export function playCoinSfx(): void {
  if (!sfxEnabled) return;
  playTone(880, 'sine',   0.4, 0,    0.08);
  playTone(1320,'sine',   0.3, 0,    0.1,  0.05);
}

/** Springy "boing" on jump */
export function playJumpSfx(): void {
  if (!sfxEnabled) return;
  const c = getCtx();
  const osc = c.createOscillator();
  const env = c.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(220, c.currentTime);
  osc.frequency.linearRampToValueAtTime(440, c.currentTime + 0.12);
  env.gain.setValueAtTime(0.3, c.currentTime);
  env.gain.linearRampToValueAtTime(0,   c.currentTime + 0.18);
  osc.connect(env); env.connect(sfxGain ?? c.destination);
  osc.start(); osc.stop(c.currentTime + 0.2);
}

/** Crunchy "thud" on crash */
export function playCrashSfx(): void {
  if (!sfxEnabled) return;
  const c = getCtx();
  // Noise burst
  const buf  = c.createBuffer(1, c.sampleRate * 0.4, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src  = c.createBufferSource();
  src.buffer = buf;
  const env  = c.createGain();
  env.gain.setValueAtTime(0.6, c.currentTime);
  env.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.4);
  // Low thud tone underneath
  const low  = c.createOscillator();
  low.type = 'sine'; low.frequency.value = 60;
  const lowEnv = c.createGain();
  lowEnv.gain.setValueAtTime(0.5, c.currentTime);
  lowEnv.gain.linearRampToValueAtTime(0, c.currentTime + 0.25);
  low.connect(lowEnv); lowEnv.connect(sfxGain ?? c.destination);
  src.connect(env); env.connect(sfxGain ?? c.destination);
  src.start(); low.start(); low.stop(c.currentTime + 0.3);
}

/** Whoosh when switching lanes */
export function playLaneSfx(): void {
  if (!sfxEnabled) return;
  const c = getCtx();
  const osc = c.createOscillator(); const env = c.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(300, c.currentTime);
  osc.frequency.linearRampToValueAtTime(180, c.currentTime + 0.08);
  env.gain.setValueAtTime(0.08, c.currentTime);
  env.gain.linearRampToValueAtTime(0, c.currentTime + 0.08);
  osc.connect(env); env.connect(sfxGain ?? c.destination);
  osc.start(); osc.stop(c.currentTime + 0.1);
}

// ═══════════════════════════════════════════════════════════════════════════════
//  PROCEDURAL BACKGROUND MUSIC
//  An 8-bar looping chiptune loop — C major pentatonic, upbeat tempo.
// ═══════════════════════════════════════════════════════════════════════════════

const BPM    = 128;
const BEAT   = 60 / BPM;        // seconds per beat
const BAR    = BEAT * 4;        // seconds per bar

// C major pentatonic scale frequencies (two octaves)
const PENTA = [261.63, 293.66, 329.63, 392.00, 440.00, 523.25, 587.33, 659.25, 784.00];

// Melody: sequence of [scale-index, beats, volume]
const MELODY: [number, number, number][] = [
  [4,0.5,0.4],[4,0.5,0.35],[5,0.5,0.4],[4,1,0.45],
  [3,0.5,0.35],[4,0.5,0.4],[2,1,0.3],
  [4,0.5,0.45],[5,0.5,0.4],[6,0.5,0.45],[5,1,0.5],
  [4,0.5,0.35],[3,0.5,0.3],[2,2,0.25],
  [2,0.5,0.3],[3,0.5,0.35],[4,0.5,0.4],[5,1,0.45],
  [4,0.5,0.4],[3,0.5,0.35],[2,1,0.3],
  [5,0.5,0.45],[6,0.5,0.5],[7,0.5,0.5],[6,0.5,0.45],
  [5,0.5,0.4],[4,0.5,0.35],[3,2,0.3],
];

// Bass pattern: alternating root / fifth
const BASS: [number, number][] = [
  [0,1],[2,1],[0,1],[3,1], [0,1],[2,1],[1,1],[3,1],
];

function scheduleLoop(startTime: number): void {
  const c = getCtx(); if (!musicGain) return;

  // ── Melody (lead sine) ──
  let t = startTime;
  for (const [idx, beats, vol] of MELODY) {
    const freq = PENTA[idx];
    const dur  = beats * BEAT * 0.85;
    const osc  = c.createOscillator(); const env = c.createGain();
    osc.type = 'square'; osc.frequency.value = freq;
    env.gain.setValueAtTime(vol * 0.5, t);
    env.gain.linearRampToValueAtTime(vol * 0.5, t + dur * 0.7);
    env.gain.linearRampToValueAtTime(0, t + dur);
    osc.connect(env); env.connect(musicGain);
    osc.start(t); osc.stop(t + dur);
    musicNodes.push(osc, env);
    t += beats * BEAT;
  }

  const loopLen = t - startTime;

  // ── Bass (sub sine, one octave down) ──
  let bt = startTime;
  for (const [idx, beats] of BASS) {
    const freq = PENTA[idx] * 0.5;
    const dur  = beats * BEAT * 0.9;
    const osc  = c.createOscillator(); const env = c.createGain();
    osc.type = 'sine'; osc.frequency.value = freq;
    env.gain.setValueAtTime(0.25, bt);
    env.gain.linearRampToValueAtTime(0, bt + dur);
    osc.connect(env); env.connect(musicGain);
    osc.start(bt); osc.stop(bt + dur);
    musicNodes.push(osc, env);
    bt += beats * BEAT;
    if (bt >= startTime + loopLen) break;
  }

  // ── Hi-hat percussion (noise with tight envelope) ──
  for (let i = 0; i < loopLen / (BEAT * 0.5); i++) {
    const ht = startTime + i * BEAT * 0.5;
    const vol = i % 2 === 0 ? 0.12 : 0.06;
    const buf  = c.createBuffer(1, Math.floor(c.sampleRate * 0.03), c.sampleRate);
    const data = buf.getChannelData(0);
    for (let j = 0; j < data.length; j++) data[j] = (Math.random() * 2 - 1) * 0.3;
    const src  = c.createBufferSource(); src.buffer = buf;
    const env  = c.createGain();
    env.gain.setValueAtTime(vol, ht);
    env.gain.linearRampToValueAtTime(0, ht + 0.03);
    src.connect(env); env.connect(musicGain);
    src.start(ht);
    musicNodes.push(src, env);
  }

  // ── Kick drum (low thud on beats 1 and 3) ──
  for (let i = 0; i < loopLen / BAR; i++) {
    [0, 2].forEach(beat => {
      const kt = startTime + i * BAR + beat * BEAT;
      const osc = c.createOscillator(); const env = c.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(150, kt);
      osc.frequency.linearRampToValueAtTime(50, kt + 0.1);
      env.gain.setValueAtTime(0.4, kt);
      env.gain.linearRampToValueAtTime(0, kt + 0.15);
      osc.connect(env); env.connect(musicGain);
      osc.start(kt); osc.stop(kt + 0.2);
      musicNodes.push(osc, env);
    });
  }

  // Schedule next loop slightly before this one ends
  setTimeout(() => { if (musicPlaying) scheduleLoop(startTime + loopLen); }, (loopLen - 0.5) * 1000);
}

export function startMusic(): void {
  if (musicPlaying) return;
  musicPlaying = true;
  musicNodes = [];
  scheduleLoop(getCtx().currentTime + 0.1);
}

export function stopMusic(): void {
  musicPlaying = false;
  musicNodes.forEach(n => { try { (n as OscillatorNode).stop?.(); } catch (_) {} });
  musicNodes = [];
}

export function toggleSfx(): boolean {
  sfxEnabled = !sfxEnabled; return sfxEnabled;
}

export function toggleMusic(): boolean {
  if (musicPlaying) stopMusic(); else startMusic();
  return musicPlaying;
}
