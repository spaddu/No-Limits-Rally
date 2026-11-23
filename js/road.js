// Tien keskilinja ja korkeusprofiili reittipisteistä.
// Tie voi olla avoin pätkä (closed: false) tai suljettu lenkki (closed: true).
// Ei riipu Three.js:stä, joten tätä voi ajaa myös Nodella.

/** Centripetaalinen Catmull-Rom -piste janalla p1→p2 (ei lenkkejä eikä teräviä silmukoita). */
function catmullRom(p0, p1, p2, p3, t) {
  const knot = (a, b) => Math.max(Math.sqrt(Math.hypot(b[0] - a[0], b[1] - a[1])), 1e-4);
  const t0 = 0;
  const t1 = t0 + knot(p0, p1);
  const t2 = t1 + knot(p1, p2);
  const t3 = t2 + knot(p2, p3);
  const tt = t1 + (t2 - t1) * t;
  const mix = (a, b, ta, tb) => {
    const w = (tt - ta) / (tb - ta);
    return [a[0] + (b[0] - a[0]) * w, a[1] + (b[1] - a[1]) * w];
  };
  const a1 = mix(p0, p1, t0, t1);
  const a2 = mix(p1, p2, t1, t2);
  const a3 = mix(p2, p3, t2, t3);
  const b1 = mix(a1, a2, t0, t2);
  const b2 = mix(a2, a3, t1, t3);
  return mix(b1, b2, t1, t2);
}

/**
 * Rakentaa tien: tasavälein näytteistetty keskilinja (xs, zs), suuntavektorit (tx, tz)
 * ja tasoitettu korkeusprofiili (hs). naturalHeight(x, z) antaa maaston korkeuden ilman tietä.
 */
export function buildRoad(def, naturalHeight) {
  const P = def.points;
  const n = P.length;
  const closed = !!def.closed;

  // Avoimen tien päihin peilatut apupisteet, jotta käyrä alkaa ja loppuu suoraan
  const at = (i) => {
    if (closed) return P[(i + n) % n];
    if (i < 0) return [2 * P[0][0] - P[1][0], 2 * P[0][1] - P[1][1]];
    if (i >= n) return [2 * P[n - 1][0] - P[n - 2][0], 2 * P[n - 1][1] - P[n - 2][1]];
    return P[i];
  };

  // 1) Tiheä käyrä
  const dense = [];
  const STEPS = 60;
  const segments = closed ? n : n - 1;
  for (let i = 0; i < segments; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    for (let s = 0; s < STEPS; s++) dense.push(catmullRom(p0, p1, p2, p3, s / STEPS));
  }
  dense.push(closed ? dense[0] : P[n - 1]);

  // 2) Tasavälinen näytteistys kaaren pituuden mukaan
  const cum = [0];
  for (let i = 1; i < dense.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(dense[i][0] - dense[i - 1][0], dense[i][1] - dense[i - 1][1]));
  }
  const length = cum[cum.length - 1];
  const intervals = Math.max(8, Math.round(length / def.spacing));
  const spacing = length / intervals;
  const count = closed ? intervals : intervals + 1;   // avoimella tiellä myös loppupiste
  const xs = new Float32Array(count);
  const zs = new Float32Array(count);
  let k = 0;
  for (let s = 0; s < count; s++) {
    const target = Math.min(s * spacing, length);
    while (k < cum.length - 2 && cum[k + 1] < target) k++;
    const w = Math.min(1, (target - cum[k]) / (cum[k + 1] - cum[k] || 1));
    xs[s] = dense[k][0] + (dense[k + 1][0] - dense[k][0]) * w;
    zs[s] = dense[k][1] + (dense[k + 1][1] - dense[k][1]) * w;
  }

  // Indeksi: lenkillä kiertää ympäri, pätkällä jää päihin
  const idx = closed
    ? (i) => ((i % count) + count) % count
    : (i) => Math.min(Math.max(i, 0), count - 1);

  // 3) Suuntavektorit
  const tx = new Float32Array(count);
  const tz = new Float32Array(count);
  for (let s = 0; s < count; s++) {
    const a = idx(s - 1), b = idx(s + 1);
    const dx = xs[b] - xs[a], dz = zs[b] - zs[a];
    const l = Math.hypot(dx, dz) || 1;
    tx[s] = dx / l;
    tz[s] = dz / l;
  }

  // 4) Korkeusprofiili: maaston korkeus, tasoitettuna ja jyrkkyys rajattuna
  let hs = new Float32Array(count);
  for (let s = 0; s < count; s++) hs[s] = naturalHeight(xs[s], zs[s]);

  // Sillat (def.bridges = [{ from, to }] metreinä tien alusta): suora kansi päiden välillä,
  // jolloin tie ei laskeudu kanjoniin vaan kulkee sen yli
  const bridges = (def.bridges ?? []).map((b) => ({
    s0: idx(Math.round(b.from / spacing)),
    s1: idx(Math.round(b.to / spacing)),
  }));
  const straightDeck = () => {
    for (const { s0, s1 } of bridges) {
      for (let s = s0 + 1; s < s1; s++) hs[s] = hs[s0] + (hs[s1] - hs[s0]) * ((s - s0) / (s1 - s0));
    }
  };
  straightDeck();

  const smooth = (arr, radius) => {
    const out = new Float32Array(count);
    for (let s = 0; s < count; s++) {
      let sum = 0;
      for (let o = -radius; o <= radius; o++) sum += arr[idx(s + o)];
      out[s] = sum / (2 * radius + 1);
    }
    return out;
  };
  const radius = Math.max(1, Math.round(def.smoothing / spacing));
  for (let pass = 0; pass < 3; pass++) hs = smooth(hs, radius);

  const maxStep = def.maxGrade * spacing;
  const laps = closed ? 2 : 1;
  for (let iter = 0; iter < 6; iter++) {
    for (let s = 0; s < (count - (closed ? 0 : 1)) * laps; s++) {   // eteenpäin
      const a = idx(s), b = idx(s + 1);
      hs[b] = Math.min(Math.max(hs[b], hs[a] - maxStep), hs[a] + maxStep);
    }
    for (let s = (count - 1) * laps; s > 0; s--) {                    // taaksepäin
      const a = idx(s), b = idx(s - 1);
      hs[b] = Math.min(Math.max(hs[b], hs[a] - maxStep), hs[a] + maxStep);
    }
  }
  // Pyöristetään jyrkkyysrajauksen jättämät terävät harjanteet ja notkot
  const kink = Math.max(1, Math.round(5 / spacing));
  for (let pass = 0; pass < 2; pass++) hs = smooth(hs, kink);
  straightDeck();
  const bridgeSeg = new Uint8Array(count);   // 1 = näyte on sillalla
  for (const { s0, s1 } of bridges) bridgeSeg.fill(1, s0, s1 + 1);

  return {
    xs, zs, hs, tx, tz, count, length, spacing,
    closed,
    segCount: closed ? count : count - 1,   // janojen määrä (s → s+1)
    width: def.width,
    halfWidth: def.width / 2,
    shoulder: def.shoulder,
    blend: def.blend,
    points: P,
    bridges,
    bridgeSeg,
    startAt: def.startAt ?? 0,
    // Negatiivinen finishAt lasketaan tien lopusta
    finishAt: def.finishAt == null ? length : def.finishAt < 0 ? length + def.finishAt : def.finishAt,
  };
}
