// Valikkomusiikki: vauhdikas retrokappale (chiptune/synthwave), syntetisoitu Web Audio API:lla.
// Oma sävellys a-mollissa, 150 iskua minuutissa, 32 tahtia:
//   A  (tahdit 1–8)   intro: basso ja hi-hat, sitten rummut ja arpeggio      Am F C G ×2
//   B  (9–16)         melodia                                                Am F C G | Am F G E
//   C  (17–24)        nouseva väliosa                                        Dm Am F E ×2
//   B' (25–32)        melodia uudelleen täydellä taustalla
// Kappale kiertää alusta, mutta toisella kierroksella introsta jätetään hiljainen alku pois.
//
// Ajastus: setInterval katsoo 0,2 s eteenpäin ja ajastaa nuotit äänikontekstin kelloon,
// joten tempo pysyy tasaisena, vaikka pääsäie olisi hetken kiireinen.

const BPM = 150;
const STEP = 60 / BPM / 4;     // kuudestoistaosa (s)
const BARS = 32;
const LOOP_BAR = 4;            // toisella kierroksella aloitetaan tästä tahdista
const VOLUME = 0.42;

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

// Soinnut: arpeggion sävelet, matalampi taustamatto ja basson pohjasävel
const CHORDS = {
  Am: { arp: [69, 72, 76], pad: [57, 60, 64], bass: 45 },
  F: { arp: [65, 69, 72], pad: [57, 60, 65], bass: 41 },
  C: { arp: [67, 72, 76], pad: [55, 60, 64], bass: 48 },
  G: { arp: [67, 71, 74], pad: [55, 59, 62], bass: 43 },
  E: { arp: [68, 71, 76], pad: [56, 59, 64], bass: 40 },
  Dm: { arp: [69, 74, 77], pad: [57, 62, 65], bass: 38 },
};

const SONG = [
  'Am', 'F', 'C', 'G', 'Am', 'F', 'C', 'G',     // A
  'Am', 'F', 'C', 'G', 'Am', 'F', 'G', 'E',     // B
  'Dm', 'Am', 'F', 'E', 'Dm', 'Am', 'F', 'E',   // C
  'Am', 'F', 'C', 'G', 'Am', 'F', 'G', 'E',     // B'
];

// Melodiat tahdeittain: [kuudestoistaosa, MIDI-sävel, pituus kuudestoistaosina]
const MELODY_B = [
  [[0, 76, 3], [3, 81, 3], [6, 76, 2], [8, 74, 2], [10, 72, 2], [12, 74, 4]],
  [[0, 72, 3], [3, 77, 3], [6, 72, 2], [8, 69, 2], [10, 72, 2], [12, 77, 4]],
  [[0, 79, 3], [3, 76, 3], [6, 72, 2], [8, 76, 2], [10, 79, 2], [12, 84, 4]],
  [[0, 83, 4], [4, 81, 2], [6, 79, 2], [8, 74, 4], [12, 71, 2], [14, 74, 2]],
  [[0, 76, 3], [3, 81, 3], [6, 83, 2], [8, 84, 4], [12, 83, 2], [14, 81, 2]],
  [[0, 81, 3], [3, 79, 3], [6, 77, 2], [8, 76, 2], [10, 77, 2], [12, 81, 4]],
  [[0, 79, 3], [3, 77, 3], [6, 74, 2], [8, 71, 2], [10, 74, 2], [12, 79, 4]],
  [[0, 80, 4], [4, 83, 4], [8, 88, 6]],
];
const MELODY_C = [
  [[0, 86, 2], [2, 81, 2], [4, 77, 2], [6, 86, 2], [8, 84, 2], [10, 81, 2], [12, 77, 2], [14, 81, 2]],
  [[0, 84, 2], [2, 81, 2], [4, 76, 2], [6, 84, 2], [8, 83, 2], [10, 81, 2], [12, 76, 2], [14, 81, 2]],
  [[0, 81, 2], [2, 77, 2], [4, 72, 2], [6, 81, 2], [8, 79, 2], [10, 77, 2], [12, 72, 2], [14, 77, 2]],
  [[0, 80, 2], [2, 76, 2], [4, 71, 2], [6, 80, 2], [8, 83, 4], [12, 88, 4]],
];

/** Mitä soitetaan missäkin tahdissa. */
function melodyFor(bar) {
  if (bar >= 8 && bar < 16) return MELODY_B[bar - 8];
  if (bar >= 16 && bar < 24) return MELODY_C[(bar - 16) % 4];
  if (bar >= 24) return MELODY_B[bar - 24];
  return null;
}

export class MenuMusic {
  constructor(ctx, dest) {
    this.ctx = ctx;
    this.playing = false;
    this.timer = null;

    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.out.connect(dest);
    // Sidechain-pumppaus: basso, matto ja arpeggio painuvat hetkeksi jokaisella bassorummulla
    this.duck = ctx.createGain();
    this.duck.connect(this.out);
    // Kaiku melodialle (pisteellinen kahdeksasosa)
    this.delay = ctx.createDelay(1);
    this.delay.delayTime.value = STEP * 3;
    const fb = ctx.createGain();
    fb.gain.value = 0.32;
    const dl = ctx.createBiquadFilter();
    dl.type = 'lowpass';
    dl.frequency.value = 2600;
    this.delay.connect(dl);
    dl.connect(fb);
    fb.connect(this.delay);
    this.wet = ctx.createGain();
    this.wet.gain.value = 0.24;
    dl.connect(this.wet);
    this.wet.connect(this.out);

    // Kohina rummuille ja 25 %:n pulssiaalto arpeggiolle (klassinen chiptune-sointi)
    const sr = ctx.sampleRate;
    this.noise = ctx.createBuffer(1, sr, sr);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const N = 32;
    const real = new Float32Array(N), imag = new Float32Array(N);
    for (let k = 1; k < N; k++) imag[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * 0.25);
    this.pulse = ctx.createPeriodicWave(real, imag);
  }

  start() {
    if (this.playing) return;
    this.playing = true;
    const t = this.ctx.currentTime;
    this.step = 0;
    this.nextTime = t + 0.08;
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setTargetAtTime(VOLUME, t, 0.25);
    clearInterval(this.timer);
    this.timer = setInterval(() => this.schedule(), 25);
    this.schedule();
  }

  stop() {
    if (!this.playing) return;
    this.playing = false;
    const t = this.ctx.currentTime;
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setTargetAtTime(0, t, 0.12);
    clearInterval(this.timer);
    this.timer = null;
  }

  /** Ajastaa nuotit seuraavan 0,2 sekunnin ajalta. */
  schedule() {
    const now = this.ctx.currentTime;
    // Jos pääsäie on ollut jumissa (radan rakennus, taustavälilehti), hypätään ajassa eteenpäin
    // eikä soiteta väliin jääneitä nuotteja kerralla.
    if (this.nextTime < now - 0.05) {
      const missed = Math.ceil((now - this.nextTime) / STEP);
      this.advance(missed);
      this.nextTime += missed * STEP;
    }
    while (this.nextTime < now + 0.2) {
      this.playStep(this.step, this.nextTime);
      this.advance(1);
      this.nextTime += STEP;
    }
  }

  advance(n) {
    this.step += n;
    while (this.step >= BARS * 16) this.step -= (BARS - LOOP_BAR) * 16;
  }

  playStep(step, t) {
    const bar = Math.floor(step / 16);
    const s = step % 16;
    const chord = CHORDS[SONG[bar]];
    const sectionStart = bar % 8 === 0;
    const fillBar = bar % 8 === 7;
    const full = bar >= 4;

    // --- Rummut ---
    if (s === 0 && sectionStart && bar >= 4) this.crash(t);
    const kickOn = bar >= 2 && (s % 4 === 0 || (bar >= 16 && bar < 24 && s === 14) || (fillBar && s === 10));
    if (kickOn) this.kick(t);
    if (full) {
      if (s === 4 || s === 12) this.snare(t, 1);
      if (fillBar && s >= 13) this.snare(t, 0.55 + (s - 13) * 0.2);
      if (s % 4 === 2) this.hat(t, true);
    }
    if (s % 2 === 1 || (!full && s % 4 === 2)) this.hat(t, false);

    // --- Basso: oktaavia pumppaava kahdeksasosakomppi ---
    if (s % 2 === 0) {
      const up = s % 4 === 2;
      this.bass(t, chord.bass + (up ? 12 : 0), STEP * 1.7);
    }

    // --- Taustamatto tahdin alussa (melodiaosissa) ---
    if (s === 0 && bar >= 8) this.pad(t, chord.pad, STEP * 16);

    // --- Arpeggio: soinnun sävelet kuudestoistaosina ylös ja alas ---
    if (bar >= 4) {
      const seq = [0, 1, 2, 1];
      const lift = bar >= 16 && bar < 24 ? 12 : 0;
      const note = chord.arp[seq[s % 4]] + (s % 8 >= 4 ? 12 : 0) + lift - 12;
      this.arp(t, note, bar >= 8 ? 0.035 : 0.055);
    }

    // --- Melodia ---
    const mel = melodyFor(bar);
    if (mel) for (const [ms, note, len] of mel) if (ms === s) this.lead(t, note, len * STEP);
  }

  // ------------------------------------------------------------- Soittimet

  env(t, peak, attack, decay, dest) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    g.connect(dest);
    return g;
  }

  noiseHit(t, type, freq, q, peak, decay, dest = this.out) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    src.connect(f);
    f.connect(this.env(t, peak, 0.002, decay, dest));
    src.start(t, Math.random() * 0.5);
    src.stop(t + decay + 0.05);
  }

  kick(t) {
    const o = this.ctx.createOscillator();
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    o.connect(this.env(t, 0.9, 0.003, 0.26, this.out));
    o.start(t);
    o.stop(t + 0.3);
    this.noiseHit(t, 'highpass', 3000, 0.7, 0.12, 0.015);
    // Pumppaus
    const g = this.duck.gain;
    g.setValueAtTime(0.4, t);
    g.linearRampToValueAtTime(1, t + 0.2);
  }

  snare(t, v) {
    this.noiseHit(t, 'bandpass', 1900, 0.8, 0.32 * v, 0.15);
    this.noiseHit(t, 'highpass', 5000, 0.7, 0.12 * v, 0.08);
    const o = this.ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(200, t);
    o.frequency.exponentialRampToValueAtTime(150, t + 0.08);
    o.connect(this.env(t, 0.22 * v, 0.002, 0.09, this.out));
    o.start(t);
    o.stop(t + 0.12);
  }

  hat(t, open) {
    this.noiseHit(t, 'highpass', 7500, 0.8, open ? 0.08 : 0.06, open ? 0.13 : 0.03);
  }

  crash(t) {
    this.noiseHit(t, 'highpass', 4200, 0.6, 0.16, 1.5);
  }

  bass(t, midi, dur) {
    const ctx = this.ctx;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 7;
    f.frequency.setValueAtTime(1500, t);
    f.frequency.exponentialRampToValueAtTime(260, t + dur);
    f.connect(this.env(t, 0.32, 0.004, dur, this.duck));
    for (const [type, mult] of [['sawtooth', 1], ['square', 0.5]]) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = mtof(midi) * mult;
      o.connect(f);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
  }

  arp(t, midi, peak) {
    const o = this.ctx.createOscillator();
    o.setPeriodicWave(this.pulse);
    o.frequency.value = mtof(midi);
    o.connect(this.env(t, peak, 0.003, 0.09, this.duck));
    o.start(t);
    o.stop(t + 0.12);
  }

  pad(t, notes, dur) {
    const ctx = this.ctx;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 1100;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.05, t + 0.15);
    g.gain.setValueAtTime(0.05, t + dur - 0.2);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    f.connect(g);
    g.connect(this.duck);
    for (const n of notes) {
      for (const det of [-7, 7]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = mtof(n);
        o.detune.value = det;
        o.connect(f);
        o.start(t);
        o.stop(t + dur + 0.05);
      }
    }
  }

  lead(t, midi, dur) {
    const ctx = this.ctx;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 2.5;
    f.frequency.setValueAtTime(4200, t);
    f.frequency.exponentialRampToValueAtTime(2000, t + 0.18);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.11, t + 0.12);
    g.gain.setValueAtTime(0.11, t + Math.max(0.12, dur - 0.03));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.09);
    f.connect(g);
    g.connect(this.out);
    g.connect(this.delay);
    // Vibrato pitkiin säveliin
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 5.8;
    const depth = ctx.createGain();
    depth.gain.setValueAtTime(0, t);
    depth.gain.linearRampToValueAtTime(dur > 0.3 ? 14 : 0, t + Math.min(0.3, dur));
    lfo.connect(depth);
    lfo.start(t);
    lfo.stop(t + dur + 0.12);
    for (const [type, det] of [['square', 0], ['sawtooth', 9]]) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = mtof(midi);
      o.detune.value = det;
      depth.connect(o.detune);
      o.connect(f);
      o.start(t);
      o.stop(t + dur + 0.12);
    }
  }
}
