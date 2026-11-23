// Kosketusohjaimet puhelimille ja tableteille. Kirjoittaa samaan Input-tilaan kuin näppäimistö,
// joten fysiikka ja sessio eivät tiedä, millä ohjataan.
//
//   Vasen alakulma  ohjaus: STEER_MODE = 'buttons' → vasen/oikea-napit (kuten näppäimistö),
//                   'slider' → liukuohjaus (sormen vaakasiirtymä kosketuskohdasta = analoginen kulma)
//   Oikea alakulma  kaasu, jarru/peruutus ja käsijarru (sormen voi liu'uttaa napilta toiselle)
//   Yläreuna        auton nosto (R), tielle (T), kartta (M), uusi yritys (Enter) ja valikko (Esc)
//
// Ohjaimet tulevat näkyviin ensimmäisestä kosketuksesta (tai heti, jos laite on pelkkä
// kosketuslaite). Silloin bodyyn lisätään luokka "touch", jolla valikko ja viestit vaihtavat
// näppäinohjeet kosketusohjeiksi.

const STEER_MODE = 'buttons'; // 'buttons' = vasen/oikea-napit, 'slider' = liukuohjaus

// Liukuohjauksen säädöt (vain STEER_MODE = 'slider')
const DEAD_ZONE = 6;        // px: näin pieni liike ei vielä käännä
const FULL_LOCK = 0.11;     // täysi lukko tällä siirtymällä (osuus näytön leveydestä)
const FULL_LOCK_MIN = 70;   // px vähintään
const FULL_LOCK_MAX = 120;  // px enintään
const STEER_CURVE = 1.35;   // > 1 = tarkempi ohjaus keskiasennon lähellä

const ICONS = {
  reset: '<svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4.5h4.5"/></svg>',
  road: '<svg viewBox="0 0 24 24"><path d="M8 3 4 21M16 3l4 18M12 4v3M12 10.5v3M12 17v3"/></svg>',
  map: '<svg viewBox="0 0 24 24"><path d="m3 6 6-2 6 2 6-2v14l-6 2-6-2-6 2zM9 4v14M15 6v14"/></svg>',
  retry: '<svg viewBox="0 0 24 24"><path d="M5 21V4M5 4h12l-2.5 4L17 12H5"/></svg>',
  menu: '<svg viewBox="0 0 24 24"><path d="M8 5v14M16 5v14"/></svg>',
};

/** Ottaa sormen talteen elementille (ei kaadu, jos selain ei tunne osoitinta). */
function capture(el, id) {
  try { el.setPointerCapture(id); } catch { /* esim. synteettinen tapahtuma */ }
}

export class TouchControls {
  constructor(input) {
    this.input = input;
    this.enabled = false;
    this.steerPointer = null;   // { id, originX }
    this.padPointers = new Map(); // pointerId -> näppäin (left/right/forward/back/handbrake) tai null
    this.held = new Set();      // kosketuksen pitämät näppäimet
    this.build();

    // Pelkkä kosketuslaite (puhelin, tabletti): ohjaimet heti. Muuten ensimmäisestä kosketuksesta.
    if (matchMedia('(hover: none) and (pointer: coarse)').matches) this.enable();
    addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') this.enable();
    }, true);
    // Koko näyttöä voi pyytää vasta sormen nostosta (selaimen käyttäjäaktivointisääntö)
    addEventListener('pointerup', (e) => {
      if (e.pointerType === 'touch') this.requestFullscreen();
    }, true);
    addEventListener('blur', () => this.releaseAll());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.releaseAll(); });
  }

  build() {
    const root = document.createElement('div');
    root.id = 'touch';
    const steerHtml = STEER_MODE === 'slider'
      ? `<div class="t-steer">
          <div class="t-steer-base"><i class="t-steer-knob"></i></div>
          <span class="t-steer-hint">&#9664; Steer &#9654;</span>
        </div>`
      : `<div class="t-pad t-arrows">
          <button type="button" class="t-btn t-left" data-key="left" aria-label="Steer left"><i></i></button>
          <button type="button" class="t-btn t-right" data-key="right" aria-label="Steer right"><i></i></button>
        </div>`;
    root.innerHTML = `
      ${steerHtml}
      <div class="t-pad t-pedals">
        <button type="button" class="t-btn t-hand" data-key="handbrake">Hand<br>brake</button>
        <button type="button" class="t-btn t-brake" data-key="back">Brake</button>
        <button type="button" class="t-btn t-gas" data-key="forward">Gas</button>
      </div>
      <div class="t-top">
        <button type="button" data-act="reset" aria-label="Reset car">${ICONS.reset}<span>Reset</span></button>
        <button type="button" data-act="road" aria-label="Back to road">${ICONS.road}<span>Road</span></button>
        <button type="button" data-act="map" aria-label="Map">${ICONS.map}<span>Map</span></button>
        <button type="button" data-act="retry" aria-label="Restart stage">${ICONS.retry}<span>Retry</span></button>
        <button type="button" data-act="menu" aria-label="Menu">${ICONS.menu}<span>Menu</span></button>
      </div>`;
    document.body.appendChild(root);
    this.root = root;
    this.padBtns = [...root.querySelectorAll('.t-btn')];

    // Estetään selaimen omat eleet (vieritys, zoomaus, pitkän painalluksen valikko)
    root.addEventListener('contextmenu', (e) => e.preventDefault());
    root.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });

    if (STEER_MODE === 'slider') this.buildSlider(root);

    // --- Napit (polkimet ja ohjausnapit): jokaisen sormen alla oleva nappi painetaan ---
    const keyAt = (x, y) => document.elementFromPoint(x, y)?.closest?.('.t-btn')?.dataset.key ?? null;
    root.querySelectorAll('.t-pad').forEach((pad) => {
      pad.addEventListener('pointerdown', (e) => {
        capture(pad, e.pointerId);
        this.padPointers.set(e.pointerId, keyAt(e.clientX, e.clientY));
        this.updatePads();
        navigator.vibrate?.(8);
      });
      pad.addEventListener('pointermove', (e) => {
        if (!this.padPointers.has(e.pointerId)) return;
        const key = keyAt(e.clientX, e.clientY);
        if (key !== this.padPointers.get(e.pointerId)) {
          this.padPointers.set(e.pointerId, key);
          this.updatePads();
        }
      });
      const end = (e) => {
        if (this.padPointers.delete(e.pointerId)) this.updatePads();
      };
      pad.addEventListener('pointerup', end);
      pad.addEventListener('pointercancel', end);
      pad.addEventListener('lostpointercapture', end);
    });

    // --- Yläreunan napit: samat kertapainallukset kuin näppäimillä ---
    // (pointerup eikä click, koska touchstartin preventDefault estää click-tapahtuman)
    root.querySelectorAll('.t-top button').forEach((b) => {
      b.addEventListener('pointerup', () => {
        const inp = this.input;
        switch (b.dataset.act) {
          case 'reset': inp.resetRequested = true; break;
          case 'road': inp.roadRequested = true; break;
          case 'map': inp.mapToggled = true; break;
          case 'retry': inp.restartRequested = true; break;
          case 'menu': inp.menuRequested = true; break;
        }
      });
    });
  }

  /** Liukuohjaus vasempaan puoliskoon (STEER_MODE = 'slider'). */
  buildSlider(root) {
    this.steerZone = root.querySelector('.t-steer');
    this.steerBase = root.querySelector('.t-steer-base');
    this.knob = root.querySelector('.t-steer-knob');
    const z = this.steerZone;
    z.addEventListener('pointerdown', (e) => {
      if (this.steerPointer) return;
      capture(z, e.pointerId);
      this.steerPointer = { id: e.pointerId, originX: e.clientX };
      const r = z.getBoundingClientRect();
      this.steerBase.style.left = `${e.clientX - r.left}px`;
      this.steerBase.style.top = `${e.clientY - r.top}px`;
      z.classList.add('active');
      this.updateSteer(e.clientX);
    });
    z.addEventListener('pointermove', (e) => {
      if (this.steerPointer?.id === e.pointerId) this.updateSteer(e.clientX);
    });
    const endSteer = (e) => {
      if (this.steerPointer?.id !== e.pointerId) return;
      this.steerPointer = null;
      this.input.state.steer = null;
      this.knob.style.transform = '';
      z.classList.remove('active');
      this.steerBase.style.left = this.steerBase.style.top = '';
    };
    z.addEventListener('pointerup', endSteer);
    z.addEventListener('pointercancel', endSteer);
    z.addEventListener('lostpointercapture', endSteer);
  }

  /** Laskee ohjausarvon sormen vaakasiirtymästä. Lähtökohta seuraa, jos sormi menee yli täyden lukon. */
  updateSteer(x) {
    const sp = this.steerPointer;
    const range = Math.min(FULL_LOCK_MAX, Math.max(FULL_LOCK_MIN, innerWidth * FULL_LOCK));
    let dx = x - sp.originX;
    if (dx > range) { sp.originX = x - range; dx = range; }
    if (dx < -range) { sp.originX = x + range; dx = -range; }
    const t = Math.min(1, Math.max(0, (Math.abs(dx) - DEAD_ZONE) / (range - DEAD_ZONE)));
    // Vasemmalle = positiivinen (sama merkki kuin car.js:n left − right)
    this.input.state.steer = -Math.sign(dx) * t ** STEER_CURVE;
    this.knob.style.transform = `translateX(${(dx / range) * 46}px)`;
  }

  /** Asettaa kosketuksen pitämät napit; näppäimistön painalluksiin ei kosketa. */
  updatePads() {
    const now = new Set([...this.padPointers.values()].filter(Boolean));
    const st = this.input.state;
    for (const k of this.held) if (!now.has(k)) st[k] = false;
    for (const k of now) st[k] = true;
    this.held = now;
    this.padBtns.forEach((b) => b.classList.toggle('on', now.has(b.dataset.key)));
  }

  releaseAll() {
    this.padPointers.clear();
    this.updatePads();
    if (this.steerPointer) {
      this.steerPointer = null;
      this.input.state.steer = null;
      this.knob.style.transform = '';
      this.steerZone.classList.remove('active');
    }
  }

  /** Näyttää ohjaimet. */
  enable() {
    if (this.enabled) return;
    this.enabled = true;
    document.body.classList.add('touch');
  }

  /** Androidilla koko näyttö ja vaakasuunta (iPhonen Safari ei tue; kotivalikosta avattuna ei tarvita). */
  requestFullscreen() {
    if (!this.triedFullscreen && matchMedia('(hover: none)').matches
      && !matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches) {
      this.triedFullscreen = true;
      const el = document.documentElement;
      el.requestFullscreen?.({ navigationUI: 'hide' })
        ?.then(() => screen.orientation?.lock?.('landscape'))
        .catch(() => {});
    }
  }
}
