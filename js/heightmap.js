// Maaston korkeusdata ilman grafiikkaa: luonnollinen maasto kohinasta,
// johon tie "rakennetaan" leikkauksineen ja penkereineen.
// Tiedosto ei riipu Three.js:stä, joten sitä voi ajaa myös Nodella.

import { createNoise2D, fbm, smoothstep } from './noise.js';
import { buildRoad } from './road.js';

export const TERRAIN_SIZE = 640;   // oletuskoko: metriä sivulla (radat voivat muuttaa: terrain.size)
export const CELL = 1.6;           // tarkimman ruudun koko (m)
export const CHUNK = 20;           // tarkkuuspalan koko ruutuina (32 m)
export const RENDER_CHUNK = 2;     // piirrettävä pala = 2 × 2 tarkkuuspalaa (64 m)

/**
 * Maaston tarkkuus palan etäisyyden mukaan tiestä: [etäisyys alle (m), ruutuaskel].
 * Askel 1 = 1,6 m ruudut, 2 = 3,2 m, 4 = 6,4 m. Kaukana tiestä maasto on harvempaa.
 * Tien muotoilu ulottuu n. 14 m päähän, joten sen kohdalla maasto on aina tarkinta.
 */
export const LOD_LEVELS = [[16, 1], [50, 2], [Infinity, 4]];

/** Maastoruudukko annetulle koolle: size (m), half, segments (ruutuja sivulla), cell, n (pisteitä sivulla). */
export function makeGrid(size = TERRAIN_SIZE) {
  const unit = CHUNK * RENDER_CHUNK;
  const segments = Math.max(1, Math.round(size / CELL / unit)) * unit;
  return { size, half: size / 2, segments, cell: size / segments, n: segments + 1 };
}

/**
 * Maaston oletusasetukset. Radat voivat muuttaa näitä (tracks.js):
 * seed vaihtaa koko maaston muodon, muut säätävät mäkien kokoa.
 */
export const DEFAULT_TERRAIN = {
  seed: null,         // null = rata 1:n alkuperäinen maasto, numero = uusi maasto
  size: TERRAIN_SIZE, // alueen koko (m); reunavuoret ovat aina reunoilla
  hills: 40,          // isojen mäkien korkeus (m)
  hillScale: 0.0095,  // isojen mäkien tiheys (suurempi = tiheämpiä mäkiä)
  ridges: 14,         // terävien harjanteiden korkeus (m)
  bumps: 2.4,         // pienten kumpareiden korkeus (m)
  rim: 40,            // reunavuorten korkeus (m)
  ridgeScale: [0.013, 0.013], // harjanteiden tiheys x- ja z-suunnassa (eri luvut = venytetyt dyynit)
  basins: [],         // painanteet [x, z, säde, syvyys], esim. keitaat
  plateaus: [],       // tasanteet [x, z, säde, korkeus], esim. kylä tai pyramidit
  lowland: null,      // alanko [dx, dz, siirtymä, leveys, kerroin]: suunnan (dx, dz) puolella maasto madaltuu
  canyons: [],        // kanjonit { points: [[x, z, syvyys], …], width }: uoma pisteiden kautta (width = puolileveys)
  terraces: null,     // kallioterassit [porras (m), jyrkän osan osuus 0…1]: maasto portaittain kuin mesat
  terraceMask: null,  // terassien alue [dx, dz, siirtymä, leveys] (kuten lowland); null = kaikkialla
  peaks: [],          // vuoret [x, z, säde, korkeus]: pehmeä kumpu
  island: null,       // saari meren keskellä (ks. alla); reunavuoria ei silloin ole
  lake: null,         // pitkä järvi pisteiden kautta (ks. alla)
};

/*
 * island = {
 *   shapes: [[x0, z0, x1, z1, säde], …]  saaren muoto kapseleina (jana + säde), rosoinen reuna
 *   beach   rannan korkeus merenpinnasta (m)      inland  matka, jolla mäet nousevat rannasta (m)
 *   depth   meren syvyys kaukana (m)              shelf   matalan rantaveden leveys (m)
 *   lift    mäkien nosto (m)                      noise   rantaviivan rosoisuus (m)
 * }
 * Merenpinta on korkeudella 0.
 *
 * lake = {
 *   points: [[x, z], …]  järven keskilinja       width   puolileveys (m), rantaviiva tässä
 *   level   vedenpinnan korkeus (m)             depth   syvyys keskellä (m)
 *   shore   matka, jolla maasto palaa luonnolliseksi (m)   rise  rantatöyrään nousu per metri
 *   noise   rantaviivan rosoisuus (m)
 * }
 * Järven ulkopuolella maasto pidetään vedenpinnan yläpuolella (ei lätäköitä muualle).
 */

/**
 * Radan maastoasetukset valmiina createNaturalHeightille. terrain.roadCanyon = { from, to, depth, width,
 * taperOut } tekee kanjonin, jonka pohjaa tie kulkee (from–to metreinä tien alusta): kanjoni seuraa tien
 * reittiä ja madaltuu lopussa taperOut-metrin matkalla, jolloin tie nousee kanjonista ylös.
 */
export function resolveTerrain(track) {
  const T = track.terrain ?? {};
  const rc = T.roadCanyon;
  if (!rc) return T;
  const r = buildRoad(track.road, () => 0);
  const from = rc.from ?? 0, to = rc.to ?? r.length;
  const s0 = Math.max(0, Math.round(from / r.spacing)), s1 = Math.min(r.count - 1, Math.round(to / r.spacing));
  const depthAt = (m) => rc.depth * smoothstep(from - 1, from + (rc.taperIn ?? 0), m) * (1 - smoothstep(to - (rc.taperOut ?? 60), to, m));
  const pts = [];
  if (s0 === 0) pts.push([r.xs[0] - r.tx[0] * 80, r.zs[0] - r.tz[0] * 80, rc.depth]);   // kanjoni jatkuu lähdön taakse
  for (let s = s0; s <= s1; s += 6) pts.push([r.xs[s], r.zs[s], s === 0 ? rc.depth : depthAt(s * r.spacing)]);
  return { ...T, canyons: [...(T.canyons ?? []), { points: pts, width: rc.width, floor: rc.floor }] };
}

/** Luo funktion naturalHeight(x, z): luonnollinen maasto ilman tietä. */
export function createNaturalHeight(params = {}) {
  const P = { ...DEFAULT_TERRAIN, ...params };
  const seeds = P.seed == null ? [1337, 9001, 4242, 777] : [P.seed, P.seed * 7 + 1, P.seed * 3 + 2, P.seed + 99];
  const hills = createNoise2D(seeds[0]);
  const ridges = createNoise2D(seeds[1]);
  const bumps = createNoise2D(seeds[2]);
  const rim = createNoise2D(seeds[3]);
  const coastA = createNoise2D(seeds[3] + 5);
  const coastB = createNoise2D(seeds[3] + 6);

  // Kanjonien janojen rajausalueet (nopea ohitus kaukana kanjonista)
  const canyonBoxes = P.canyons.map((c) => {
    const W = c.width;
    const segs = [];
    for (let i = 0; i < c.points.length - 1; i++) {
      const [ax, az] = c.points[i], [bx, bz] = c.points[i + 1];
      segs.push([Math.min(ax, bx) - W, Math.max(ax, bx) + W, Math.min(az, bz) - W, Math.max(az, bz) + W]);
    }
    return segs;
  });

  return function naturalHeight(x, z) {
    // Isot mäet ja laaksot
    let h = fbm(hills, x * P.hillScale, z * P.hillScale, 4, 2, 0.5) * P.hills;
    // Terävät harjanteet: kohinan "taitekohdat" nostetaan kapeiksi selänteiksi
    const rr = 1 - Math.abs(ridges(x * P.ridgeScale[0], z * P.ridgeScale[1]));
    h += rr * rr * rr * P.ridges - P.ridges * (5 / 14);
    // Pienemmät kumpareet, joista saa hyppyjä
    h += bumps(x * 0.05, z * 0.05) * P.bumps;

    // Alanko (esim. jokisuisto): toisella puolella maasto tasoittuu kertoimen verran
    if (P.lowland) {
      const [dx, dz, off, width, factor] = P.lowland;
      const t = smoothstep(off - width / 2, off + width / 2, x * dx + z * dz);
      h *= 1 + (factor - 1) * t;
    }

    // Tasanteet: maasto tasoittuu annettuun korkeuteen, reunoilla pehmeä siirtymä
    for (const [px, pz, pr, ph] of P.plateaus) {
      const d = Math.hypot(x - px, z - pz);
      if (d < pr) {
        const t = smoothstep(pr, pr * 0.6, d);
        h += (ph - h) * t;
      }
    }

    // Painanteet (keitaat): maasto laskee loivasti kohti keskustaa
    for (const [bx, bz, br, depth] of P.basins) {
      const d = Math.hypot(x - bx, z - bz);
      if (d < br) {
        const t = 1 - d / br;
        h -= depth * t * t * (3 - 2 * t);
      }
    }

    // Kanjonit: jyrkkäseinäinen uoma reittiviivaa pitkin, syvyys vaihtelee pisteittäin
    for (let ci = 0; ci < P.canyons.length; ci++) {
      const c = P.canyons[ci], boxes = canyonBoxes[ci];
      const pts = c.points, W = c.width, F = W * (c.floor ?? 0.45);
      let cut = 0;
      for (let i = 0; i < pts.length - 1; i++) {
        const bb = boxes[i];
        if (x < bb[0] || x > bb[1] || z < bb[2] || z > bb[3]) continue;
        const [ax, az, ad] = pts[i], [bx, bz, bd] = pts[i + 1];
        const dx = bx - ax, dz = bz - az;
        let t = ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1);
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const d = Math.hypot(ax + dx * t - x, az + dz * t - z);
        if (d >= W) continue;
        cut = Math.max(cut, (ad + (bd - ad) * t) * (1 - smoothstep(F, W, d)));
      }
      h -= cut;
    }

    // Kallioterassit: tasaiset penkereet ja jyrkät kalliojyrkänteet portain
    if (P.terraces) {
      const [step, riser] = P.terraces;
      const f = h / step, i = Math.floor(f);
      const ht = (i + smoothstep(1 - riser, 1, f - i)) * step;
      let m = 1;
      if (P.terraceMask) {
        const [dx, dz, off, width] = P.terraceMask;
        m = smoothstep(off - width / 2, off + width / 2, x * dx + z * dz);
      }
      h += (ht - h) * m;
    }

    // Vuoret
    for (const [px, pz, pr, ph] of P.peaks) {
      const t = 1 - Math.hypot(x - px, z - pz) / pr;
      if (t > 0) h += ph * t * t * (3 - 2 * t);
    }

    // Saari: rantaviiva kapseleista, ranta, matala rantavesi ja syvä meri
    if (P.island) {
      const I = P.island;
      let d = Infinity;
      for (const [ax, az, bx, bz, r] of I.shapes) {
        const dx = bx - ax, dz = bz - az;
        let t = ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1);
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        d = Math.min(d, Math.hypot(ax + dx * t - x, az + dz * t - z) - r);
      }
      d += coastA(x * 0.011, z * 0.011) * (I.noise ?? 16) + coastB(x * 0.045, z * 0.045) * 3;
      const land = (I.beach ?? 1.4) + Math.max(0, h + (I.lift ?? 0)) * smoothstep(0, I.inland ?? 45, -d);
      const sea = -0.6 - ((I.depth ?? 9) - 0.6) * smoothstep(0, I.shelf ?? 55, d);
      const t = smoothstep(-5, 5, d);   // 0 = maata, 1 = merta
      return land + (sea - land) * t;
    }

    // Reunoille nousevat vuoret rajaamaan alueen
    const edge = Math.max(Math.abs(x), Math.abs(z)) / (P.size / 2);
    const r = smoothstep(0.8, 1.0, edge);
    h += r * r * (P.rim + rim(x * 0.02, z * 0.02) * 15);

    // Järvi: laakso, jonka pohjalla vesi; rannat nousevat loivasti takaisin luonnolliseen maastoon
    if (P.lake) {
      const L = P.lake, W = L.width;
      let d = Infinity;
      for (let i = 0; i < L.points.length - 1; i++) {
        const [ax, az] = L.points[i], [bx, bz] = L.points[i + 1];
        const dx = bx - ax, dz = bz - az;
        let t = ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1);
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        d = Math.min(d, Math.hypot(ax + dx * t - x, az + dz * t - z));
      }
      d += coastA(x * 0.011, z * 0.011) * (L.noise ?? 10) + coastB(x * 0.045, z * 0.045) * 2;
      const profile = d < W
        ? L.level - L.depth * smoothstep(W, W * 0.35, d) - 0.4 * smoothstep(W, W - 3, d)
        : L.level + (d - W) * (L.rise ?? 0.12);
      const w = 1 - smoothstep(W + 8, W + (L.shore ?? 120), d);
      h += (profile - h) * w;
      if (d > W) h = Math.max(h, L.level + Math.min(0.7, (d - W) * 0.15));
    }

    return h;
  };
}

/**
 * Laskee korkeusruudukon, johon tie on muotoiltu, sekä etäisyyskentän
 * (jokaisen ruudukkopisteen etäisyys tien keskilinjaan).
 */
/**
 * pads = tasanteet tien varren pihoille: [{ x, z, r, falloff, h }]. Maasto tasoittuu
 * korkeuteen h säteellä r ja liittyy luonnolliseen maahan falloff-metrin matkalla.
 * baseHeightAt palauttaa maaston ilman tasanteita (maiseman satunnaissijoittelu pysyy ennallaan).
 */
export function buildHeightfield(road, naturalHeight, pads = [], grid = makeGrid()) {
  const { half: HALF, segments: SEGMENTS, cell: CELL, n: N, size: TERRAIN_SIZE } = grid;
  const heights = new Float32Array(N * N);   // [rivi z][sarake x]
  const roadDist = new Float32Array(N * N).fill(1e6);
  const roadH = new Float32Array(N * N);
  const onBridge = road.bridges?.length ? new Uint8Array(N * N) : null;   // lähin tienkohta on silta

  for (let i = 0; i < N; i++) {
    const z = -HALF + i * CELL;
    for (let j = 0; j < N; j++) {
      heights[i * N + j] = naturalHeight(-HALF + j * CELL, z);
    }
  }
  const base = pads.length ? heights.slice() : null;
  for (const p of pads) {
    for (let i = 0; i < N; i++) {
      const z = -HALF + i * CELL;
      if (Math.abs(z - p.z) > p.r + p.falloff) continue;
      for (let j = 0; j < N; j++) {
        const x = -HALF + j * CELL;
        const d = Math.hypot(x - p.x, z - p.z);
        if (d >= p.r + p.falloff) continue;
        const k = i * N + j;
        heights[k] += (p.h - heights[k]) * smoothstep(p.r + p.falloff, p.r, d);
      }
    }
  }

  // --- Etäisyyskenttä: käydään läpi tien janat ja niiden lähiruudut ------
  const flat = road.halfWidth + road.shoulder;  // tasainen osa keskilinjasta
  const reach = flat + road.blend + 2;          // kuinka kauas tie vaikuttaa
  const { xs, zs, hs, count } = road;
  for (let s = 0; s < road.segCount; s++) {
    const s2 = (s + 1) % count;
    const ax = xs[s], az = zs[s], bx = xs[s2], bz = zs[s2];
    const dx = bx - ax, dz = bz - az;
    const len2 = dx * dx + dz * dz || 1e-9;
    const j0 = Math.max(0, Math.floor((Math.min(ax, bx) - reach + HALF) / CELL));
    const j1 = Math.min(N - 1, Math.ceil((Math.max(ax, bx) + reach + HALF) / CELL));
    const i0 = Math.max(0, Math.floor((Math.min(az, bz) - reach + HALF) / CELL));
    const i1 = Math.min(N - 1, Math.ceil((Math.max(az, bz) + reach + HALF) / CELL));
    for (let i = i0; i <= i1; i++) {
      const pz = -HALF + i * CELL;
      for (let j = j0; j <= j1; j++) {
        const px = -HALF + j * CELL;
        let t = ((px - ax) * dx + (pz - az) * dz) / len2;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const qx = ax + dx * t - px;
        const qz = az + dz * t - pz;
        const d = Math.sqrt(qx * qx + qz * qz);
        const k = i * N + j;
        if (d < roadDist[k]) {
          roadDist[k] = d;
          roadH[k] = hs[s] + (hs[s2] - hs[s]) * t;
          if (onBridge) onBridge[k] = road.bridgeSeg[s] & road.bridgeSeg[s2];
        }
      }
    }
  }

  // --- Tie maastoon: tasainen tienpohja ja luiskat luonnolliseen maahan ---
  for (let k = 0; k < N * N; k++) {
    const d = roadDist[k];
    if (d >= reach) continue;
    const t = smoothstep(flat, flat + road.blend, d);
    if (onBridge && onBridge[k]) {
      // Sillan alla maastoa ei täytetä (kanjoni jää näkyviin), vain liian korkea maa leikataan
      heights[k] = Math.min(heights[k], roadH[k] - 0.6 + (heights[k] - roadH[k] + 0.6) * t);
      if (base) base[k] = Math.min(base[k], roadH[k] - 0.6 + (base[k] - roadH[k] + 0.6) * t);
      continue;
    }
    heights[k] = roadH[k] + (heights[k] - roadH[k]) * t;
    if (base) base[k] = roadH[k] + (base[k] - roadH[k]) * t;
  }

  // --- Tarkkuustasot: jokaiselle 32 m palalle ruutuaskel sen mukaan, kuinka lähellä tie on ---
  const NC = SEGMENTS / CHUNK;               // paloja sivulla
  const steps = new Uint8Array(NC * NC);
  for (let ci = 0; ci < NC; ci++) {
    for (let cj = 0; cj < NC; cj++) {
      const x0 = -HALF + cj * CHUNK * CELL, x1 = x0 + CHUNK * CELL;
      const z0 = -HALF + ci * CHUNK * CELL, z1 = z0 + CHUNK * CELL;
      const rectDist = (x, z) => Math.hypot(Math.max(x0 - x, 0, x - x1), Math.max(z0 - z, 0, z - z1));
      let d = Infinity;
      for (let k = 0; k < count; k += 2) d = Math.min(d, rectDist(xs[k], zs[k]));
      for (const p of pads) d = Math.min(d, Math.max(0, rectDist(p.x, p.z) - p.r - p.falloff));
      steps[ci * NC + cj] = LOD_LEVELS.find(([lim]) => d < lim)[1];
    }
  }
  // Saumat: tarkemman palan reunapisteet asetetaan harvemman naapurin reunaviivalle (ei rakoja)
  const stepAt = (ci, cj) => (ci < 0 || cj < 0 || ci >= NC || cj >= NC ? 0 : steps[ci * NC + cj]);
  const snapEdge = (arr, i0, j0, di, dj, sn) => {
    for (let t = 0; t <= CHUNK; t++) {
      const r = t % sn;
      if (!r) continue;
      const a = arr[(i0 + di * (t - r)) * N + j0 + dj * (t - r)];
      const b = arr[(i0 + di * (t - r + sn)) * N + j0 + dj * (t - r + sn)];
      arr[(i0 + di * t) * N + j0 + dj * t] = a + (b - a) * (r / sn);
    }
  };
  for (let ci = 0; ci < NC; ci++) {
    for (let cj = 0; cj < NC; cj++) {
      const st = steps[ci * NC + cj];
      const i0 = ci * CHUNK, j0 = cj * CHUNK;
      for (const [ni, nj, ei, ej, di, dj] of [
        [ci - 1, cj, i0, j0, 0, 1], [ci + 1, cj, i0 + CHUNK, j0, 0, 1],
        [ci, cj - 1, i0, j0, 1, 0], [ci, cj + 1, i0, j0 + CHUNK, 1, 0],
      ]) {
        const sn = stepAt(ni, nj);
        if (sn > st) for (const arr of base ? [heights, base] : [heights]) snapEdge(arr, ei, ej, di, dj, sn);
      }
    }
  }

  /** Korkeus samalla kolmiojaolla ja tarkkuudella kuin maastomesh, joten se vastaa pintaa tarkasti. */
  const sample = (arr, x, z) => {
    const gx = Math.min(Math.max((x + HALF) / CELL, 0), SEGMENTS - 1e-4);
    const gz = Math.min(Math.max((z + HALF) / CELL, 0), SEGMENTS - 1e-4);
    const st = steps[Math.floor(gz / CHUNK) * NC + Math.floor(gx / CHUNK)];
    const j = Math.floor(gx / st) * st;
    const i = Math.floor(gz / st) * st;
    const u = (gx - j) / st;
    const v = (gz - i) / st;
    const a00 = arr[i * N + j];
    const a10 = arr[i * N + j + st];
    const a01 = arr[(i + st) * N + j];
    const a11 = arr[(i + st) * N + j + st];
    if (u + v <= 1) return a00 + (a10 - a00) * u + (a01 - a00) * v;
    return a11 + (a01 - a11) * (1 - u) + (a10 - a11) * (1 - v);
  };
  /** Tarkka ruudukko ilman tarkkuustasoja (etäisyyskenttä). */
  const sampleFine = (arr, x, z) => {
    const gx = Math.min(Math.max((x + HALF) / CELL, 0), SEGMENTS - 1e-4);
    const gz = Math.min(Math.max((z + HALF) / CELL, 0), SEGMENTS - 1e-4);
    const j = Math.floor(gx);
    const i = Math.floor(gz);
    const u = gx - j;
    const v = gz - i;
    const a00 = arr[i * N + j];
    const a10 = arr[i * N + j + 1];
    const a01 = arr[(i + 1) * N + j];
    const a11 = arr[(i + 1) * N + j + 1];
    // Sama kolmiojako kuin maastomeshissä, joten korkeus vastaa pintaa tarkasti
    if (u + v <= 1) return a00 + (a10 - a00) * u + (a01 - a00) * v;
    return a11 + (a01 - a11) * (1 - u) + (a10 - a11) * (1 - v);
  };

  // --- Karkea etäisyyskenttä koko alueelle (8 m ruudut) maiseman sijoittelua varten
  const CC = 8;
  const CN = Math.round(TERRAIN_SIZE / CC) + 1;
  const coarse = new Float32Array(CN * CN);
  for (let i = 0; i < CN; i++) {
    const z = -HALF + i * CC;
    for (let j = 0; j < CN; j++) {
      const x = -HALF + j * CC;
      let best = Infinity;
      for (let s = 0; s < count; s += 2) {
        const d = (xs[s] - x) ** 2 + (zs[s] - z) ** 2;
        if (d < best) best = d;
      }
      coarse[i * CN + j] = Math.sqrt(best);
    }
  }
  const coarseAt = (x, z) => {
    const gx = Math.min(Math.max((x + HALF) / CC, 0), CN - 1.0001);
    const gz = Math.min(Math.max((z + HALF) / CC, 0), CN - 1.0001);
    const j = Math.floor(gx), i = Math.floor(gz);
    const u = gx - j, v = gz - i;
    const a = coarse[i * CN + j], b = coarse[i * CN + j + 1];
    const c = coarse[(i + 1) * CN + j], d = coarse[(i + 1) * CN + j + 1];
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
  };

  return {
    grid,
    lod: { chunk: CHUNK, count: NC, steps },
    /** Sillan kohdalla: kuinka paljon maa on kannen alapuolella (0 muualla). Maaston väritys käyttää. */
    bridgeGap: onBridge ? (k) => (onBridge[k] ? roadH[k] - heights[k] : 0) : null,
    heights,
    roadDist,
    /** Maaston korkeus kohdassa (x, z). */
    heightAt: (x, z) => sample(heights, x, z),
    /** Korkeus ilman pihojen tasanteita. */
    baseHeightAt: (x, z) => sample(base ?? heights, x, z),
    /** Vain tien lähikenttä (kaukana suuri luku); Harjun metsä on sijoiteltu tämän mukaan. */
    roadDistanceNearAt: (x, z) => sampleFine(roadDist, x, z),
    /** Etäisyys tien keskilinjaan (m). Tien lähellä tarkka, kauempana karkea arvio. */
    roadDistanceAt: (x, z) => {
      const d = sampleFine(roadDist, x, z);
      return d < reach - 1 ? d : Math.max(coarseAt(x, z), reach - 1);
    },
  };
}
