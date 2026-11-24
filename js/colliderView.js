// Törmäysmuotojen näyttö (kehittäjän paneeli): Rapierin debugRender piirtää jokaisen
// törmäysmuodon särminä. Three.js ei tunne fysiikkaa, joten viivat tehdään itse
// LineSegments-olioiksi.
//
// Staattiset muodot (maasto, puut, kivet, rakennukset, portit) rakennetaan kerran, ja
// vain auton muodot ja renkaiden säteet päivitetään joka ruudussa. "Vain törmäysmuodot"
// -tilassa kaikki muu piilotetaan.

import * as THREE from 'three';

const STATIC_COLOR = '#4dff9a';
const CAR_COLOR = '#ffb02e';
const RAY_COLOR = '#ff4d6d';

function lines(vertices, color) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  const m = new THREE.LineBasicMaterial({ color, fog: false, transparent: true, opacity: 0.85 });
  const l = new THREE.LineSegments(g, m);
  l.frustumCulled = false;
  return l;
}

export class ColliderView {
  constructor(session) {
    this.session = session;
    const { world, car, scene } = session;
    const carBody = car.body;
    this.group = new THREE.Group();
    this.group.renderOrder = 10;

    // Staattiset muodot kerran (kaikki, joiden kappale ei ole auto)
    const t0 = performance.now();
    const all = world.debugRender(undefined, (c) => c.parent()?.handle !== carBody.handle);
    this.static = lines(all.vertices.slice(), STATIC_COLOR);
    this.staticSegments = all.vertices.length / 6;
    this.buildMs = performance.now() - t0;
    this.group.add(this.static);

    this.car = lines(new Float32Array(0), CAR_COLOR);
    this.rays = lines(new Float32Array(8 * 3), RAY_COLOR);
    this.group.add(this.car, this.rays);
    this.group.visible = false;
    scene.add(this.group);
    this.hidden = null;   // "vain törmäysmuodot": piilotettujen olioiden alkuperäinen näkyvyys
  }

  /** Auton muodot ja renkaiden säteet tämän hetken fysiikkatilasta. */
  update() {
    if (!this.group.visible) return;
    const { world, car } = this.session;
    const carBody = car.body;
    const buf = world.debugRender(undefined, (c) => c.parent()?.handle === carBody.handle);
    const g = this.car.geometry;
    const pos = g.getAttribute('position');
    if (!pos || pos.array.length !== buf.vertices.length) {
      g.setAttribute('position', new THREE.BufferAttribute(buf.vertices.slice(), 3));
    } else {
      pos.array.set(buf.vertices);
      pos.needsUpdate = true;
    }

    // Renkaiden säteet: kiinnityspisteestä kosketuspisteeseen (tai täyteen pituuteen)
    const v = car.vehicle, t = carBody.translation(), r = carBody.rotation();
    const q = new THREE.Quaternion(r.x, r.y, r.z, r.w);
    const ray = this.rays.geometry.getAttribute('position');
    const a = new THREE.Vector3(), b = new THREE.Vector3();
    for (let i = 0; i < 4; i++) {
      const c = v.wheelChassisConnectionPointCs(i);
      a.set(c.x, c.y, c.z).applyQuaternion(q).add(t);
      if (v.wheelIsInContact(i)) {
        const p = v.wheelContactPoint(i);
        b.set(p.x, p.y, p.z);
      } else {
        const len = (v.wheelSuspensionLength(i) ?? 0) + v.wheelRadius(i);
        b.set(0, -len, 0).applyQuaternion(q).add(a);
      }
      ray.setXYZ(i * 2, a.x, a.y, a.z);
      ray.setXYZ(i * 2 + 1, b.x, b.y, b.z);
    }
    ray.needsUpdate = true;
  }

  /** mode: 'off' | 'overlay' (viivat maiseman päällä) | 'only' (vain viivat). */
  setMode(mode) {
    const scene = this.session.scene;
    // Palautetaan ensin kaikki näkyviin
    if (this.hidden) {
      for (const [obj, vis] of this.hidden) obj.visible = vis;
      this.hidden = null;
      scene.background = this.background;
    }
    this.group.visible = mode !== 'off';
    if (mode === 'only') {
      this.hidden = new Map();
      for (const obj of scene.children) {
        if (obj === this.group || obj.isLight) continue;
        this.hidden.set(obj, obj.visible);
        obj.visible = false;
      }
      this.background = scene.background;
      scene.background = new THREE.Color('#0c0f12');
    }
    this.session.sky.mesh.userData.forceHidden = mode === 'only';
    this.update();
  }

  dispose() {
    this.setMode('off');
    this.group.removeFromParent();
    for (const l of [this.static, this.car, this.rays]) {
      l.geometry.dispose();
      l.material.dispose();
    }
  }
}
