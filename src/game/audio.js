export function beep({ freq = 440, dur = 0.08, type = 'square', vol = 0.12, slide = 0, delay = 0 } = {}) {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    beep.ctx ||= new AC();
    const ctx = beep.ctx;
    if (ctx.state === 'suspended') ctx.resume();
    const t0 = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g).connect(ctx.destination);
    o.start(t0);
    o.stop(t0 + dur);
  } catch { /* 무시 */ }
}

function noise({ dur = 0.15, vol = 0.2, delay = 0, low = 400 } = {}) {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    beep.ctx ||= new AC();
    const ctx = beep.ctx;
    if (ctx.state === 'suspended') ctx.resume();
    const t0 = ctx.currentTime + delay;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = low;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(f).connect(g).connect(ctx.destination);
    src.start(t0);
  } catch { /* 무시 */ }
}

export const sfx = {
  punch: () => { noise({ dur: 0.08, vol: 0.25, low: 900 }); beep({ freq: 170, dur: 0.07, slide: -70 }); },
  kick: () => { noise({ dur: 0.1, vol: 0.28, low: 700 }); beep({ freq: 120, dur: 0.1, slide: -50 }); },
  heavy: () => { noise({ dur: 0.16, vol: 0.35, low: 500 }); beep({ freq: 90, dur: 0.16, slide: -40 }); },
  block: () => beep({ freq: 520, dur: 0.05, type: 'triangle', vol: 0.1 }),
  launch: () => { beep({ freq: 200, dur: 0.2, type: 'sawtooth', slide: 300 }); noise({ dur: 0.12, vol: 0.2, low: 1200 }); },
  screw: () => { beep({ freq: 800, dur: 0.18, type: 'sawtooth', slide: -500 }); },
  electric: () => { noise({ dur: 0.2, vol: 0.3, low: 3000 }); beep({ freq: 1500, dur: 0.12, type: 'sawtooth', slide: -1100 }); },
  throw: () => { noise({ dur: 0.2, vol: 0.35, low: 400 }); beep({ freq: 80, dur: 0.2, slide: -30 }); },
  rage: () => { beep({ freq: 110, dur: 0.5, type: 'sawtooth', slide: 220, vol: 0.2 }); noise({ dur: 0.4, vol: 0.25, low: 800 }); },
  round: () => beep({ freq: 660, dur: 0.12, type: 'sine' }),
  fight: () => { beep({ freq: 220, dur: 0.3, type: 'sawtooth', vol: 0.2 }); beep({ freq: 440, dur: 0.3, type: 'sawtooth', vol: 0.15, delay: 0.05 }); noise({ dur: 0.25, vol: 0.2, low: 600 }); },
  ko: () => { noise({ dur: 0.5, vol: 0.35, low: 500 }); beep({ freq: 300, dur: 0.45, type: 'sawtooth', slide: -220, vol: 0.2 }); },
  win: () => { [523, 659, 784, 1046].forEach((f, i) => beep({ freq: f, dur: 0.18, type: 'square', vol: 0.1, delay: i * 0.12 })); },
  select: () => beep({ freq: 880, dur: 0.06, type: 'square', vol: 0.1 }),
  confirm: () => { beep({ freq: 660, dur: 0.08, type: 'square', vol: 0.12 }); beep({ freq: 990, dur: 0.12, type: 'square', vol: 0.12, delay: 0.08 }); },
  cancel: () => beep({ freq: 330, dur: 0.1, type: 'square', vol: 0.1 }),
};
