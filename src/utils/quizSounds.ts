/**
 * Quiz Sound Effects — Web Audio API synthesizer
 * Generates game music, countdown ticks, and victory fanfares
 * No external MP3 files needed.
 */

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioCtx || audioCtx.state === 'closed') {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

// ─── GAME BACKGROUND MUSIC ───
// A looping upbeat electronic groove

let gameMusicNodes: { osc: OscillatorNode[]; gain: GainNode; interval?: ReturnType<typeof setInterval> } | null = null;
let masterAudioConfig = { volume: 0.12, muted: false };

export function setMusicVolume(vol: number) {
  masterAudioConfig.volume = Math.max(0, Math.min(1, vol));
  if (gameMusicNodes && gameMusicNodes.gain) {
    gameMusicNodes.gain.gain.setValueAtTime(
      masterAudioConfig.muted ? 0 : masterAudioConfig.volume, 
      getAudioContext().currentTime
    );
  }
}

export function toggleMusicMute() {
  masterAudioConfig.muted = !masterAudioConfig.muted;
  if (gameMusicNodes && gameMusicNodes.gain) {
    gameMusicNodes.gain.gain.setValueAtTime(
      masterAudioConfig.muted ? 0 : masterAudioConfig.volume, 
      getAudioContext().currentTime
    );
  }
  return masterAudioConfig.muted;
}

export function playGameMusic() {
  stopGameMusic();
  try {
    const ctx = getAudioContext();
    const masterGain = ctx.createGain();
    masterGain.gain.value = masterAudioConfig.muted ? 0 : masterAudioConfig.volume;
    masterGain.connect(ctx.destination);

    const oscillators: OscillatorNode[] = [];

    // Choose one of 3 random themes for variety
    const themes = [
      {
        bassFreq: 110, padFreqs: [220, 277.18, 329.63], 
        bassNotes: [110, 130.81, 146.83, 164.81, 146.83, 130.81],
        oscType: 'sawtooth' as OscillatorType, tempo: 350
      },
      { // Intense techno pulse
        bassFreq: 55, padFreqs: [164.81, 196.00, 246.94], // E minor
        bassNotes: [82.41, 82.41, 98.00, 82.41, 110.00, 98.00],
        oscType: 'square' as OscillatorType, tempo: 200
      },
      { // Funky groove
        bassFreq: 130.81, padFreqs: [261.63, 329.63, 392.00], // C major
        bassNotes: [130.81, 65.41, 155.56, 130.81, 196.00, 130.81],
        oscType: 'triangle' as OscillatorType, tempo: 280
      }
    ];

    const theme = themes[Math.floor(Math.random() * themes.length)];

    // bass line pattern
    const bassGain = ctx.createGain();
    bassGain.gain.value = 0.6;
    bassGain.connect(masterGain);

    const bassFilter = ctx.createBiquadFilter();
    bassFilter.type = 'lowpass';
    bassFilter.frequency.value = theme.oscType === 'triangle' ? 800 : 400;
    bassFilter.connect(bassGain);

    const bassOsc = ctx.createOscillator();
    bassOsc.type = theme.oscType;
    bassOsc.frequency.value = theme.bassFreq;
    bassOsc.connect(bassFilter);
    bassOsc.start();
    oscillators.push(bassOsc);

    // pad chord
    const padGain = ctx.createGain();
    padGain.gain.value = 0.15;
    padGain.connect(masterGain);

    const padFilter = ctx.createBiquadFilter();
    padFilter.type = 'lowpass';
    padFilter.frequency.value = 1200;
    padFilter.connect(padGain);

    theme.padFreqs.forEach(freq => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      osc.connect(padFilter);
      osc.start();
      oscillators.push(osc);
    });

    // rhythmic arpeggiation
    let noteIndex = 0;
    const interval = setInterval(() => {
      if (bassOsc && bassOsc.frequency) {
        bassOsc.frequency.setValueAtTime(theme.bassNotes[noteIndex % theme.bassNotes.length], ctx.currentTime);
        noteIndex++;
      }
    }, theme.tempo);

    gameMusicNodes = { osc: oscillators, gain: masterGain, interval };
  } catch (e) {
    console.warn('Game music playback error:', e);
  }
}

export function stopGameMusic() {
  if (gameMusicNodes) {
    if (gameMusicNodes.interval) clearInterval(gameMusicNodes.interval);
    gameMusicNodes.osc.forEach(o => { try { o.stop(); } catch {} });
    try { gameMusicNodes.gain.disconnect(); } catch {}
    gameMusicNodes = null;
  }
}

// ─── COUNTDOWN TICK (last 5 seconds) ───

export function playCountdownTick() {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    // Click / tick sound
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    gain.connect(ctx.destination);

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(440, now + 0.08);
    osc.connect(gain);
    osc.start(now);
    osc.stop(now + 0.15);

    // Secondary click for a "wooden" feel
    const gain2 = ctx.createGain();
    gain2.gain.setValueAtTime(0.25, now);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
    gain2.connect(ctx.destination);

    const osc2 = ctx.createOscillator();
    osc2.type = 'square';
    osc2.frequency.setValueAtTime(1760, now);
    osc2.frequency.exponentialRampToValueAtTime(880, now + 0.04);
    osc2.connect(gain2);
    osc2.start(now);
    osc2.stop(now + 0.06);
  } catch (e) {
    console.warn('Countdown tick error:', e);
  }
}

// ─── DRAMATIC FINAL TICK (last 3 seconds, tension build) ───

export function playDramaticTick(secondsLeft: number) {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    const intensity = Math.max(0.3, 1 - secondsLeft * 0.15);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(intensity * 0.5, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    gain.connect(ctx.destination);

    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(660 + (5 - secondsLeft) * 100, now);
    osc.frequency.exponentialRampToValueAtTime(330, now + 0.2);
    osc.connect(gain);
    osc.start(now);
    osc.stop(now + 0.25);

    // Sub-bass thump
    const subGain = ctx.createGain();
    subGain.gain.setValueAtTime(intensity * 0.3, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    subGain.connect(ctx.destination);

    const subOsc = ctx.createOscillator();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(100, now);
    subOsc.frequency.exponentialRampToValueAtTime(50, now + 0.15);
    subOsc.connect(subGain);
    subOsc.start(now);
    subOsc.stop(now + 0.18);
  } catch (e) {
    console.warn('Dramatic tick error:', e);
  }
}

// ─── VICTORY FANFARE ───

export function playVictoryFanfare() {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    const masterGain = ctx.createGain();
    masterGain.gain.value = 0.25;
    masterGain.connect(ctx.destination);

    // Triumphant arpeggio
    const notes = [
      { freq: 523.25, time: 0, dur: 0.2 },    // C5
      { freq: 659.25, time: 0.15, dur: 0.2 },  // E5
      { freq: 783.99, time: 0.3, dur: 0.2 },   // G5
      { freq: 1046.5, time: 0.45, dur: 0.6 },   // C6 (hold)
      { freq: 987.77, time: 0.7, dur: 0.15 },   // B5
      { freq: 1046.5, time: 0.85, dur: 0.8 },   // C6 (hold longer)
    ];

    notes.forEach(n => {
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.001, now + n.time);
      gain.gain.linearRampToValueAtTime(0.6, now + n.time + 0.03);
      gain.gain.linearRampToValueAtTime(0.3, now + n.time + n.dur * 0.5);
      gain.gain.exponentialRampToValueAtTime(0.001, now + n.time + n.dur);
      gain.connect(masterGain);

      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = n.freq;
      osc.connect(gain);
      osc.start(now + n.time);
      osc.stop(now + n.time + n.dur);

      // Harmonic doubling for richness
      const osc2 = ctx.createOscillator();
      osc2.type = 'sine';
      osc2.frequency.value = n.freq * 2;
      const gain2 = ctx.createGain();
      gain2.gain.setValueAtTime(0.001, now + n.time);
      gain2.gain.linearRampToValueAtTime(0.15, now + n.time + 0.03);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + n.time + n.dur);
      gain2.connect(masterGain);
      osc2.connect(gain2);
      osc2.start(now + n.time);
      osc2.stop(now + n.time + n.dur);
    });

    // Cymbal-like noise burst
    const bufferSize = ctx.sampleRate * 1.5;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'highpass';
    noiseFilter.frequency.value = 8000;
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.001, now + 0.45);
    noiseGain.gain.linearRampToValueAtTime(0.08, now + 0.5);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 1.8);
    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(masterGain);
    noise.start(now + 0.45);
    noise.stop(now + 1.8);
  } catch (e) {
    console.warn('Victory fanfare error:', e);
  }
}

// ─── TIME'S UP BUZZER ───

export function playTimesUpBuzzer() {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.linearRampToValueAtTime(0.3, now + 0.5);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
    gain.connect(ctx.destination);

    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.setValueAtTime(200, now + 0.25);
    osc.frequency.setValueAtTime(180, now + 0.5);
    osc.connect(gain);
    osc.start(now);
    osc.stop(now + 0.8);
  } catch (e) {
    console.warn('Times up buzzer error:', e);
  }
}

// ─── QUESTION TRANSITION WHOOSH ───

export function playQuestionTransition() {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.2, now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    gain.connect(ctx.destination);

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(300, now);
    osc.frequency.exponentialRampToValueAtTime(1200, now + 0.15);
    osc.frequency.exponentialRampToValueAtTime(600, now + 0.3);
    osc.connect(gain);
    osc.start(now);
    osc.stop(now + 0.3);
  } catch (e) {
    console.warn('Transition whoosh error:', e);
  }
}

export function cleanupAudio() {
  stopGameMusic();
  if (audioCtx && audioCtx.state !== 'closed') {
    audioCtx.close().catch(() => {});
    audioCtx = null;
  }
}
