import * as THREE from 'three';

// Kehittäjän suorituskykymittarit (E-näppäin tai osoite ?perf). Näyttää oikeassa
// yläkulmassa ruudunpäivityksen (FPS ja käyrä), aikajaon (fysiikka, päivitys, piirto,
// näytönohjain), piirtokutsut ja kolmiot, muistin ja näkymän tiedot.
//
// Mittarien ollessa auki numeronäppäimillä voi kokeilla, mikä maksaa:
//   1 = jälkikäsittely päälle/pois   2 = bloom päälle/pois   3 = varjot päälle/pois
//   4 = tarkkuus (pikselisuhde) 0.5 / 0.75 / 1 / 1.5 / 2

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
    this.el.append(this.canvas, this.text);
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

  toggle() {
    this.visible = !this.visible;
    this.el.hidden = !this.visible;
  }

  /** Numeronäppäimet: kokeillaan asetusten vaikutusta lennossa. */
  handleKey(code) {
    const session = this.session;
    if (code === 'Digit1') this.postfx.enabled = !this.postfx.enabled;
    else if (code === 'Digit2' && this.postfx.bloom) this.postfx.bloom.enabled = !this.postfx.bloom.enabled;
    else if (code === 'Digit3' && session) session.sun.castShadow = !session.sun.castShadow;
    else if (code === 'Digit4') {
      const pr = this.renderer.getPixelRatio();
      const i = PIXEL_RATIOS.findIndex((v) => v > pr + 0.01);
      this.renderer.setPixelRatio(PIXEL_RATIOS[i < 0 ? 0 : i]);
      this.renderer.setSize(innerWidth, innerHeight);
      this.postfx.setSize(innerWidth, innerHeight);
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
    this.session = session;
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
      );
    }
    lines.push(
      ``,
      `${size.x}×${size.y} @ ${f(R.getPixelRatio(), 2)}x`,
      `[1] post-fx ${this.postfx.enabled ? 'on ' : 'off'}  [2] bloom ${this.postfx.bloom?.enabled ? 'on ' : 'off'}`,
      `[3] shadows ${session?.sun.castShadow ? 'on ' : 'off'}  [4] resolution`,
      `[E] hide`,
    );
    this.text.textContent = lines.join('\n');
  }
}
