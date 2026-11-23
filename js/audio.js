// Pelin äänet, kaikki syntetisoitu Web Audio API:lla (ei äänitiedostoja).
//
//   Moottori   näennäinen vaihteisto antaa kierrokset nopeudesta; ääni on sylinterien
//              sytytystahdin mukainen aaltomuoto (PeriodicWave) + särö + kuorman mukaan
//              aukeava suodatin. Autokohtainen profiili cars.js:n kohdassa sound.
//   Alusta     soran rapina (satunnaisten napsujen puskuri, jonka toistonopeus seuraa
//              vauhtia), sivuluisu, maasto, hiekan suhina ja vauhdin tuuli
//   Iskut      alastulot hypyistä ja törmäykset (session.js välittää Rapierin
//              törmäysvoimat; materiaali päätellään törmäysmuodosta)
//
// Selaimet sallivat äänen vasta käyttäjän painalluksen jälkeen: AudioContext luodaan
// ensimmäisestä näppäimen painalluksesta tai kosketuksesta.

import { MenuMusic } from './music.js';

const SAVE_KEY = 'autopeli-aani';
const MUSIC_KEY = 'autopeli-musiikki';
const MASTER = 0.8;
// Kaasu ylhäällä: true = kierrokset laskevat tyhjäkäynnille (kuin kytkin painettuna),
// false = kierrokset seuraavat vauhtia vaihteen mukaan (moottorijarrutus)
const COAST_TO_IDLE = false;

/** Oletusprofiili, jos autolla ei ole omaa (cars.js: sound). */
const DEFAULT_PROFILE = {
  cylinders: 4,
  idle: 900,          // tyhjäkäyntikierrokset
  redline: 7200,      // rajoitin
  gears: [0.24, 0.42, 0.6, 0.8, 1.0], // vaihteiden huippunopeudet (osuus auton huippunopeudesta)
  tone: 1,            // suodattimen kirkkaus (1 = normaali)
  rough: 0.2,         // epätasaisuus: tyhjäkäynnin "pöpötys" ja karheus
  volume: 1,
  turbo: 0,           // turbon vihellys ja puhallus (0–1)
  pops: 0.3,          // pakoputken pamahdukset kaasua nostettaessa (0–1)
  turboPitch: 1,      // turbon vihellyksen sävelkorkeus (iso turbo = matalampi)
  diesel: 0,          // dieselin nakutus: sytytystahdissa pulssittuva metallinen kalke (0–1)
  jake: 0,            // moottorijarru: rätisevä "brrrap" kaasu ylhäällä isoilla kierroksilla (0–1)
  airBrake: 0,        // paineilmajarrujen "pssht" pysähtyessä ja käsijarrusta (0–1)
  inertia: 1,         // kierrosten muutosnopeus (pienempi = raskas vauhtipyörä)
};

// Alustan äänet teeman mukaan
const SURFACES = {
  gravel: { crunchFreq: 1900, crunchQ: 0.9, crunch: 1, hiss: 0.12, slideFreq: 900 },
  sand: { crunchFreq: 950, crunchQ: 0.55, crunch: 0.45, hiss: 0.55, slideFreq: 600 },
};
const THEME_SURFACE = { forest: 'gravel', tuscany: 'gravel', arizona: 'gravel', desert: 'sand', tropical: 'sand', highlands: 'gravel' };

const clamp01 = (v) => Math.min(1, Math.max(0, v));

export class GameAudio {
  constructor() {
    this.ctx = null;
    this.paused = true;
    try { this.muted = localStorage.getItem(SAVE_KEY) === 'off'; } catch { this.muted = false; }
    try { this.musicEnabled = localStorage.getItem(MUSIC_KEY) !== 'off'; } catch { this.musicEnabled = true; }
    this.loading = false;
    this.profile = DEFAULT_PROFILE;
    this.surface = SURFACES.gravel;

    // Moottorin tila
    this.rpm = 900;
    this.gear = 0;
    this.load = 0;
    this.shiftTimer = 0;
    this.prevLoad = 0;
    this.stalled = false;
    this.jakeAmt = 0;
    this.prevSpd = 0;
    this.prevHandbrake = false;
    this.airCooldown = 0;
    // Hypyt
    this.airTime = 0;
    this.fallSpeed = 0;
    this.lastImpact = {};

    const unlock = () => this.unlock();
    for (const ev of ['pointerup', 'keydown', 'touchend']) addEventListener(ev, unlock, true);
    document.addEventListener('visibilitychange', () => this.applyRunning());
  }

  // ------------------------------------------------------------- Käynnistys ja mikseri

  /** Luo AudioContextin (vain käyttäjän eleestä) tai herättää sen uudelleen. */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state !== 'running' && !document.hidden) this.ctx.resume().catch(() => {});
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    // iPhone: soi myös äänettömälle kytketyllä puhelimella (pelissä on oma mykistys)
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch { /* ei tukea */ }
    this.ctx = new AC({ latencyHint: 'interactive' });
    this.build();
    this.applyProfile();
    this.applyRunning();
  }

  /** Valikko auki = pelin äänet hiljaa ja valikkomusiikki soi. */
  setPaused(paused) {
    this.paused = paused;
    if (!paused) this.loading = false;
    this.applyRunning();
  }

  /** Radan latauksen ajaksi musiikki hiljenee (pääsäie on silloin jumissa). */
  setLoading(loading) {
    this.loading = loading;
    this.applyRunning();
  }

  toggleMusic() {
    this.musicEnabled = !this.musicEnabled;
    try { localStorage.setItem(MUSIC_KEY, this.musicEnabled ? 'on' : 'off'); } catch { /* ei tallennusta */ }
    this.applyRunning();
    return this.musicEnabled;
  }

  setMuted(muted) {
    this.muted = muted;
    try { localStorage.setItem(SAVE_KEY, muted ? 'off' : 'on'); } catch { /* ei tallennusta */ }
    this.applyRunning();
  }

  toggleMuted() {
    this.setMuted(!this.muted);
    return this.muted;
  }

  applyRunning() {
    const ctx = this.ctx;
    if (!ctx) return;
    if (document.hidden) {
      ctx.suspend().catch(() => {});
      return;
    }
    if (ctx.state !== 'running') ctx.resume().catch(() => {});
    const on = !this.paused && !this.muted;
    this.master.gain.setTargetAtTime(on ? MASTER : 0, ctx.currentTime, on ? 0.15 : 0.05);
    if (this.paused && !this.muted && this.musicEnabled && !this.loading) this.music.start();
    else this.music.stop();
  }

  /** Valitun auton ääniprofiili ja radan alusta. */
  setCar(carDef, theme) {
    this.profile = { ...DEFAULT_PROFILE, ...(carDef?.sound ?? {}) };
    this.surface = SURFACES[THEME_SURFACE[theme] ?? 'gravel'];
    this.rpm = this.profile.idle;
    this.gear = 0;
    this.stalled = false;
    if (this.ctx) this.applyProfile();
  }

  build() {
    const ctx = this.ctx;
    const gain = (v, dest) => {
      const g = ctx.createGain();
      g.gain.value = v;
      if (dest) g.connect(dest);
      return g;
    };
    const filter = (type, freq, q, dest) => {
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      if (dest) f.connect(dest);
      return f;
    };
    this.gainNode = gain;
    this.filterNode = filter;

    // Pääkanava ja kompressori (estää säröytymisen isoissa rysähdyksissä)
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.knee.value = 8;
    comp.ratio.value = 5;
    comp.attack.value = 0.003;
    comp.release.value = 0.25;
    comp.connect(ctx.destination);
    this.master = gain(0, comp);
    this.music = new MenuMusic(ctx, comp);   // valikkomusiikki ohittaa pelin äänien kanavan
    this.engineBus = gain(0.7, this.master);
    this.surfaceBus = gain(0.5, this.master);
    this.fxBus = gain(1, this.master);

    this.noiseBuf = this.makeNoise(2);
    this.crackleBuf = this.makeCrackle(2, 700);

    // --- Moottori ------------------------------------------------------------
    // aaltomuoto -> esivahvistus -> särö -> alipäästö -> epätasaisuus (AM) -> voimakkuus
    const eng = {};
    eng.amp = gain(0, this.engineBus);
    eng.am = gain(1, eng.amp);
    eng.filter = filter('lowpass', 800, 1.4, eng.am);
    eng.shaper = ctx.createWaveShaper();
    eng.shaper.curve = this.makeDistortion(2.6);
    eng.shaper.oversample = '2x';
    eng.shaper.connect(eng.filter);
    eng.drive = gain(0.8, eng.shaper);
    eng.osc = ctx.createOscillator();
    eng.osc.connect(eng.drive);
    eng.osc.start();
    // Imu- ja pakoputken "henkäys": suodatettua kohinaa kuorman mukaan
    eng.breathGain = gain(0, eng.drive);
    eng.breathFilter = filter('bandpass', 800, 1.2, eng.breathGain);
    this.loop(this.noiseBuf, eng.breathFilter);
    // Tyhjäkäynnin epätasaisuus: matala LFO moduloi voimakkuutta
    eng.lfo = ctx.createOscillator();
    eng.lfo.type = 'triangle';
    eng.lfoDepth = gain(0, eng.am.gain);
    eng.lfo.connect(eng.lfoDepth);
    eng.lfo.start();
    // Turbon vihellys
    eng.turbo = ctx.createOscillator();
    eng.turbo.type = 'sine';
    eng.turboGain = gain(0, this.engineBus);
    eng.turbo.connect(eng.turboGain);
    eng.turbo.start();
    // Dieselin nakutus: kohina, jota pulssiaalto katkoo sytytystahdissa (kalke + moottorijarrun räksytys)
    eng.clatterGain = gain(0, this.engineBus);
    eng.clatterFilter = filter('bandpass', 2600, 1.4, eng.clatterGain);
    eng.clatterAM = gain(0, eng.clatterFilter);
    this.loop(this.noiseBuf, eng.clatterAM, 0.9);
    eng.clatterLfo = ctx.createOscillator();
    eng.clatterLfo.setPeriodicWave(this.makePulseWave(0.16));
    eng.clatterDepth = gain(0, eng.clatterAM.gain);
    eng.clatterLfo.connect(eng.clatterDepth);
    eng.clatterLfo.start();
    this.eng = eng;

    // --- Alusta --------------------------------------------------------------
    const sur = {};
    // Rapina: napsupuskuri, jonka toistonopeus seuraa vauhtia
    sur.crunchGain = gain(0, this.surfaceBus);
    sur.crunchFilter = filter('bandpass', 1900, 0.9, sur.crunchGain);
    sur.crunchSrc = this.loop(this.crackleBuf, sur.crunchFilter);
    // Luisto: sama puskuri matalampana ja kovempana + kohinaa
    sur.slideGain = gain(0, this.surfaceBus);
    sur.slideFilter = filter('bandpass', 900, 0.7, sur.slideGain);
    sur.slideSrc = this.loop(this.crackleBuf, sur.slideFilter, 0.9);
    sur.slideNoiseGain = gain(0, sur.slideFilter);
    this.loop(this.noiseBuf, sur.slideNoiseGain, 0.4);
    // Hiekan suhina ja maaston kahina
    sur.hissGain = gain(0, this.surfaceBus);
    this.loop(this.noiseBuf, filter('bandpass', 2600, 0.6, sur.hissGain), 1.1);
    sur.grassGain = gain(0, this.surfaceBus);
    this.loop(this.noiseBuf, filter('lowpass', 520, 0.8, sur.grassGain), 0.7);
    // Vauhdin tuuli
    sur.windGain = gain(0, this.surfaceBus);
    sur.windFilter = filter('lowpass', 400, 0.5, sur.windGain);
    this.loop(this.noiseBuf, sur.windFilter, 1.3);
    this.sur = sur;
  }

  /** Moottorin aaltomuoto profiilista: sytytystahdin yläsävelet + epätasaisuuden välisävelet. */
  applyProfile() {
    const P = this.profile;
    const N = 160;
    const real = new Float32Array(N);
    const imag = new Float32Array(N);
    // Perustaajuus = puolet kampiakselin pyörimisestä (yksi nelitahtisykli).
    // Sytytys osuu joka cylinders:nteen yläsäveleen; muut ovat karheutta.
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let k = 1; k < N; k++) {
      const firing = k % P.cylinders === 0;
      const order = k / P.cylinders;
      const a = firing
        ? 1 / Math.pow(order, 0.75)
        : (0.12 + P.rough * 0.5) * (0.4 + rnd() * 0.6) / Math.pow(k, 0.55);
      const ph = rnd() * Math.PI * 2;
      real[k] = a * Math.cos(ph);
      imag[k] = a * Math.sin(ph);
    }
    this.eng.osc.setPeriodicWave(this.ctx.createPeriodicWave(real, imag));
  }

  // ------------------------------------------------------------- Puskurit ja apurit

  makeNoise(seconds) {
    const ctx = this.ctx;
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  /** Satunnaisia lyhyitä napsuja: soran kivien rapina. density = napsuja sekunnissa. */
  makeCrackle(seconds, density) {
    const ctx = this.ctx;
    const sr = ctx.sampleRate;
    const buf = ctx.createBuffer(1, Math.floor(sr * seconds), sr);
    const d = buf.getChannelData(0);
    const count = Math.floor(seconds * density);
    for (let n = 0; n < count; n++) {
      const start = Math.floor(Math.random() * d.length);
      const len = Math.floor(sr * (0.0008 + Math.random() * 0.004));
      const amp = Math.pow(Math.random(), 2.2) * 0.9 + 0.05;
      for (let i = 0; i < len; i++) {
        const idx = (start + i) % d.length;
        d[idx] += (Math.random() * 2 - 1) * amp * Math.exp((-5 * i) / len);
      }
    }
    return buf;
  }

  /** Kapea pulssiaalto (duty = pulssin osuus jaksosta). Normalisoitu: huippu 1, pohja -duty/(1-duty). */
  makePulseWave(duty) {
    const N = 40;
    const real = new Float32Array(N);
    const imag = new Float32Array(N);
    for (let k = 1; k < N; k++) real[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty);
    return this.ctx.createPeriodicWave(real, imag);
  }

  makeDistortion(k) {
    const n = 1024;
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      curve[i] = Math.tanh(k * x) / Math.tanh(k);
    }
    return curve;
  }

  /** Toistaa puskuria silmukkana (satunnaisesta kohdasta, jotta silmukat eivät ole tahdissa). */
  loop(buffer, dest, rate = 1) {
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.playbackRate.value = rate;
    src.connect(dest);
    src.start(0, Math.random() * buffer.duration);
    return src;
  }

  set(param, value, time = 0.04) {
    param.setTargetAtTime(value, this.ctx.currentTime, time);
  }

  // ------------------------------------------------------------- Ajon aikana

  /**
   * Päivittää moottorin ja alustan äänet. Kutsutaan joka ruudunpäivitys ajon aikana.
   * state = ohjaustila (Input.state), drowned = auto hyytynyt veteen.
   */
  update(dt, car, state, drowned) {
    if (!this.ctx || this.paused) return;
    const P = this.profile;
    const C = car.config;
    const speed = car.speed;
    const spd = Math.abs(speed);
    const v = car.vehicle;
    let contacts = 0;
    for (let i = 0; i < 4; i++) if (v.wheelIsInContact(i)) contacts++;
    const contact = contacts / 4;

    // --- Kuorma polkimista (car.throttle hiipuu huippunopeudessa, poljin ei) ---
    const reversing = speed < -0.5;
    let loadTarget = 0;
    if (!drowned) {
      if (state.forward && speed > -1) loadTarget = 1;
      else if (state.back && speed < 1) loadTarget = 0.8;
    }
    if (this.shiftTimer > 0) {
      this.shiftTimer -= dt;
      loadTarget *= 0.15;   // kaasu hetkeksi pois vaihdon ajaksi
    }
    this.load += (loadTarget - this.load) * Math.min(1, dt * 14);

    // --- Näennäinen vaihteisto ---
    const top = C.maxSpeed * 1.04;
    const gearTop = P.gears.map((g) => g * top);
    const rpmIn = (g) => (spd / gearTop[g]) * P.redline;
    if (reversing) this.gear = 0;
    else {
      if (this.gear < gearTop.length - 1 && rpmIn(this.gear) > P.redline * 0.93) {
        this.gear++;
        this.shiftTimer = 0.13;
      } else if (this.gear > 0 && rpmIn(this.gear - 1) < P.redline * 0.7) {
        this.gear--;
      }
    }
    let target = Math.max(P.idle, rpmIn(this.gear));
    // Kaasu ylhäällä: tyhjäkäynnille. Vaihde seuraa silti vauhtia, joten kaasua painettaessa
    // kierrokset nousevat suoraan oikeaan kohtaan.
    if (COAST_TO_IDLE && loadTarget === 0 && this.shiftTimer <= 0) target = P.idle;
    // Renkaat eivät pidä (ilmassa, lähtö, käsijarru): kierrokset karkaavat kaasun mukaan
    const free = contact === 0 || (spd < 4 && this.load > 0.3) || (car.handbraking && this.load > 0.3);
    if (free) target = Math.max(target, P.idle + this.load * (P.redline - P.idle) * 0.92);
    // Rajoitin
    if (target >= P.redline * 0.995) target = P.redline * (0.965 + 0.035 * Math.sin(this.ctx.currentTime * 55));
    if (drowned) target = 0;
    const k = (drowned ? 1.5 : target > this.rpm ? (free ? 5 : 9) : loadTarget === 0 ? 3.5 : 6) * P.inertia;
    this.rpm += (target - this.rpm) * Math.min(1, dt * k);

    const rpmN = clamp01((this.rpm - P.idle) / (P.redline - P.idle));
    const base = this.rpm / 120;   // puolet kampiakselin kierrostaajuudesta (Hz)
    const eng = this.eng;
    this.set(eng.osc.frequency, Math.max(base, 1), 0.02);
    this.set(eng.drive.gain, 0.55 + this.load * 0.9 + rpmN * 0.3);
    this.set(eng.filter.frequency, (260 + rpmN * 1700 + this.load * 1500) * P.tone);
    this.set(eng.breathFilter.frequency, 380 + rpmN * 2600);
    this.set(eng.breathGain.gain, (0.03 + this.load * 0.12) * (0.3 + rpmN));
    this.set(eng.lfo.frequency, Math.max(base * 0.5, 1));
    this.set(eng.lfoDepth.gain, P.rough * 0.45 * (1 - rpmN) * (1 - this.load * 0.6));
    // Moottorijarru: kaasu ylhäällä, vauhtia ja kierroksia -> karhea, rätisevä ääni
    const jakeOn = P.jake > 0 && !drowned && loadTarget === 0 && spd > 6 && contact > 0.5 ? 1 : 0;
    const jakeTarget = jakeOn * P.jake * clamp01((rpmN - 0.12) / 0.45);
    this.jakeAmt += (jakeTarget - this.jakeAmt) * Math.min(1, dt * (jakeTarget > this.jakeAmt ? 6 : 10));
    const jake = this.jakeAmt;
    if (jake > 0.01) {
      this.set(eng.drive.gain, 0.9 + jake * 1.2 + rpmN * 0.3);
      this.set(eng.filter.frequency, (260 + rpmN * 1700 + jake * 1300) * P.tone);
    }
    const engVol = drowned ? 0 : (0.16 + rpmN * 0.12 + this.load * 0.2 + jake * 0.16) * P.volume;
    this.set(eng.amp.gain, engVol, drowned ? 0.5 : 0.04);
    // Dieselin nakutus sytytystahdissa: kuuluu eniten tyhjäkäynnillä ja moottorijarrutuksessa
    const firing = (this.rpm / 60) * (P.cylinders / 2);
    this.set(eng.clatterLfo.frequency, Math.max(firing, 1), 0.02);
    const clatter = drowned ? 0 : P.diesel * ((0.05 + this.load * 0.05) * (1 - rpmN * 0.6) + jake * 0.22);
    this.set(eng.clatterDepth.gain, clatter);
    this.set(eng.clatterAM.gain, clatter * 0.19);   // nostaa pulssiaallon pohjan nollaan
    this.set(eng.clatterFilter.frequency, 2700 - jake * 1700);
    this.set(eng.clatterGain.gain, P.diesel > 0 ? 1 : 0);
    // Turbo: vihellys kuormalla ja korkeilla kierroksilla
    this.set(eng.turbo.frequency, (2200 + rpmN * 4200) * P.turboPitch);
    this.set(eng.turboGain.gain, P.turbo * 0.02 * this.load * rpmN * rpmN / Math.sqrt(P.turboPitch));

    // Kaasun nosto korkeilta kierroksilta: pamahdukset ja turbon puhallus
    if (this.prevLoad > 0.6 && loadTarget === 0 && this.shiftTimer <= 0 && !drowned) {
      if (rpmN > 0.5 && P.pops > 0) this.popBurst(P.pops * rpmN);
      if (P.turbo > 0 && rpmN > 0.35) this.blowOff(P.turbo * rpmN);
    }
    this.prevLoad = loadTarget;

    // Paineilmajarrut: "pssht" kun jarruttaen pysähdytään tai käsijarru vedetään
    if (P.airBrake > 0 && !drowned) {
      this.airCooldown -= dt;
      const stopped = this.prevSpd > 1.2 && spd <= 1.2 && contact > 0 && !state.forward;
      const hbPulled = car.handbraking && !this.prevHandbrake;
      if ((stopped || hbPulled) && this.airCooldown <= 0) {
        this.airBrakeHiss(P.airBrake * (stopped ? 1 : 0.6));
        this.airCooldown = 1.2;
      }
    }
    this.prevSpd = spd;
    this.prevHandbrake = car.handbraking;

    // --- Alusta ---
    const S = this.surface;
    const sur = this.sur;
    const spdN = clamp01(spd / 30);
    // Sivuttaisnopeus: luisto
    const lv = car.body.linvel();
    const right = car.right ?? null;
    let lateral = 0;
    if (right) lateral = Math.abs(lv.x * right.x + lv.y * right.y + lv.z * right.z);
    else {
      const f = car.forward;
      const along = lv.x * f.x + lv.y * f.y + lv.z * f.z;
      lateral = Math.sqrt(Math.max(0, lv.x * lv.x + lv.z * lv.z - along * along));
    }
    const slide = clamp01((lateral - 1.2) / 7);
    const lockup = car.braking && spd > 4 ? 0.35 : 0;
    const handbrake = car.handbraking && spd > 3 ? 0.4 : 0;
    const slideAmt = contact * Math.min(1, slide + lockup + handbrake) * clamp01(spd / 6);
    const offroad = car.offroad ?? 0;

    this.set(sur.crunchSrc.playbackRate, 0.45 + spdN * 1.4, 0.08);
    this.set(sur.crunchFilter.frequency, S.crunchFreq);
    this.set(sur.crunchFilter.Q, S.crunchQ);
    this.set(sur.crunchGain.gain, contact * Math.pow(spdN, 0.7) * 3.2 * S.crunch * (1 - offroad * 0.4), 0.06);
    this.set(sur.slideSrc.playbackRate, 0.6 + spdN * 0.9, 0.08);
    this.set(sur.slideFilter.frequency, S.slideFreq + slideAmt * 400);
    this.set(sur.slideGain.gain, slideAmt * 2.6, 0.05);
    this.set(sur.slideNoiseGain.gain, 0.25 + S.hiss * 0.5);
    this.set(sur.hissGain.gain, contact * spdN * S.hiss * 0.5 + slideAmt * S.hiss * 0.5, 0.06);
    this.set(sur.grassGain.gain, contact * offroad * Math.pow(spdN, 0.8) * 1.4, 0.08);
    this.set(sur.windFilter.frequency, 250 + spdN * 900);
    this.set(sur.windGain.gain, spdN * spdN * 0.5 + (contact === 0 ? 0.12 : 0), 0.1);

    // --- Hypyt: alastulon tömähdys ---
    if (contact === 0) {
      this.airTime += dt;
      this.fallSpeed = Math.max(this.fallSpeed, -lv.y);
    } else {
      // (ei paikallaan: auto pudotetaan lähtöviivalle tai tielle T-näppäimellä)
      if (this.airTime > 0.2 && this.fallSpeed > 2.5 && spd > 2) this.landing(clamp01((this.fallSpeed - 2) / 10));
      this.airTime = 0;
      this.fallSpeed = 0;
    }
  }

  // ------------------------------------------------------------- Kertaäänet

  /** Kohinapurske suodattimen läpi, eksponentiaalisesti vaimeneva. */
  noiseBurst(type, freq, q, dur, vol, delay = 0, buffer = this.noiseBuf, rate = 1) {
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = rate;
    const f = this.filterNode(type, freq, q);
    const g = this.gainNode(0, this.fxBus);
    src.connect(f);
    f.connect(g);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(vol, 0.0002), t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.start(t, Math.random() * (buffer.duration - dur - 0.1));
    src.stop(t + dur + 0.05);
  }

  /** Matala tömähdys: siniaalto, jonka taajuus putoaa. */
  thump(f0, f1, dur, vol, delay = 0) {
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = this.gainNode(0, this.fxBus);
    o.connect(g);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(vol, 0.0002), t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  /** Metallinen sointi (peltiä, korin rutinaa): pari epäharmonista ääntä nopeasti vaimeten. */
  ring(freqs, dur, vol, delay = 0) {
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const f = this.filterNode('bandpass', freqs[0] * 1.5, 1.5);
    const g = this.gainNode(0, this.fxBus);
    f.connect(g);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(vol, 0.0002), t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    for (const fr of freqs) {
      const o = ctx.createOscillator();
      o.type = 'square';
      o.frequency.setValueAtTime(fr, t);
      o.frequency.exponentialRampToValueAtTime(fr * 0.85, t + dur);
      o.connect(f);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
  }

  /** Korin rutina: useita lyhyitä purskeita ja peltiä. */
  crunch(s, delay = 0) {
    this.noiseBurst('bandpass', 1400 + Math.random() * 1200, 0.8, 0.12 + s * 0.15, 0.5 * s, delay);
    this.noiseBurst('bandpass', 700 + Math.random() * 500, 1.1, 0.2 + s * 0.2, 0.4 * s, delay + 0.02, this.crackleBuf, 0.7);
    this.ring([310 + Math.random() * 120, 520 + Math.random() * 200, 860 + Math.random() * 300], 0.12 + s * 0.25, 0.06 * s, delay + 0.005);
    if (s > 0.5) this.noiseBurst('highpass', 3000, 0.7, 0.35, 0.25 * s, delay + 0.06, this.crackleBuf, 1.2); // lasinsiruja ja romua
  }

  /** Alastulo hypystä: tömähdys ja jousituksen kolahdus. */
  landing(s) {
    if (!this.ctx) return;
    this.thump(95, 38, 0.22 + s * 0.15, 0.35 + s * 0.6);
    this.noiseBurst('lowpass', 500, 0.7, 0.18, 0.25 + s * 0.4);
    this.noiseBurst('bandpass', this.surface.crunchFreq, 0.8, 0.25, 0.3 * s + 0.1, 0.01, this.crackleBuf, 0.8);
    if (s > 0.55) this.ring([220, 370], 0.12, 0.05 * s, 0.01);
  }

  /**
   * Törmäys. strength 0–1, material = 'wood' | 'rock' | 'building' | 'metal' | 'ground' | 'water'.
   * Jokaisella materiaalilla on hiipuva "kosketustaso": ääni soi vain, kun isku on selvästi
   * edellistä kovempi. Näin puuta vasten painaminen ei naputa, mutta uusi osuma kuuluu.
   */
  impact(strength, material) {
    if (!this.ctx || this.paused) return;
    const now = this.ctx.currentTime;
    const last = this.lastImpact[material] ?? { t: 0, level: 0 };
    const level = last.level * Math.pow(0.5, (now - last.t) / 0.3);   // puoliintuu 0,3 sekunnissa
    this.lastImpact[material] = { t: now, level: Math.max(level, strength) };
    if (strength < level * 1.35 + 0.04) return;
    const s = clamp01(strength);
    switch (material) {
      case 'wood':
        this.thump(120, 45, 0.25, 0.5 * s + 0.08);
        this.noiseBurst('bandpass', 1500, 1.4, 0.16, 0.6 * s + 0.05);
        this.noiseBurst('bandpass', 2600, 1, 0.3 + s * 0.2, 0.35 * s, 0.015, this.crackleBuf, 1.1); // säleet
        if (s > 0.25) this.crunch(s * 0.8, 0.01);
        break;
      case 'rock':
        this.thump(95, 40, 0.2, 0.55 * s + 0.08);
        this.noiseBurst('bandpass', 900, 1, 0.12, 0.5 * s + 0.05);
        this.noiseBurst('bandpass', 1300, 0.9, 0.3, 0.3 * s, 0.01, this.crackleBuf, 0.9); // soraa
        if (s > 0.2) this.crunch(s * 0.9, 0.005);
        break;
      case 'building':
        this.thump(75, 34, 0.32, 0.6 * s + 0.1);
        this.noiseBurst('lowpass', 650, 0.8, 0.22, 0.5 * s + 0.05);
        if (s > 0.15) this.crunch(s, 0.01);
        break;
      case 'metal':
        this.thump(110, 50, 0.15, 0.3 * s + 0.05);
        this.ring([640, 910, 1330], 0.4 + s * 0.4, 0.07 * s + 0.02);
        this.noiseBurst('bandpass', 2500, 3, 0.2, 0.3 * s);
        break;
      case 'water':
        this.thump(70, 30, 0.4, 0.5 * s + 0.1);
        this.noiseBurst('lowpass', 1400, 0.6, 0.7, 0.6 * s + 0.15);
        this.noiseBurst('bandpass', 500, 0.8, 0.9, 0.4 * s + 0.1, 0.08);
        break;
      default: // ground: kori osuu maahan (katto, kylki)
        this.thump(80, 36, 0.2, 0.4 * s + 0.05);
        this.noiseBurst('lowpass', 420, 0.7, 0.25, 0.4 * s + 0.05);
        this.noiseBurst('bandpass', this.surface.crunchFreq * 0.7, 0.8, 0.3, 0.35 * s, 0.01, this.crackleBuf, 0.8);
        if (s > 0.3) this.crunch(s * 0.7, 0.01);
    }
  }

  /** Pakoputken pamahdukset kaasua nostettaessa. */
  popBurst(s) {
    const n = 1 + Math.floor(Math.random() * (2 + s * 4));
    let t = 0.05 + Math.random() * 0.08;
    for (let i = 0; i < n; i++) {
      const v = (1.25 + Math.random() * 0.8) * s;
      this.noiseBurst('bandpass', 350 + Math.random() * 500, 0.9, 0.05 + Math.random() * 0.04, v, t);
      this.thump(85 + Math.random() * 30, 40, 0.06, v * 0.8, t);
      t += 0.06 + Math.random() * 0.14;
    }
  }

  /** Paineilmajarrujen sihahdus: terävä alku ja pitkä hiipuva suhina. */
  airBrakeHiss(s) {
    this.noiseBurst('highpass', 3200, 0.6, 0.9, 0.22 * s, 0.05);
    this.noiseBurst('bandpass', 5200, 1.2, 0.6, 0.12 * s, 0.06);
    this.noiseBurst('bandpass', 1500, 0.9, 0.25, 0.08 * s, 0.05);
  }

  /** Turbon puhallus ("pssh") kaasua nostettaessa. */
  blowOff(s) {
    this.noiseBurst('highpass', 2400, 0.7, 0.35, 0.12 * s);
    this.noiseBurst('bandpass', 4200, 2, 0.25, 0.06 * s, 0.02);
  }
}
