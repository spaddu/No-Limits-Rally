// Karttanäkymä (M-näppäin): kamera ylhäältä koko alueen yllä, auton nuoli
// ja tien reittipisteiden numerot. Auttaa reitin muokkaamisessa (roadPath.js).

import * as THREE from 'three';

function makeLabel(text, color = 'rgba(20, 40, 120, 0.85)', scale = 12) {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(32, 32, 28, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = `bold ${text.length > 2 ? 18 : 30}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 32, 34);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
  sprite.scale.set(scale, scale, 1);
  sprite.renderOrder = 10;
  return sprite;
}

export class MapView {
  constructor(scene, terrain, road, stage) {
    this.scene = scene;
    this.active = false;
    const k = terrain.size / 640;   // isommalla alueella kamera kauempana
    this.camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 10, 1500 * k);
    this.camera.position.set(0, 720 * k, 0.01);
    this.camera.lookAt(0, 0, 0);

    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);

    // Reittipisteiden numerot
    road.points.forEach(([x, z], i) => {
      const label = makeLabel(String(i));
      label.position.set(x, terrain.heightAt(x, z) + 20, z);
      this.group.add(label);
    });

    // Lähtö ja maali
    if (stage) {
      for (const [s, text, color] of [[stage.startS, 'START', 'rgba(31, 122, 58, 0.95)'], [stage.finishS, 'FINISH', 'rgba(179, 32, 42, 0.95)']]) {
        const label = makeLabel(text, color, 20);
        label.position.set(road.xs[s], road.hs[s] + 28, road.zs[s]);
        this.group.add(label);
      }
    }

    // Auton nuoli
    const arrowGeo = new THREE.ConeGeometry(5, 14, 3).rotateZ(-Math.PI / 2); // kärki +X
    this.arrow = new THREE.Mesh(arrowGeo, new THREE.MeshBasicMaterial({ color: '#ffdd00', depthTest: false }));
    this.arrow.renderOrder = 11;
    this.group.add(this.arrow);
  }

  toggle() {
    this.active = !this.active;
    this.group.visible = this.active;
    if (this.active) {
      this.savedFog = this.scene.fog;
      this.scene.fog = null;
    } else {
      this.scene.fog = this.savedFog;
    }
  }

  update(car) {
    if (!this.active) return;
    this.arrow.position.set(car.position.x, car.position.y + 25, car.position.z);
    this.arrow.rotation.set(0, car.heading(), 0);
  }

  resize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
  }
}
