// Päävalikko kahdessa vaiheessa: 1) auto, 2) etappi (maa valitaan välilehdeltä, sen alla etapit).
// HTML-elementit canvaksen päällä.
// Näppäimet: ←/→ valitsee etapin tai auton, Q/E, Tab tai ↑/↓ vaihtaa maata,
// Enter = seuraava / aja, Esc = takaisin / jatka ajoa (autovaiheessa).

import { TRACKS, COUNTRIES } from './tracks.js';
import { CARS } from './cars.js';
import { buildRoad } from './road.js';
import { routeKey, loadBest, formatTime } from './stage.js';
import { renderCarThumbnails } from './carPreview.js';

const SAVE_KEY = 'autopeli-valinta';
const DRIVE_SHORT = { 'Front-wheel drive': 'FWD', 'Rear-wheel drive': 'RWD', 'All-wheel drive': 'AWD', 'Four-wheel drive': '4×4' };
const STAT_NAMES = { power: 'Power', grip: 'Grip', agility: 'Agility' };
// Teeman mukainen alusta korttien alalaitaan
const SURFACE = {
  forest: 'Gravel',
  tuscany: 'Gravel · Tarmac',
  desert: 'Sand',
  arizona: 'Gravel · Rock',
  tropical: 'Sand · Gravel',
  highlands: 'Gravel',
};

/** Pieni SVG-kuva reitin muodosta. */
function routeSvg(points) {
  const xs = points.map((p) => p[0]);
  const zs = points.map((p) => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs);
  const size = Math.max(maxX - minX, maxZ - minZ) || 1;
  const pad = 10;
  const sx = (x) => pad + ((x - minX) / size) * (100 - 2 * pad) + ((size - (maxX - minX)) / size) * (50 - pad);
  const sz = (z) => pad + ((z - minZ) / size) * (100 - 2 * pad) + ((size - (maxZ - minZ)) / size) * (50 - pad);
  const pts = points.map(([x, z]) => `${sx(x).toFixed(1)},${sz(z).toFixed(1)}`).join(' ');
  const [x0, z0] = points[0];
  const [x1, z1] = points[points.length - 1];
  return `<svg viewBox="0 0 100 100" aria-hidden="true">
    <polyline points="${pts}" fill="none" stroke="rgba(0,0,0,.45)" stroke-width="7" stroke-linejoin="round" stroke-linecap="round"/>
    <polyline points="${pts}" fill="none" stroke="#f6ead0" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${sx(x0)}" cy="${sz(z0)}" r="4.5" fill="#2fbf5a" stroke="#111" stroke-width="1.5"/>
    <rect x="${sx(x1) - 4.5}" y="${sz(z1) - 4.5}" width="9" height="9" fill="#fff" stroke="#111" stroke-width="1.5"/>
    <rect x="${sx(x1) - 4.5}" y="${sz(z1) - 4.5}" width="4.5" height="4.5" fill="#111"/>
    <rect x="${sx(x1)}" y="${sz(z1)}" width="4.5" height="4.5" fill="#111"/>
  </svg>`;
}

const flag = (country) => `<i class="flag flag-${country.toLowerCase()}"></i>`;
const km = (m) => `${(m / 1000).toFixed(2)} km`;

export class Menu {
  constructor({ onStart, onResume }) {
    this.onStart = onStart;
    this.onResume = onResume;
    this.root = document.getElementById('menu');
    this.stepStage = document.getElementById('step-stage');
    this.stepCar = document.getElementById('step-car');
    this.stepEls = [document.getElementById('step-1'), document.getElementById('step-2')];
    this.keysEl = document.getElementById('menu-keys');
    this.tabWrap = document.getElementById('country-tabs');
    this.stageWrap = document.getElementById('stage-cards');
    this.carWrap = document.getElementById('car-cards');
    this.chip = document.getElementById('stage-chip');
    this.nextBtn = document.getElementById('menu-next');
    this.backBtn = document.getElementById('menu-back');
    this.resumeBtn = document.getElementById('menu-resume');
    this.isOpen = false;
    this.step = 'car';
    this.current = null;     // käynnissä olevan session valinnat { track, car }
    this.canResume = false;

    // Tallennettu valinta (oletuksena ensimmäinen rata ja WRC-auto)
    this.track = 0;
    this.car = Math.max(0, CARS.findIndex((c) => c.id === 'wrc'));
    try {
      const saved = JSON.parse(localStorage.getItem(SAVE_KEY));
      const t = TRACKS.findIndex((x) => x.id === saved?.track);
      const c = CARS.findIndex((x) => x.id === saved?.car);
      if (t >= 0) this.track = t;
      if (c >= 0) this.car = c;
    } catch { /* ei tallennettua valintaa */ }

    // Ratojen pituudet ja ennätysavaimet (korkeuksia ei tarvita)
    this.trackRoads = TRACKS.map((t) => buildRoad(t.road, () => 0));
    // Maittain: etappien indeksit TRACKS-listaan
    this.countries = COUNTRIES.map((c) => TRACKS.map((t, i) => (t.country === c ? i : -1)).filter((i) => i >= 0));
    // Viimeksi valittu etappi kussakin maassa (välilehteä vaihdettaessa palataan siihen)
    this.lastInCountry = this.countries.map((list) => list[0]);
    this.lastInCountry[this.countryOf(this.track)] = this.track;

    this.buildTabs();
    this.buildStageCards();
    this.buildCarCards();
    this.nextBtn.addEventListener('click', () => (this.step === 'car' ? this.goStage() : this.start()));
    this.backBtn.addEventListener('click', () => this.goCar());
    this.resumeBtn.addEventListener('click', () => this.resume());
    addEventListener('keydown', (e) => this.onKey(e), true);
    this.root.addEventListener('pointerdown', (e) => { this.lastPointer = e.pointerType; }, true);
    this.update();
  }

  countryOf(trackIdx) {
    return this.countries.findIndex((list) => list.includes(trackIdx));
  }

  bestOnTrack(i, carIdx) {
    return loadBest(routeKey(this.trackRoads[i], CARS[carIdx].id));
  }

  /** Paras aika radalla millä tahansa autolla: [aika, auton nimi] tai null. */
  bestAnyCar(i) {
    let best = null;
    CARS.forEach((c, ci) => {
      const t = this.bestOnTrack(i, ci);
      if (t && (!best || t < best[0])) best = [t, c.name];
    });
    return best;
  }

  stageLength(i) {
    const r = this.trackRoads[i];
    return Math.round(r.finishAt - r.startAt);
  }

  /** Etapin numero maan sisällä (SS 1, SS 2…). */
  stageNum(i) {
    return this.countries[this.countryOf(i)].indexOf(i) + 1;
  }

  buildTabs() {
    this.tabEls = COUNTRIES.map((country, ci) => {
      const tab = document.createElement('button');
      tab.type = 'button';
      tab.className = 'tab';
      tab.setAttribute('role', 'tab');
      tab.innerHTML = `${flag(country)}<span>${country}</span><span class="tab-count"></span>`;
      tab.addEventListener('click', () => { this.selectCountry(ci); this.update(); });
      this.tabWrap.appendChild(tab);
      return tab;
    });
  }

  /** Kaikki etappikortit rakennetaan kerran; näkyvissä vain valitun maan kortit. */
  buildStageCards() {
    this.trackCards = TRACKS.map((t, i) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'card stage-card';
      card.innerHTML = `
        <div class="thumb" style="--c:${t.color}">${routeSvg(t.road.points)}
          <span class="ss">SS ${this.stageNum(i)}</span>
          <span class="len">${km(this.stageLength(i))}</span>
        </div>
        <div class="card-body">
          <div class="card-name">${t.name}</div>
          <div class="card-desc">${t.description}</div>
          <div class="card-meta"><span class="surface">${SURFACE[t.theme] ?? 'Gravel'}</span><span class="best"></span></div>
        </div>`;
      // Kosketuksella jo valitun kortin napautus siirtää eteenpäin (tuplaklikkaus on kosketuksella hankala)
      card.addEventListener('click', () => {
        if (this.lastPointer === 'touch' && this.track === i) return this.start();
        this.selectTrack(i);
        this.update();
      });
      card.addEventListener('dblclick', () => { this.selectTrack(i); this.start(); });
      this.stageWrap.appendChild(card);
      return card;
    });
  }

  buildCarCards() {
    // Pelin automallit kuvina; jos WebGL-kuvan teko epäonnistuu, näytetään vanha palikka
    let shots = [];
    try { shots = renderCarThumbnails(CARS); } catch (err) { console.warn('Autokuvat epäonnistuivat', err); }
    this.carShots = shots;
    this.carCards = CARS.map((c, i) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'card car-card';
      const bars = Object.entries(c.stats).map(([k, v]) => {
        const segs = Array.from({ length: 5 }, (_, s) => `<i${s < v ? ' class="on"' : ''}></i>`).join('');
        return `<div class="stat"><span>${STAT_NAMES[k] ?? k}</span><div class="segs">${segs}</div></div>`;
      }).join('');
      card.innerHTML = `
        <div class="thumb car-thumb" style="--c:${c.color}">
          ${shots[i] ? `<img class="car-shot" src="${shots[i]}" alt="">`
            : '<div class="car-block"><b></b><em></em><em class="rear"></em></div>'}
          <span class="drive-badge">${DRIVE_SHORT[c.drive] ?? ''}</span>
        </div>
        <div class="card-body">
          <div class="card-name">${c.name}</div>
          <div class="card-desc">${c.drive} · ${c.description}</div>
          <div class="stats">${bars}</div>
          <div class="card-meta"><span class="surface">Stages with a time</span><span class="best"></span></div>
        </div>`;
      card.addEventListener('click', () => {
        if (this.lastPointer === 'touch' && this.car === i) return this.goStage();
        this.car = i;
        this.update();
      });
      card.addEventListener('dblclick', () => { this.car = i; this.goStage(); });
      this.carWrap.appendChild(card);
      return card;
    });
  }

  selectTrack(i) {
    this.track = i;
    this.lastInCountry[this.countryOf(i)] = i;
  }

  selectCountry(ci) {
    this.selectTrack(this.lastInCountry[ci]);
  }

  /** Päivittää valinnat, ennätykset, vaiheen ja napit. */
  update() {
    // Vaihe 1 = auto, vaihe 2 = etappi
    const onStage = this.step === 'stage';
    this.stepStage.hidden = !onStage;
    this.stepCar.hidden = onStage;
    this.stepEls[0].className = `step ${onStage ? 'done' : 'active'}`;
    this.stepEls[1].className = `step ${onStage ? 'active' : ''}`;

    const ci = this.countryOf(this.track);
    this.tabEls.forEach((tab, k) => {
      tab.classList.toggle('active', k === ci);
      tab.setAttribute('aria-selected', k === ci);
      const done = this.countries[k].filter((i) => this.bestOnTrack(i, this.car)).length;
      tab.querySelector('.tab-count').textContent = `${done}/${this.countries[k].length}`;
    });
    if (this.isOpen) this.tabEls[ci].scrollIntoView({ block: 'nearest', inline: 'nearest' });

    TRACKS.forEach((t, i) => {
      const card = this.trackCards[i];
      card.hidden = this.countryOf(i) !== ci;
      card.classList.toggle('selected', i === this.track);
      // Paras aika valitulla autolla
      const best = this.bestOnTrack(i, this.car);
      const el = card.querySelector('.best');
      el.textContent = best ? formatTime(best) : 'No time';
      el.classList.toggle('none', !best);
    });
    if (onStage && this.isOpen) this.trackCards[this.track].scrollIntoView({ block: 'nearest' });

    this.carCards.forEach((c, i) => {
      c.classList.toggle('selected', i === this.car);
      const done = TRACKS.filter((_, ti) => this.bestOnTrack(ti, i)).length;
      const el = c.querySelector('.best');
      el.textContent = `${done}/${TRACKS.length}`;
      el.classList.toggle('none', !done);
    });

    // Etappivaiheen yläreunassa valittu auto
    const c = CARS[this.car];
    const shot = this.carShots[this.car];
    this.chip.innerHTML = `<div class="chip-thumb car-chip" style="--c:${c.color}">${shot ? `<img src="${shot}" alt="">` : ''}</div>
      <div class="chip-main">
        <span class="chip-country">Your car · ${DRIVE_SHORT[c.drive] ?? ''}</span>
        <span class="chip-name">${c.name}</span>
      </div>
      <div class="chip-facts">
        <div>Stages done<b>${TRACKS.filter((_, ti) => this.bestOnTrack(ti, this.car)).length}/${TRACKS.length}</b></div>
      </div>`;

    this.nextBtn.innerHTML = onStage ? 'Race &#9656;' : 'Next &#9656;';
    this.backBtn.hidden = !onStage;
    this.resumeBtn.hidden = !(!onStage && this.canResume);
    if (document.body.classList.contains('touch')) {
      this.keysEl.textContent = onStage ? 'Tap a stage, tap again to race' : 'Tap a car, tap again to continue';
    } else {
      this.keysEl.innerHTML = onStage
        ? '<b>Q</b><b>E</b> country · <b>←</b><b>→</b> stage · <b>Enter</b> race · <b>Esc</b> back'
        : '<b>←</b><b>→</b> car · <b>Enter</b> next' + (this.canResume ? ' · <b>Esc</b> resume' : '');
    }

    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ track: TRACKS[this.track].id, car: CARS[this.car].id }));
    } catch { /* ei tallennusta */ }
  }

  /** Avaa valikon (aina autovalinnasta). current = käynnissä olevan session valinnat. */
  open({ current = null, canResume = false } = {}) {
    this.isOpen = true;
    this.current = current;
    this.canResume = canResume;
    if (current) { this.selectTrack(current.track); this.car = current.car; }
    this.step = 'car';
    this.root.hidden = false;
    document.body.classList.add('menu-open');
    this.update();
    (this.canResume ? this.resumeBtn : this.nextBtn).focus({ preventScroll: true });
  }

  close() {
    this.isOpen = false;
    this.root.hidden = true;
    document.body.classList.remove('menu-open');
    document.activeElement?.blur();
  }

  goCar() {
    this.step = 'car';
    this.update();
    this.nextBtn.focus({ preventScroll: true });
  }

  goStage() {
    this.step = 'stage';
    this.update();
    this.nextBtn.focus({ preventScroll: true });
  }

  start() {
    if (this.isOpen) this.onStart(this.track, this.car);
  }

  resume() {
    if (this.isOpen && this.canResume) this.onResume();
  }

  /** Vaihtaa maavälilehteä (d = ±1). */
  moveCountry(d) {
    const n = this.countries.length;
    this.selectCountry((this.countryOf(this.track) + d + n) % n);
  }

  /** Siirtää etappivalintaa valitun maan sisällä (d = ±1). */
  moveStage(d) {
    const list = this.countries[this.countryOf(this.track)];
    const k = list.indexOf(this.track);
    this.selectTrack(list[(k + d + list.length) % list.length]);
  }

  onKey(e) {
    if (!this.isOpen || (e.repeat && e.code !== 'Tab')) return;
    const onStage = this.step === 'stage';
    switch (e.code) {
      case 'ArrowLeft': case 'KeyA':
        if (onStage) this.moveStage(-1); else this.car = (this.car - 1 + CARS.length) % CARS.length;
        break;
      case 'ArrowRight': case 'KeyD':
        if (onStage) this.moveStage(1); else this.car = (this.car + 1) % CARS.length;
        break;
      case 'ArrowUp': case 'KeyW': case 'KeyQ':
        if (onStage) this.moveCountry(-1);
        break;
      case 'ArrowDown': case 'KeyS': case 'KeyE':
        if (onStage) this.moveCountry(1);
        break;
      case 'Tab':
        if (!onStage) return;            // autovaiheessa Tab liikkuu nappien välillä normaalisti
        this.moveCountry(e.shiftKey ? -1 : 1);
        break;
      case 'Enter': case 'NumpadEnter':
        e.preventDefault();
        if (onStage) this.start(); else this.goStage();
        return;
      case 'Escape': case 'Backspace':
        e.preventDefault();
        if (onStage) this.goCar(); else this.resume();
        return;
      default:
        return;
    }
    e.preventDefault();
    this.update();
  }
}
