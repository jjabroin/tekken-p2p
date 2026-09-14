export function beep({ freq = 440, dur = 0.08, type = 'square', vol = 0.15, slide = 0 } = {}) {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    beep.ctx ||= new AC();
    const ctx = beep.ctx;
    if (ctx.state === 'suspended') ctx.resume();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, ctx.currentTime);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), ctx.currentTime + dur);
    g.gain.setValueAtTime(vol, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + dur);
  } catch { /* 무시 */ }
}

export const sfx = {
  punch: () => beep({ freq: 180, dur: 0.09, slide: -80 }),
  kick: () => beep({ freq: 130, dur: 0.12, slide: -60 }),
  special: () => { beep({ freq: 220, dur: 0.25, type: 'sawtooth', slide: 440 }); },
  block: () => beep({ freq: 500, dur: 0.06, type: 'triangle' }),
  ko: () => { beep({ freq: 300, dur: 0.4, type: 'sawtooth', slide: -220 }); },
  round: () => beep({ freq: 660, dur: 0.15, type: 'sine' }),
};
