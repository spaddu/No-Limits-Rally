import * as THREE from 'three';
import { ColliderView } from './colliderView.js';
import { fogDensity } from './atmosphere.js';

// Kehittäjän suorituskykymittarit (E-näppäin tai osoite ?perf). Näyttää oikeassa
// yläkulmassa ruudunpäivityksen (FPS ja käyrä), aikajaon (fysiikka, päivitys, piirto,
// näytönohjain), piirtokutsut ja kolmiot, muistin ja näkymän tiedot.
//
// Paneelin valintaruuduilla (tai numeronäppäimillä) voi kokeilla, mikä maksaa:
//   1 = jälkikäsittely   2 = bloom   3 = varjot   4 = tarkkuus (pikselisuhde)   5 = puut
//   6 = törmäysmuodot maiseman päällä   7 = vain törmäysmuodot (colliderView.js)
// Puut poistetaan radalta kokonaan (grafiikka ja törmäysmuodot); takaisin ne tulevat, kun
// ajo käynnistetään valikosta uudelleen.

const GRAPH_SAMPLES = 150;
const PIXEL_RATIOS = [0.5, 0.75, 1, 1.5, 2];

export class PerfHud {
  constructor(renderer, postfx) {
    this.renderer = renderer;
    this.postfx = postfx;
    this.visible = new URLSearchParams(location.search).has('perf');
    renderer.info.autoReset = false;   // nollataan itse ruudun alussa, jotta varjot ja jälkikäsittely lasketaan

    this.el = document.createElement('div');
    this.el.id = 'perf';
    this.el.hidden = !this.visible;
    this.canvas = document.createElement('canvas');
    this.canvas.width = GRAPH_SAMPLES * 2;
    this.canvas.height = 60;
    this.text = document.createElement('pre');
    this.controls = this.buildControls();
    this.el.append(this.canvas, this.text, this.controls);
    document.body.appendChild(this.el);
    this.ctx2d = this.canvas.getContext('2d');

    this.frames = new Float32Array(GRAPH_SAMPLES);   // ruutuaikojen historia (ms)
    this.head = 0;
    this.acc = { n: 0, time: 0, worst: 0, update: 0, physics: 0, steps: 0, render: 0 };
    this.shown = null;
    this.scene = { calls: 0, triangles: 0 };
    this.lastText = 0;
    this.last = performance.now();

    // Näytönohjaimen aika (vain jos selain tukee ajastinkyselyitä, esim. Chrome työpöydällä)
    const gl = renderer.getContext();
    this.gl = gl;
    this.timerExt = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    this.queries = [];
    this.gpuMs = null;
    this.gpuAcc = { n: 0, ms: 0 };

    // Varjokartan osuus: luetaan laskurit ennen ja jälkeen varjokartan piirron
    this.shadow = { calls: 0, triangles: 0 };
    const shadowMap = renderer.shadowMap;
    const shadowRender = shadowMap.render.bind(shadowMap);
    shadowMap.render = (...args) => {
      const r = renderer.info.render, c0 = r.calls, t0 = r.triangles;
      shadowRender(...args);
      this.shadow.calls += r.calls - c0;
      this.shadow.triangles += r.triangles - t0;
    };

    postfx.onSceneRendered = () => {
      const r = renderer.info.render;
      this.scene.calls = r.calls;
      this.scene.triangles = r.triangles;
    };

    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      if (e.code === 'KeyE') this.toggle();
      else if (this.visible) this.handleKey(e.code);
    });
  }

  /** Valintaruudut ja tarkkuusvalinta (ainoa paneelin osa, joka ottaa vastaan klikkauksia). */
  buildControls() {
    const box = document.createElement('div');
    box.className = 'perf-controls';
    this.inputs = {};
    const check = (key, label, hotkey, onChange) => {
      const row = document.createElement('label');
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.addEventListener('change', () => { onChange(input.checked); input.blur(); });
      row.append(input, ` ${label} `, Object.assign(document.createElement('kbd'), { textContent: hotkey }));
      box.appendChild(row);
      this.inputs[key] = input;
    };
    check('postfx', 'Post-FX', '1', (v) => this.setPostFx(v));
    check('bloom', 'Bloom', '2', (v) => this.setBloom(v));
    check('shadows', 'Shadows', '3', (v) => this.setShadows(v));
    check('trees', 'Trees', '5', (v) => this.setTrees(v));
    check('colliders', 'Colliders', '6', (v) => this.setColliders(v ? 'overlay' : 'off'));
    check('collidersOnly', 'Colliders only', '7', (v) => this.setColliders(v ? 'only' : 'off'));
    const row = document.createElement('label');
    const select = document.createElement('select');
    for (const pr of PIXEL_RATIOS) select.add(new Option(`${pr}x`, String(pr)));
    select.addEventListener('change', () => { this.setPixelRatio(Number(select.value)); select.blur(); });
    row.append('Resolution ', select, ' ', Object.assign(document.createElement('kbd'), { textContent: '4' }));
    box.appendChild(row);
    this.inputs.resolution = select;

    // Piirtoetäisyys ja utu (m). Arvot palaavat radan omiin, kun rata vaihtuu.
    const slider = (key, label, min, max, onInput) => {
      const wrap = document.createElement('label');
      wrap.className = 'perf-slider';
      const input = Object.assign(document.createElement('input'), { type: 'range', min, max, step: 10 });
      const value = document.createElement('span');
      input.addEventListener('input', () => { onInput(Number(input.value)); this.syncControls(); });
      input.addEventListener('change', () => input.blur());
      wrap.append(label, input, value);
      box.appendChild(wrap);
      this.inputs[key] = input;
      this.inputs[key + 'Value'] = value;
    };
    slider('far', 'Draw dist.', 100, 1200, (v) => this.session?.setDrawDistance(v));
    slider('fog', 'Fog vis.', 100, 1200, (v) => this.session?.setFogVisibility(v));
    this.fogNote = document.createElement('div');
    this.fogNote.className = 'perf-note';
    box.appendChild(this.fogNote);
    this.shadows = true;
    this.trees = true;
    this.colliderMode = 'off';
    this.colliderView = null;
    return box;
  }

  setPostFx(v) { this.postfx.enabled = v; this.syncControls(); }

  setBloom(v) {
    if (this.postfx.bloom) this.postfx.bloom.enabled = v;
    this.syncControls();
  }

  setShadows(v) {
    this.shadows = v;
    if (this.session) this.session.sun.castShadow = v;
    this.syncControls();
  }

  /**
   * Puut pois: poistetaan radalta kokonaan, sekä grafiikka että törmäysmuodot. Takaisin ne
   * tulevat vasta, kun ajo käynnistetään uudelleen valikosta (rata rakennetaan alusta).
   */
  setTrees(v) {
    this.trees = v;
    if (!v && this.session && !this.session.treesRemoved) this.removeTrees(this.session);
    this.syncControls();
  }

  /** Pitääkö rata rakentaa alusta (puut poistettiin, mutta täppä on taas päällä)? */
  needsRebuild(session) {
    return !!session?.treesRemoved && this.trees;
  }

  removeTrees(session) {
    const { scene, world, RAPIER } = session;
    // 1) Puiden instanssiryhmät (InstanceBatch, tag 'tree') ja puiden paikat
    const groups = [];
    scene.traverse((o) => { if (o.userData.tag === 'tree') groups.push(o); });
    const spots = new Set();
    const key = (x, z) => `${Math.round(x)},${Math.round(z)}`;
    const m = new THREE.Matrix4();
    let meshes = 0;
    for (const g of groups) {
      for (const mesh of g.children) {
        if (!mesh.isInstancedMesh) continue;
        meshes++;
        for (let i = 0; i < mesh.count; i++) {
          mesh.getMatrixAt(i, m);
          spots.add(key(m.elements[12], m.elements[14]));
        }
        mesh.dispose();
      }
      g.removeFromParent();
    }
    // 2) Rungon törmäyssylinterit puiden kohdalta (pystysylinteri ±1 m päässä puun paikasta)
    const remove = [];
    world.forEachCollider((c) => {
      if (c.shape.type !== RAPIER.ShapeType.Cylinder) return;
      const t = c.translation();
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
        if (spots.has(key(t.x + dx, t.z + dz))) { remove.push(c); return; }
      }
    });
    for (const c of remove) world.removeCollider(c, false);
    session.treesRemoved = { meshes, colliders: remove.length };
    // Törmäysmuotojen viivat rakennetaan uudelleen ilman puita
    if (this.colliderView) {
      this.colliderView.dispose();
      this.colliderView = null;
      if (this.colliderMode !== 'off') this.setColliders(this.colliderMode);
    }
  }

  /** Törmäysmuodot: 'off' | 'overlay' | 'only'. Viivat rakennetaan radalle ensimmäisellä kerralla. */
  setColliders(mode) {
    this.colliderMode = mode;
    if (mode !== 'off' && this.session && !this.colliderView) this.colliderView = new ColliderView(this.session);
    this.colliderView?.setMode(mode);
    this.syncControls();
  }

  beforeRender(session) {
    if (session !== this.session) this.changeSession(session);
    this.colliderView?.update();
  }

  /** Uusi rata: valinnat (varjot, puut, törmäysmuodot) säilyvät. */
  changeSession(session) {
    this.session = session;
    this.colliderView = null;   // vanha näkymä purettiin radan mukana
    if (!session) return;
    session.sun.castShadow = this.shadows;
    if (this.visible) this.syncControls();
    if (!this.trees) this.setTrees(false);
    if (this.colliderMode !== 'off') this.setColliders(this.colliderMode);
  }

  setPixelRatio(pr) {
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(innerWidth, innerHeight);
    this.postfx.setSize(innerWidth, innerHeight);
    this.syncControls();
  }

  /** Valintaruudut vastaamaan nykytilaa (näppäimet muuttavat samoja asetuksia). */
  syncControls() {
    const i = this.inputs;
    i.postfx.checked = this.postfx.enabled;
    i.bloom.checked = !!this.postfx.bloom?.enabled;
    i.bloom.disabled = !this.postfx.enabled;
    i.shadows.checked = this.shadows;
    i.trees.checked = this.trees;
    // Puut tulevat takaisin vasta uudessa ajossa
    i.trees.parentElement.title = this.session?.treesRemoved && this.trees ? 'Trees return when the stage is restarted from the menu' : '';
    i.colliders.checked = this.colliderMode === 'overlay';
    i.collidersOnly.checked = this.colliderMode === 'only';
    const view = this.session?.view;
    if (view) {
      i.far.value = view.far;
      i.fog.value = view.fog;
      i.farValue.textContent = `${Math.round(view.far)} m`;
      i.fogValue.textContent = `${Math.round(view.fog)} m`;
      // Kuinka peittävää utu on piirtoalueen takareunassa (FogExp2: 1 - e^-(d·x)²)
      const d = fogDensity(view.fog);
      const cover = 1 - Math.exp(-((d * view.far) ** 2));
      this.fogNote.textContent = `Fog at draw edge ${(cover * 100).toFixed(cover > 0.99 ? 1 : 0)} %  (≥ 98 % hides the edge)`;
    }
    const pr = this.renderer.getPixelRatio();
    if (![...i.resolution.options].some((o) => Number(o.value) === pr)) i.resolution.add(new Option(`${pr}x`, String(pr)));
    i.resolution.value = String(pr);
  }

  toggle() {
    this.visible = !this.visible;
    this.el.hidden = !this.visible;
    if (this.visible) this.syncControls();
  }

  /** Numeronäppäimet: kokeillaan asetusten vaikutusta lennossa. */
  handleKey(code) {
    if (code === 'Digit1') this.setPostFx(!this.postfx.enabled);
    else if (code === 'Digit2') this.setBloom(!this.postfx.bloom?.enabled);
    else if (code === 'Digit3') this.setShadows(!this.shadows);
    else if (code === 'Digit5') this.setTrees(!this.trees);
    else if (code === 'Digit6') this.setColliders(this.colliderMode === 'overlay' ? 'off' : 'overlay');
    else if (code === 'Digit7') this.setColliders(this.colliderMode === 'only' ? 'off' : 'only');
    else if (code === 'Digit4') {
      const pr = this.renderer.getPixelRatio();
      const i = PIXEL_RATIOS.findIndex((v) => v > pr + 0.01);
      this.setPixelRatio(PIXEL_RATIOS[i < 0 ? 0 : i]);
    }
  }

  /** Ruudun alku: nollataan laskurit ja aloitetaan näytönohjaimen ajanotto. */
  begin() {
    this.renderer.info.reset();
    this.shadow.calls = 0;
    this.shadow.triangles = 0;
    if (!this.visible || !this.timerExt) return;
    this.pollQueries();
    if (this.queries.length < 4) {
      const q = this.gl.createQuery();
      this.gl.beginQuery(this.timerExt.TIME_ELAPSED_EXT, q);
      this.activeQuery = q;
    }
  }

  pollQueries() {
    const gl = this.gl;
    while (this.queries.length) {
      const q = this.queries[0];
      if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break;
      const disjoint = gl.getParameter(this.timerExt.GPU_DISJOINT_EXT);
      if (!disjoint) {
        this.gpuAcc.ms += gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6;
        this.gpuAcc.n++;
      }
      gl.deleteQuery(q);
      this.queries.shift();
    }
  }

  /**
   * Ruudun loppu. t = { update, physics, steps, render } millisekunteina (main.js ja session.js).
   */
  end(session, t) {
    if (this.activeQuery) {
      this.gl.endQuery(this.timerExt.TIME_ELAPSED_EXT);
      this.queries.push(this.activeQuery);
      this.activeQuery = null;
    }
    if (session !== this.session) this.changeSession(session);
    const now = performance.now();
    const frame = now - this.last;
    this.last = now;
    if (!this.visible) return;

    this.frames[this.head] = frame;
    this.head = (this.head + 1) % GRAPH_SAMPLES;
    const a = this.acc;
    a.n++;
    a.time += frame;
    a.worst = Math.max(a.worst, frame);
    a.update += t.update;
    a.physics += t.physics;
    a.steps += t.steps;
    a.render += t.render;
    this.drawGraph();

    // Teksti päivitetään neljästi sekunnissa (keskiarvot väliltä)
    if (now - this.lastText < 250) return;
    this.lastText = now;
    const n = a.n || 1;
    if (this.gpuAcc.n) {
      this.gpuMs = this.gpuAcc.ms / this.gpuAcc.n;
      this.gpuAcc.ms = 0;
      this.gpuAcc.n = 0;
    }
    this.shown = {
      fps: (1000 * a.n) / a.time, avg: a.time / n, worst: a.worst,
      update: a.update / n, physics: a.physics / n, steps: a.steps / n, render: a.render / n,
    };
    Object.assign(a, { n: 0, time: 0, worst: 0, update: 0, physics: 0, steps: 0, render: 0 });
    this.writeText(session);
  }

  drawGraph() {
    const g = this.ctx2d, W = this.canvas.width, H = this.canvas.height;
    const scale = H / 50;   // 50 ms = koko korkeus
    g.clearRect(0, 0, W, H);
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(0, 0, W, H);
    // Ohjeviivat: 60 fps ja 30 fps
    g.fillStyle = 'rgba(255,255,255,0.25)';
    g.fillRect(0, H - 16.7 * scale, W, 1);
    g.fillRect(0, H - 33.3 * scale, W, 1);
    for (let i = 0; i < GRAPH_SAMPLES; i++) {
      const ms = this.frames[(this.head + i) % GRAPH_SAMPLES];
      if (!ms) continue;
      g.fillStyle = ms > 33.4 ? '#ff5a4a' : ms > 17.5 ? '#ffc23a' : '#6fdc6f';
      const h = Math.min(H, ms * scale);
      g.fillRect(i * 2, H - h, 2, h);
    }
  }

  writeText(session) {
    const s = this.shown, R = this.renderer, info = R.info, f = (v, d = 1) => v.toFixed(d);
    const k = (v) => (v >= 1e6 ? f(v / 1e6, 2) + ' M' : v >= 1e3 ? f(v / 1e3, 1) + ' k' : String(v));
    const size = R.getDrawingBufferSize(this._size ??= new THREE.Vector2());
    const lines = [
      `FPS ${f(s.fps, 0).padStart(4)}   ${f(s.avg)} ms  (max ${f(s.worst)})`,
      ``,
      `CPU  update  ${f(s.update, 2)} ms`,
      `     physics ${f(s.physics, 2)} ms  (${f(s.steps)} steps)`,
      `     render  ${f(s.render, 2)} ms`,
      `GPU  ${this.timerExt ? (this.gpuMs == null ? '…' : f(this.gpuMs, 2) + ' ms') : 'n/a (no timer query)'}`,
      ``,
      `Scene  ${String(this.scene.calls - this.shadow.calls).padStart(5)} calls  ${k(this.scene.triangles - this.shadow.triangles).padStart(8)} tris`,
      `Shadow ${String(this.shadow.calls).padStart(5)} calls  ${k(this.shadow.triangles).padStart(8)} tris`,
      `Total  ${String(info.render.calls).padStart(5)} calls  ${k(info.render.triangles).padStart(8)} tris  (+ post)`,
      `Memory ${info.memory.geometries} geo  ${info.memory.textures} tex  ${info.programs?.length ?? '?'} shaders`,
    ];
    if (performance.memory) lines.push(`JS heap ${f(performance.memory.usedJSHeapSize / 1048576, 0)} / ${f(performance.memory.jsHeapSizeLimit / 1048576, 0)} MB`);
    if (session) {
      lines.push(
        ``,
        `Dust ${session.dust.dust.count}  debris ${session.dust.debris.count}`,
        `Physics ${session.world.bodies.len()} bodies  ${session.world.colliders.len()} colliders`,
        ...(session.treesRemoved ? [`Trees removed: ${session.treesRemoved.meshes} meshes, ${session.treesRemoved.colliders} colliders${this.trees ? ' (back after restart)' : ''}`] : []),
        ...(this.colliderView ? [`Collider lines ${this.colliderView.staticSegments} (built ${this.colliderView.buildMs.toFixed(0)} ms)`] : []),
      );
    }
    lines.push(
      ``,
      `${size.x}×${size.y} @ ${f(R.getPixelRatio(), 2)}x`,
      `[E] hide`,
    );
    this.text.textContent = lines.join('\n');
  }
}
