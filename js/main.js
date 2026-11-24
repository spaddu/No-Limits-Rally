import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { Input } from './input.js';
import { Menu } from './menu.js';
import { TouchControls } from './touchControls.js';
import { GameAudio } from './audio.js';
import { RaceSession } from './session.js';
import { TRACKS } from './tracks.js';
import { CARS } from './cars.js';
import { PostFX } from './postfx.js';
import { PerfHud } from './perfHud.js';
import { SLIDE_ASSIST } from './car.js';

const speedEl = document.getElementById('speed-value');

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

// --- Latausruutu ---------------------------------------------------------------
const loader = document.getElementById('loader');
const loaderImg = document.getElementById('loader-image');
const loaderText = document.getElementById('loader-text');
const loaderTip = document.getElementById('loader-tip');
const LOADING_IMAGES = ['images/loading-screen.webp', 'images/loading-screen2.webp'];
const TIPS = [
  'Tip: Space pulls the handbrake. Use it to swing the car around hairpins.',
  'Tip: Lost in the woods? T puts you back on the road.',
  'Tip: Press M to see the whole stage on the map.',
  'Tip: Rear-wheel drive loves to slide. Feather the throttle out of corners.',
  'Tip: Off the road the car loses grip and speed. Stay on the gravel.',
  'Tip: In the Bahamas, keep out of the sea. It ends your run.',
  'Tip: Every car keeps its own best time on every stage.',
];
let tipIndex = Math.floor(Math.random() * TIPS.length);

/** Näyttää latausruudun. Italian etapeilla käytetään Toscana-kuvaa, muuten vuorotellen. */
function showLoader(text, track = null) {
  let img = LOADING_IMAGES[0];
  if (track) img = track.country === 'Italy' ? LOADING_IMAGES[1]
    : track.country === 'Finland' ? LOADING_IMAGES[0]
    : LOADING_IMAGES[TRACKS.indexOf(track) % 2];
  if (!loaderImg.src.endsWith(img)) loaderImg.src = img;
  loaderText.textContent = text;
  loaderTip.textContent = TIPS[tipIndex++ % TIPS.length];
  loader.classList.remove('hide', 'error');
  loader.hidden = false;
}

function hideLoader() {
  loader.classList.add('hide');
}

/** Odottaa kuvan latautumista (enintään hetken), jotta se ehtii ruudulle ennen raskasta rakennusta. */
async function loaderReady() {
  await Promise.race([loaderImg.decode().catch(() => {}), new Promise((r) => setTimeout(r, 1500))]);
  await nextFrame();
  await nextFrame();
}

function showError(err) {
  console.error(err);
  loader.hidden = false;
  loader.classList.remove('hide');
  loader.classList.add('error');
  loaderText.textContent = 'Game error:\n' + (err?.message ?? err);
  loaderTip.textContent = '';
}
addEventListener('error', (e) => showError(e.error ?? e.message));
addEventListener('unhandledrejection', (e) => showError(e.reason));

await RAPIER.init();

// --- Renderöinti -------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));   // tarkat näytöt: enintään 1,5 × (2 × = 4 × pikseleitä)
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;   // valotus radan tunnelman mukaan (atmosphere.js)
document.body.appendChild(renderer.domElement);
const postfx = new PostFX(renderer);                   // bloom ja vinjetti (postfx.js), ?fx=0 = pois
const perf = new PerfHud(renderer, postfx);            // suorituskykymittarit: E-näppäin tai ?perf

const input = new Input();
const touch = new TouchControls(input);   // kosketusohjaimet puhelimille (näkyvät vain kosketuslaitteilla)
const audio = new GameAudio();            // syntetisoidut äänet (käynnistyvät ensimmäisestä painalluksesta)
let session = null;

/** Purkaa vanhan session ja rakentaa uuden (rata + auto). */
function buildSession(trackIdx, carIdx) {
  session?.dispose();
  session = null;
  session = new RaceSession(RAPIER, TRACKS[trackIdx], CARS[carIdx]);
  session.choice = { track: trackIdx, car: carIdx };
  session.onImpact = (strength, material) => audio.impact(strength, material);
  audio.setCar(CARS[carIdx], TRACKS[trackIdx].theme);
  postfx.configure(session.atmo);
}

const menu = new Menu({
  async onStart(trackIdx, carIdx) {
    const c = session?.choice;
    // Rakennetaan alusta, jos rata tai auto vaihtui tai kehittäjän paneelin poistamat puut palautetaan
    if (!c || c.track !== trackIdx || c.car !== carIdx || perf.needsRebuild(session)) {
      // Näytetään latausruutu ennen raskasta rakennusta
      const t = TRACKS[trackIdx];
      audio.setLoading(true);
      showLoader(`Loading ${t.country} · ${t.name}…`, t);
      await loaderReady();
      buildSession(trackIdx, carIdx);
      hideLoader();
    } else {
      session.restart();
    }
    closeMenu();
  },
  onResume() {
    closeMenu();
  },
});

function openMenu() {
  if (session.mapView.active) session.mapView.toggle();
  touch.releaseAll();
  audio.setPaused(true);
  menu.open({ current: session.choice, canResume: session.driven });
}

function closeMenu() {
  menu.close();
  audio.setPaused(false);
  input.clearEvents();
  last = performance.now();
}

// Ensimmäinen näkymä: viimeksi valittu rata ja auto valikon taustalla
loaderText.textContent = `Loading ${TRACKS[menu.track].country} · ${TRACKS[menu.track].name}…`;
loaderTip.textContent = TIPS[tipIndex++ % TIPS.length];
await loaderReady();
buildSession(menu.track, menu.car);
menu.open();
hideLoader();

// Äänet päälle/pois: valikon nappi ja V-näppäin
const soundBtn = document.getElementById('menu-sound');
function updateSoundButton(muted = audio.muted) {
  soundBtn.classList.toggle('off', muted);
  soundBtn.querySelector('span').textContent = muted ? 'Sound off' : 'Sound on';
}
soundBtn.addEventListener('click', () => updateSoundButton(audio.toggleMuted()));
updateSoundButton();
// Valikkomusiikki päälle/pois (pelin äänet pysyvät)
const musicBtn = document.getElementById('menu-music');
function updateMusicButton(on = audio.musicEnabled) {
  musicBtn.classList.toggle('off', !on);
  musicBtn.querySelector('span').textContent = on ? 'Music on' : 'Music off';
}
musicBtn.addEventListener('click', () => updateMusicButton(audio.toggleMusic()));
updateMusicButton();

// --- Pelisilmukka -------------------------------------------------------------
let last = performance.now();

renderer.setAnimationLoop((now) => {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  if (!session) return;
  perf.begin();
  if (input.consumeSound()) updateSoundButton(audio.toggleMuted());

  const updateStart = performance.now();
  session.perf.physics = 0;
  session.perf.steps = 0;
  if (menu.isOpen) {
    input.clearEvents();
    session.idle(dt);
  } else {
    if (input.consumeMenu()) openMenu();
    else {
      session.drive(dt, input);
      audio.update(dt, session.car, input.state, session.drowned);
    }
  }

  speedEl.textContent = Math.round(Math.abs(session.car.speed) * 3.6);
  perf.beforeRender(session);   // törmäysmuotojen viivat (jos näkyvissä)
  const renderStart = performance.now();
  session.render(postfx, dt);
  const renderEnd = performance.now();
  perf.end(session, {
    update: renderStart - updateStart - session.perf.physics,
    physics: session.perf.physics,
    steps: session.perf.steps,
    render: renderEnd - renderStart,
  });
});

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  postfx.setSize(innerWidth, innerHeight);
  session?.resize();
});

// Kehitystä ja testausta varten selaimen konsolista: window.game
window.game = {
  THREE, RAPIER, renderer, postfx, perf, slideAssist: SLIDE_ASSIST, input, menu, touch, audio,
  get session() { return session; },
  get car() { return session.car; },
  get road() { return session.road; },
  get stage() { return session.stage; },
};
