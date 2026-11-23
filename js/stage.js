// Rallipätkän ajanotto: lähtö- ja maaliportit, ajastin, ennätys ja oikaisun esto.
//
// Eteneminen mitataan tien näytepisteinä: auto "etenee" vain, kun se on lähellä
// tietä eikä hyppää kerralla kauas eteenpäin. Näin mutkia ei voi oikaista maaston kautta.

import * as THREE from 'three';

/** Uusintaohje: kosketuslaitteella Retry-nappi, muuten Enter. */
const retryHint = () => (document.body.classList.contains('touch') ? 'Tap RETRY to try again' : 'Enter = try again');

const NEAR_ROAD = 14;   // m: tätä kauempana tiestä eteneminen ei kasva
const MAX_SKIP = 25;    // m: suurin sallittu hyppäys eteenpäin kerralla

export function formatTime(t) {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
}

/** Ennätyksen tallennusavain: rata + auto. Reitin muuttaminen aloittaa puhtaalta pöydältä. */
export function routeKey(road, carId) {
  const str = JSON.stringify([road.points, road.startAt, Math.round(road.finishAt)]);
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return `autopeli-ennatys-${(h >>> 0).toString(16)}-${carId}`;
}

/** Lukee tallennetun ennätyksen (sekunteina) tai null. */
export function loadBest(key) {
  try {
    const v = parseFloat(localStorage.getItem(key));
    return v > 0 ? v : null;
  } catch {
    return null;   // selain ei salli tallennusta
  }
}

function bannerTexture(text, bg) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 96;
  const ctx = c.getContext('2d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 512, 96);
  // Ruutulippukuvio reunoihin
  for (let y = 0; y < 2; y++) {
    for (let x = 0; x < 3; x++) {
      ctx.fillStyle = (x + y) % 2 ? '#111' : '#fff';
      ctx.fillRect(x * 32, y * 48, 32, 48);
      ctx.fillRect(512 - (x + 1) * 32, y * 48, 32, 48);
    }
  }
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 60px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 52);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class Stage {
  constructor(scene, world, RAPIER, road, carId = 'wrc') {
    this.road = road;
    this.startS = Math.round(road.startAt / road.spacing);
    this.finishS = Math.min(road.count - 1, Math.round(road.finishAt / road.spacing));
    this.spawnS = Math.max(0, this.startS - Math.round(4 / road.spacing)); // auto 4 m ennen viivaa
    this.length = (this.finishS - this.startS) * road.spacing;

    this.timeEl = document.getElementById('time');
    this.bestEl = document.getElementById('best');
    this.msgEl = document.getElementById('message');

    this.key = routeKey(road, carId);
    this.best = loadBest(this.key);

    const fixed = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    this.metalColliders = new Set();
    this.buildGate(scene, world, RAPIER, fixed, this.startS, 'START', '#1f7a3a');
    this.buildGate(scene, world, RAPIER, fixed, this.finishS, 'FINISH', '#b3202a');

    this.reset();
  }

  buildGate(scene, world, RAPIER, body, s, text, color) {
    const r = this.road;
    const half = r.halfWidth + 1.0;
    const height = 4.2;
    const right = new THREE.Vector3(-r.tz[s], 0, r.tx[s]);
    const up = new THREE.Vector3(0, 1, 0);
    const back = new THREE.Vector3().crossVectors(right, up); // osoittaa tulosuuntaan päin

    const group = new THREE.Group();
    group.position.set(r.xs[s], r.hs[s], r.zs[s]);
    group.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, back));

    const postMat = new THREE.MeshStandardMaterial({ color: '#e8e8e8', flatShading: true, roughness: 0.7 });
    const postGeo = new THREE.CylinderGeometry(0.14, 0.18, height, 6).translate(0, height / 2, 0);
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(postGeo, postMat);
      post.position.x = side * half;
      post.castShadow = true;
      group.add(post);
      // Törmäysmuoto tolpalle
      const p = new THREE.Vector3(side * half, 0, 0).applyQuaternion(group.quaternion).add(group.position);
      const postCollider = world.createCollider(
        RAPIER.ColliderDesc.cylinder(height / 2, 0.18).setTranslation(p.x, p.y + height / 2, p.z),
        body,
      );
      this.metalColliders.add(postCollider.handle);   // törmäysääni: metallia
    }

    const tex = bannerTexture(text, color);
    const bannerMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 });
    const edgeMat = new THREE.MeshStandardMaterial({ color, roughness: 0.8 });
    const banner = new THREE.Mesh(
      new THREE.BoxGeometry(half * 2, 0.75, 0.08),
      [edgeMat, edgeMat, edgeMat, edgeMat, bannerMat, bannerMat],
    );
    banner.position.y = height - 0.45;
    banner.castShadow = true;
    group.add(banner);

    // Viiva tien poikki
    const line = new THREE.Mesh(
      new THREE.PlaneGeometry(r.width, 0.5).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({
        color: '#f4f4f4', roughness: 0.9,
        polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
      }),
    );
    line.position.y = 0.07;
    line.receiveShadow = true;
    group.add(line);

    scene.add(group);
  }

  /** Uusi yritys: ajastin nollaan, odotetaan lähtöviivan ylitystä. */
  reset() {
    this.state = 'ready';
    this.time = 0;
    this.furthest = this.spawnS;
    this.hint = this.spawnS;
    this.timeEl.textContent = formatTime(0);
    this.timeEl.classList.remove('finished');
    this.bestEl.textContent = this.best ? `Best ${formatTime(this.best)}` : `Stage ${Math.round(this.length)} m`;
    this.showMessage('Cross the start line!', 2.5);
  }

  showMessage(text, seconds = 3) {
    this.msgEl.innerHTML = text;
    this.msgEl.classList.add('show');
    clearTimeout(this.msgTimer);
    if (seconds > 0) this.msgTimer = setTimeout(() => this.msgEl.classList.remove('show'), seconds * 1000);
  }

  nearestSample(x, z) {
    const r = this.road;
    let best = this.hint;
    let bestD = Infinity;
    for (let o = -60; o <= 60; o++) {
      const s = this.hint + o;
      if (s < 0 || s >= r.count) continue;
      const d = (r.xs[s] - x) ** 2 + (r.zs[s] - z) ** 2;
      if (d < bestD) { bestD = d; best = s; }
    }
    if (bestD > 20 * 20) {                       // auto siirtyi kauas (esim. T-näppäin): haetaan koko tieltä
      for (let s = 0; s < r.count; s++) {
        const d = (r.xs[s] - x) ** 2 + (r.zs[s] - z) ** 2;
        if (d < bestD) { bestD = d; best = s; }
      }
    }
    this.hint = best;
    return [best, Math.sqrt(bestD)];
  }

  /** Kutsutaan jokaisella fysiikka-askeleella. */
  update(dt, pos) {
    if (this.state === 'finished' || this.state === 'failed') return;
    const [s, d] = this.nearestSample(pos.x, pos.z);
    const maxSkip = Math.round(MAX_SKIP / this.road.spacing);
    if (d < NEAR_ROAD && s > this.furthest && s <= this.furthest + maxSkip) this.furthest = s;

    if (this.state === 'ready' && this.furthest >= this.startS) {
      this.state = 'running';
      this.time = 0;
      this.showMessage('Go!', 1.2);
    }
    if (this.state === 'running') {
      this.time += dt;
      if (this.furthest >= this.finishS) this.finish();
    }
  }

  finish() {
    this.state = 'finished';
    const t = this.time;
    let msg = `FINISH! <b>${formatTime(t)}</b>`;
    if (!this.best || t < this.best) {
      if (this.best) msg += `<br><span class="record">New record! (−${(this.best - t).toFixed(2)} s)</span>`;
      this.best = t;
      try { localStorage.setItem(this.key, String(t)); } catch { /* ei tallennusta */ }
    } else {
      msg += `<br>Best ${formatTime(this.best)} (+${(t - this.best).toFixed(2)} s)`;
    }
    msg += `<br><small>${retryHint()}</small>`;
    this.showMessage(msg, 0);
    this.timeEl.textContent = formatTime(t);
    this.timeEl.classList.add('finished');
    this.bestEl.textContent = `Best ${formatTime(this.best)}`;
  }

  /** Yritys päättyi kesken (esim. auto ajoi veteen): ajastin pysähtyy, vain uusi yritys. */
  fail(text) {
    if (this.state === 'finished' || this.state === 'failed') return;
    this.state = 'failed';
    this.showMessage(`${text}<br><small>${retryHint()}</small>`, 0);
  }

  dispose() {
    clearTimeout(this.msgTimer);
    this.msgEl.classList.remove('show');
  }

  /** Päivittää ajastimen näytön (kerran ruudunpäivityksessä). */
  updateHud() {
    if (this.state === 'running') this.timeEl.textContent = formatTime(this.time);
  }
}
