// The site's audio engine. One AudioContext, one master fader, and a
// small voice pool, shared by everything that makes sound on the site.
//
// Rules of the house:
//   - silent until the visitor turns sound on, and the choice persists
//   - every voice passes through the master fader, so off means off
//   - nothing sounds on its own: no bed, no drone, strikes only
//   - the voices are Daniel's recorded FirstObjects notes (a spread
//     D major 13 sharp 11 ladder with round robins). Until the bank
//     finishes loading, a soft synth understudy holds the part.

import { SAMPLE_BANK } from './sample-bank.js';

const KEY = 'diplomacy-sound';
const MAX_VOICES = 32;

export const PITCH_COUNT = SAMPLE_BANK.length;

const state = {
  context: null,
  master: null,
  pingBus: null,
  on: false,
  voices: [],
  bank: null,        // per pitch: { buffers: [], rr: 0 }, once decoded
  bankLoading: false,
};

function buildGraph() {
  const context = new AudioContext();
  const master = context.createGain();
  master.gain.value = 1;
  master.connect(context.destination);

  // strike bus: dry plus a quiet feedback echo, shared by all voices
  const pingBus = context.createGain();
  pingBus.gain.value = 1;
  pingBus.connect(master);

  const echo = context.createDelay(1);
  echo.delayTime.value = 0.28;
  const feedback = context.createGain();
  feedback.gain.value = 0.3;
  const wet = context.createGain();
  wet.gain.value = 0.22;
  pingBus.connect(echo);
  echo.connect(feedback).connect(echo);
  echo.connect(wet).connect(master);

  state.context = context;
  state.master = master;
  state.pingBus = pingBus;
}

async function loadBank() {
  if (state.bankLoading || state.bank) return;
  state.bankLoading = true;
  const loaded = [];
  await Promise.all(
    SAMPLE_BANK.map(async (pitch, index) => {
      const buffers = [];
      for (const url of pitch.files) {
        try {
          const response = await fetch(url);
          const bytes = await response.arrayBuffer();
          buffers.push(await state.context.decodeAudioData(bytes));
        } catch {
          // a missing take just shortens the round robin
        }
      }
      loaded[index] = { buffers, rr: 0 };
    })
  );
  state.bank = loaded;
}

// The synth understudy: a clear sine pluck at the pitch's frequency,
// used only before the recorded bank has arrived.
function synthVoice(context, t0, freq) {
  const out = context.createGain();
  for (const [ratio, level] of [[1, 1], [1.5, 0.25]]) {
    const osc = context.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq * ratio;
    const env = context.createGain();
    env.gain.setValueAtTime(0, t0);
    env.gain.linearRampToValueAtTime(level, t0 + 0.012);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.8);
    osc.connect(env).connect(out);
    osc.start(t0);
    osc.stop(t0 + 1.9);
  }
  return { out, stopAt: t0 + 1.9 };
}

export const engine = {
  isOn() {
    return state.on;
  },

  // Browsers keep audio asleep until the visitor's first gesture.
  // Sound is on by default, so the first touch anywhere wakes it.
  wake() {
    if (state.on && state.context) state.context.resume();
  },

  savedChoice() {
    try {
      return localStorage.getItem(KEY);
    } catch {
      return null;
    }
  },

  setOn(on) {
    state.on = on;
    try {
      localStorage.setItem(KEY, on ? 'on' : 'off');
    } catch {
      // private browsing, the choice just will not persist
    }

    if (on) {
      if (!state.context) buildGraph();
      state.context.resume();
      loadBank();
      const now = state.context.currentTime;
      state.master.gain.cancelScheduledValues(now);
      state.master.gain.linearRampToValueAtTime(1, now + 0.2);
    } else if (state.context) {
      // fade the master so even ringing tails go quiet
      const now = state.context.currentTime;
      state.master.gain.cancelScheduledValues(now);
      state.master.gain.linearRampToValueAtTime(0, now + 0.5);
    }
  },

  // Begin a swell: the pitch blooms in slowly, the sound of leaning
  // close to something resonant. Returns a handle for swellEnd.
  swellStart({ pitch = 0, pan = 0, peak = 0.3 } = {}) {
    if (!state.on || !state.context) return null;

    const context = state.context;
    const now = context.currentTime;
    const index = Math.max(0, Math.min(PITCH_COUNT - 1, pitch));

    while (state.voices.length >= MAX_VOICES) {
      const oldest = state.voices.shift();
      oldest.level.gain.cancelScheduledValues(now);
      oldest.level.gain.setValueAtTime(oldest.level.gain.value, now);
      oldest.level.gain.linearRampToValueAtTime(0, now + 0.05);
      setTimeout(() => oldest.level.disconnect(), 120);
    }

    const level = context.createGain();
    level.gain.setValueAtTime(0, now);
    level.gain.linearRampToValueAtTime(peak, now + 1.6); // the slow attack
    const panner = context.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, pan));
    level.connect(panner).connect(state.pingBus);

    const slot = state.bank && state.bank[index];
    if (slot && slot.buffers.length) {
      const buffer = slot.buffers[slot.rr % slot.buffers.length];
      slot.rr += 1;
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(level);
      source.start(now);
    } else {
      const built = synthVoice(context, now, SAMPLE_BANK[index].freq);
      built.out.connect(level);
    }

    const voice = { level, swell: true };
    state.voices.push(voice);
    return voice;
  },

  // Let a swell go: a gentle release, never a cut.
  swellEnd(voice) {
    if (!voice || !state.context) return;
    const now = state.context.currentTime;
    voice.level.gain.cancelScheduledValues(now);
    voice.level.gain.setValueAtTime(voice.level.gain.value, now);
    voice.level.gain.linearRampToValueAtTime(0, now + 0.7);
    setTimeout(() => {
      const at = state.voices.indexOf(voice);
      if (at !== -1) state.voices.splice(at, 1);
      voice.level.disconnect();
    }, 800);
  },

  // Strike one note of the ladder.
  //   pitch: index into the FirstObjects ladder, 0 low to PITCH_COUNT - 1 high
  //   gain:  0..1
  //   pan:   -1..1, where the shape sits on screen
  //   delay: seconds before sounding, used for resonance traveling distance
  strike({ pitch = 0, gain = 0.5, pan = 0, delay = 0 } = {}) {
    if (!state.on || !state.context) return;

    const context = state.context;
    const t0 = context.currentTime + delay;

    // voice stealing: when the pool is full, the oldest voice yields
    while (state.voices.length >= MAX_VOICES) {
      const oldest = state.voices.shift();
      const now = context.currentTime;
      oldest.level.gain.cancelScheduledValues(now);
      oldest.level.gain.setValueAtTime(oldest.level.gain.value, now);
      oldest.level.gain.linearRampToValueAtTime(0, now + 0.05);
      setTimeout(() => oldest.level.disconnect(), 120);
    }
    const index = Math.max(0, Math.min(PITCH_COUNT - 1, pitch));

    const level = context.createGain();
    level.gain.value = Math.min(gain, 1) * 0.34;
    const panner = context.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, pan));
    level.connect(panner).connect(state.pingBus);

    let stopAt;
    const slot = state.bank && state.bank[index];
    if (slot && slot.buffers.length) {
      const buffer = slot.buffers[slot.rr % slot.buffers.length];
      slot.rr += 1;
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(level);
      source.start(t0);
      stopAt = t0 + buffer.duration;
    } else {
      const built = synthVoice(context, t0, SAMPLE_BANK[index].freq);
      built.out.connect(level);
      // the understudy is louder per watt than the recordings
      level.gain.value *= 0.35;
      stopAt = built.stopAt;
    }

    const voice = { level };
    state.voices.push(voice);
    setTimeout(() => {
      const at = state.voices.indexOf(voice);
      if (at !== -1) {
        state.voices.splice(at, 1);
        level.disconnect();
      }
    }, (stopAt - context.currentTime) * 1000 + 100);
  },
};
