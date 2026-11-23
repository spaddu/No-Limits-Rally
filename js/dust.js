// Pöly ja roiskeet renkaista: pienet polygonipilvet (pöly) ja kivenmurut tai
// ruohotupot (roiskeet). Määrä riippuu nopeudesta, sivuluisusta, kiihdytyksestä
// ja jarrutuksesta sekä siitä, onko rengas soralla vai ruoholla.

import * as THREE from 'three';

// Kaikki pölyn säädöt yhdessä paikassa. Määrät ovat hiukkasia sekunnissa per rengas.
export const DUST_CONFIG = {
  cruise: 0.3,          // × nopeus (m/s): tavallinen ajo soralla
  cruiseOffroad: 0.12,  // × nopeus (m/s): tavallinen ajo ruoholla
  slide: 7,             // × sivuluisun nopeus (m/s)
  slideThreshold: 0.8,  // m/s sivuluisua ennen kuin luisu alkaa pöllyttää
  spin: 35,             // kiihdytys pienellä nopeudella (”revitys”)
  spinSpeed: 14,        // m/s, jonka yli kiihdytys ei enää revi
  lock: 2.5,            // × nopeus, kun rengas jarruttaa lukkoon (jarru, käsijarru)
  debris: 0.45,         // roiskeiden osuus revityksen/luisun/jarrutuksen määrästä
  opacity: 0.5,         // pölyn peittävyys alussa (haalistuu pehmeästi loppua kohti)
  dustSize: [0.32, 0.55], // pölypilven alkukoko (m)
  dustGrow: 2.8,        // kuinka moninkertaiseksi pilvi laajenee elinaikanaan
  maxDust: 700,
  maxDebris: 300,
};

// Oletuspaletti (metsätie). Teemat voivat antaa omat värinsä (themes.js).
export const DEFAULT_DUST_PALETTE = {
  road: ['#eadfc4', '#e0d3b4', '#f2e9d6'],          // pöly soralla
  offroad: ['#c9bf9a', '#bbb08a', '#d2c9a8'],       // pöly maastossa
  roadBits: ['#8c7b62', '#a08d70', '#6f6250'],      // soranmurut
  offroadBits: ['#5f9a3d', '#4f8a33', '#6e8f3a', '#7a6a4a'], // ruohotupot
};
const toColors = (arr) => arr.map((c) => new THREE.Color(c));

const pick = (arr) => arr[(Math.random() * arr.length) | 0];
const rnd = (a, b) => a + Math.random() * (b - a);

/** Hiukkasvarasto, joka piirretään yhtenä InstancedMesh-oliona. */
class ParticlePool {
  constructor(scene, geometry, material, max, behaviour) {
    this.max = max;
    this.count = 0;
    this.behaviour = behaviour; // { drag, gravity, grow }
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.age = new Float32Array(max);
    this.life = new Float32Array(max);
    this.size = new Float32Array(max);
    this.spin = new Float32Array(max);
    this.rot = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);

    // Pölylle oma läpinäkyvyys per hiukkanen (pehmeä haalistuminen)
    if (behaviour.fade) {
      this.alpha = new Float32Array(max);
      this.alphaAttr = new THREE.InstancedBufferAttribute(this.alpha, 1);
      this.alphaAttr.setUsage(THREE.DynamicDrawUsage);
      geometry.setAttribute('aAlpha', this.alphaAttr);
      material.onBeforeCompile = (shader) => {
        shader.vertexShader = 'attribute float aAlpha;\nvarying float vAlpha;\n' + shader.vertexShader
          .replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvAlpha = aAlpha;');
        shader.fragmentShader = 'varying float vAlpha;\n' + shader.fragmentShader
          .replace('#include <color_fragment>', '#include <color_fragment>\n\tdiffuseColor.a *= vAlpha;');
      };
      material.customProgramCacheKey = () => 'dust-alpha';
    }
    this.mesh = new THREE.InstancedMesh(geometry, material, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, new THREE.Color());
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  spawn(x, y, z, vx, vy, vz, life, size, color) {
    if (this.count >= this.max) return;
    const i = this.count++;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.age[i] = 0;
    this.life[i] = life;
    this.size[i] = size;
    this.spin[i] = rnd(-2, 2);
    this.rot[i * 3] = rnd(0, 6.28); this.rot[i * 3 + 1] = rnd(0, 6.28); this.rot[i * 3 + 2] = rnd(0, 6.28);
    this.col[i * 3] = color.r; this.col[i * 3 + 1] = color.g; this.col[i * 3 + 2] = color.b;
  }

  /** Siirtää hiukkasen j paikalle i (kuolleen tilalle). */
  move(j, i) {
    for (let k = 0; k < 3; k++) {
      this.pos[i * 3 + k] = this.pos[j * 3 + k];
      this.vel[i * 3 + k] = this.vel[j * 3 + k];
      this.rot[i * 3 + k] = this.rot[j * 3 + k];
      this.col[i * 3 + k] = this.col[j * 3 + k];
    }
    this.age[i] = this.age[j];
    this.life[i] = this.life[j];
    this.size[i] = this.size[j];
    this.spin[i] = this.spin[j];
  }

  update(dt, cameraPos, m, q, e, p, s) {
    const { drag, gravity, grow, fade } = this.behaviour;
    const damp = Math.exp(-drag * dt);
    const matrix = this.mesh.instanceMatrix.array;
    const colors = this.mesh.instanceColor.array;

    for (let i = 0; i < this.count; i++) {
      this.age[i] += dt;
      if (this.age[i] >= this.life[i]) {
        this.move(--this.count, i);
        i--;
        continue;
      }
      const i3 = i * 3;
      this.vel[i3] *= damp;
      this.vel[i3 + 1] = this.vel[i3 + 1] * damp + gravity * dt;
      this.vel[i3 + 2] *= damp;
      this.pos[i3] += this.vel[i3] * dt;
      this.pos[i3 + 1] += this.vel[i3 + 1] * dt;
      this.pos[i3 + 2] += this.vel[i3 + 2] * dt;

      const t = this.age[i] / this.life[i];
      // Pöly laajenee nopeasti ja haalistuu pehmeästi, roiske vain pienenee
      let scale = grow
        ? this.size[i] * (0.6 + (DUST_CONFIG.dustGrow - 0.6) * (1 - Math.pow(1 - t, 2.2)))
        : this.size[i] * (1 - t * t);
      if (fade) this.alpha[i] = Math.min(1, t * 14) * Math.pow(1 - t, 1.7);

      // Kameran lähellä pienennetään, ettei pilvi peitä näkymää
      p.set(this.pos[i3], this.pos[i3 + 1], this.pos[i3 + 2]);
      const camDist = p.distanceTo(cameraPos);
      if (camDist < 4.5) scale *= Math.max(0, (camDist - 1.5) / 3);

      const r = this.spin[i] * this.age[i];
      e.set(this.rot[i3] + r, this.rot[i3 + 1] + r, this.rot[i3 + 2]);
      q.setFromEuler(e);
      s.setScalar(Math.max(scale, 1e-4));
      m.compose(p, q, s);
      m.toArray(matrix, i * 16);
      colors[i3] = this.col[i3];
      colors[i3 + 1] = this.col[i3 + 1];
      colors[i3 + 2] = this.col[i3 + 2];
    }

    this.mesh.count = this.count;
    if (this.alphaAttr) this.alphaAttr.needsUpdate = true;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
  }
}

export class DustSystem {
  constructor(scene, palette = null) {
    const C = DUST_CONFIG;
    const P = { ...DEFAULT_DUST_PALETTE, ...(palette ?? {}) };
    this.colors = {
      road: toColors(P.road), offroad: toColors(P.offroad),
      roadBits: toColors(P.roadBits), offroadBits: toColors(P.offroadBits),
    };
    this.dust = new ParticlePool(
      scene,
      new THREE.IcosahedronGeometry(0.5, 0),
      new THREE.MeshStandardMaterial({
        color: '#ffffff', flatShading: true, roughness: 1,
        emissive: '#4a4434',   // vaalentaa varjon puolta: pöly näyttää kevyeltä
        transparent: true, opacity: C.opacity, depthWrite: false,
      }),
      C.maxDust,
      { drag: 2.6, gravity: 0.3, grow: true, fade: true },
    );
    this.debris = new ParticlePool(
      scene,
      new THREE.DodecahedronGeometry(0.5, 0),
      new THREE.MeshStandardMaterial({ color: '#ffffff', flatShading: true, roughness: 1 }),
      C.maxDebris,
      { drag: 0.5, gravity: -14, grow: false },
    );
    this.dustAcc = [0, 0, 0, 0];
    this.debrisAcc = [0, 0, 0, 0];

    // Uudelleenkäytettävät apuoliot
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._p = new THREE.Vector3();
    this._s = new THREE.Vector3();
    this._quat = new THREE.Quaternion();
    this._fwd = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._wf = new THREE.Vector3();
    this._wr = new THREE.Vector3();
  }

  /** Lisää pölyä auton renkaista. Kutsutaan kerran ruudunpäivityksessä. */
  emit(car, dt) {
    const C = DUST_CONFIG;
    const v = car.vehicle;
    const body = car.body;
    const lv = body.linvel();
    const av = body.angvel();
    const bt = body.translation();
    const r = body.rotation();
    this._quat.set(r.x, r.y, r.z, r.w);
    const fwd = this._fwd.set(1, 0, 0).applyQuaternion(this._quat);
    const right = this._right.set(0, 0, 1).applyQuaternion(this._quat);

    for (let i = 0; i < 4; i++) {
      if (!v.wheelIsInContact(i)) continue;
      const cp = v.wheelContactPoint(i);
      if (!cp) continue;
      const front = i < 2;

      // Renkaan kosketuskohdan nopeus: v + ω × r
      const rx = cp.x - bt.x, ry = cp.y - bt.y, rz = cp.z - bt.z;
      const vx = lv.x + av.y * rz - av.z * ry;
      const vy = lv.y + av.z * rx - av.x * rz;
      const vz = lv.z + av.x * ry - av.y * rx;

      // Renkaan oma suunta (etupyörät kääntyvät)
      const st = front ? car.steer : 0;
      const cs = Math.cos(st), sn = Math.sin(st);
      const wf = this._wf.copy(fwd).multiplyScalar(cs).addScaledVector(right, -sn);
      const wr = this._wr.copy(right).multiplyScalar(cs).addScaledVector(fwd, sn);
      const along = vx * wf.x + vy * wf.y + vz * wf.z;
      const lat = vx * wr.x + vy * wr.y + vz * wr.z;
      const speed = Math.abs(along);

      const onRoad = car.wheelOnRoad[i];
      const cruise = (onRoad ? C.cruise : C.cruiseOffroad) * speed;
      const slide = Math.max(0, Math.abs(lat) - C.slideThreshold) * C.slide;
      // Revitys vain vetävistä renkaista (etuveto: edessä, takaveto: takana)
      const driveShare = front ? car.config.driveFront : 1 - car.config.driveFront;
      const spin = Math.abs(car.throttle) > 0.05
        ? C.spin * Math.min(1, driveShare * 2) * Math.abs(car.throttle) * Math.max(0, 1 - speed / C.spinSpeed) * (speed > 0.3 || Math.abs(car.throttle) > 0.5 ? 1 : 0)
        : 0;
      const locked = (car.braking || (!front && car.handbraking)) && speed > 2;
      const lock = locked ? C.lock * speed : 0;
      const violent = slide + spin + lock;

      this.dustAcc[i] += (cruise + violent) * (onRoad ? 1 : 0.7) * dt;
      this.debrisAcc[i] += violent * C.debris * dt;

      // Revittäessä hiukkaset lentävät taaksepäin, luisussa sivulle
      const kick = spin > 0 ? -Math.sign(car.throttle) * (2 + spin * 0.08) : 0;
      const side = slide > 0 ? Math.sign(lat) * Math.min(slide * 0.05, 2) : 0;
      const intensity = Math.min(violent / 60, 1);

      while (this.dustAcc[i] >= 1) {
        this.dustAcc[i] -= 1;
        this.dust.spawn(
          cp.x + rnd(-0.25, 0.25), cp.y + 0.15, cp.z + rnd(-0.25, 0.25),
          vx * 0.25 + wf.x * kick * 0.5 + wr.x * side + rnd(-0.6, 0.6),
          rnd(0.5, 1.5) + intensity,
          vz * 0.25 + wf.z * kick * 0.5 + wr.z * side + rnd(-0.6, 0.6),
          rnd(1.0, 1.8) + intensity * 0.8,
          rnd(C.dustSize[0], C.dustSize[1]) + intensity * 0.5,
          pick(onRoad ? this.colors.road : this.colors.offroad),
        );
      }
      while (this.debrisAcc[i] >= 1) {
        this.debrisAcc[i] -= 1;
        this.debris.spawn(
          cp.x, cp.y + 0.1, cp.z,
          vx * 0.6 + wf.x * kick * 1.5 + wr.x * side * 2 + rnd(-1.2, 1.2),
          rnd(2, 4.5),
          vz * 0.6 + wf.z * kick * 1.5 + wr.z * side * 2 + rnd(-1.2, 1.2),
          rnd(0.45, 0.8),
          rnd(0.08, onRoad ? 0.16 : 0.22),
          pick(onRoad ? this.colors.roadBits : this.colors.offroadBits),
        );
      }
    }
  }

  update(dt, cameraPos) {
    const { _m, _q, _e, _p, _s } = this;
    this.dust.update(dt, cameraPos, _m, _q, _e, _p, _s);
    this.debris.update(dt, cameraPos, _m, _q, _e, _p, _s);
  }
}
