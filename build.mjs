// Rakentaa pelin dist-kansioon palvelinta varten.
//
//   npm run build   kertarakennus (minifioitu)
//   npm run watch   rakentaa uudelleen aina kun js/, index.html tai style.css muuttuu,
//                   käynnistää palvelimen (http://localhost:3000) ja päivittää sivun
//                   itsestään js-muutosten jälkeen
//
// esbuild lähtee js/main.js:stä ja seuraa import-lauseita, joten kaikki pelin
// tiedostot sekä Three.js ja Rapier (node_modules) päätyvät yhteen tiedostoon
// dist/main.min.js. index.html kopioidaan ilman importmapia; style.css, manifest.webmanifest
// ja images/ sellaisenaan.

import * as esbuild from 'esbuild';
import fs from 'node:fs';
import os from 'node:os';

const OUT = 'dist';
const watch = process.argv.includes('--watch');

/** Kopioi index.html (importmap pois, skripti osoittaa bundleen), style.css ja images-kansion. */
function copyStatic() {
  let html = fs.readFileSync('index.html', 'utf8')
    .replace(/\s*<script type="importmap">[\s\S]*?<\/script>/, '')
    .replace('src="js/main.js"', 'src="main.min.js"');
  // Seurantatilassa sivu päivittyy itsestään, kun js-koodi muuttuu (vain localhostissa)
  if (watch) html = html.replace('</body>', `  <script>if (location.hostname === 'localhost') new EventSource('/esbuild').addEventListener('change', () => location.reload());</script>\n</body>`);
  if (html.includes('js/main.js')) throw new Error('index.html: skriptin polkua ei löytynyt');
  fs.writeFileSync(`${OUT}/index.html`, html);
  fs.copyFileSync('style.css', `${OUT}/style.css`);
  fs.copyFileSync('manifest.webmanifest', `${OUT}/manifest.webmanifest`);
  copyImages();
}

/** Kopioi images-kansion distiin (vain uudet tai muuttuneet tiedostot). */
function copyImages() {
  if (!fs.existsSync('images')) return;
  fs.cpSync('images', `${OUT}/images`, {
    recursive: true,
    filter: (src) => {
      const dst = `${OUT}/${src.replace(/\\/g, '/')}`;
      if (!fs.existsSync(dst) || fs.statSync(src).isDirectory()) return true;
      return fs.statSync(src).mtimeMs > fs.statSync(dst).mtimeMs;
    },
  });
}

const time = () => new Date().toLocaleTimeString('fi-FI');

// Kertoo jokaisen rakennuksen tuloksen ja kopioi samalla html:n ja css:n
const report = {
  name: 'report',
  setup(build) {
    build.onEnd((result) => {
      if (result.errors.length) return console.log(`[${time()}] Virheitä, dist ei päivittynyt.`);
      copyStatic();
      const kb = (fs.statSync(`${OUT}/main.min.js`).size / 1024).toFixed(0);
      console.log(`[${time()}] Valmis: ${OUT}/main.min.js (${kb} kt)`);
    });
  },
};

const options = {
  entryPoints: ['js/main.js'],
  outfile: `${OUT}/main.min.js`,
  bundle: true,
  format: 'esm',          // main.js käyttää top-level awaitia
  target: 'es2022',
  minify: true,
  sourcemap: true,
  legalComments: 'none',
  logLevel: 'warning',
  plugins: [report],
};

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT);

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  // Palvelin dist-kansiolle; jos portti on varattu (esim. npx serve), kokeillaan seuraavaa
  let server = null;
  for (let port = 3000; port < 3010 && !server; port++) {
    try { server = await ctx.serve({ servedir: OUT, port }); } catch { /* portti varattu */ }
  }
  if (server) {
    console.log(`Peli: http://localhost:${server.port}`);
    // Puhelimella testaamista varten: koneen osoitteet lähiverkossa
    const lan = Object.values(os.networkInterfaces()).flat()
      .filter((a) => a && a.family === 'IPv4' && !a.internal)
      .map((a) => `http://${a.address}:${server.port}`);
    if (lan.length) console.log(`Puhelimella (sama wifi): ${lan.join('  ')}`);
  }
  else console.log('Palvelinta ei voitu käynnistää (portit 3000–3009 varattuja).');
  // index.html, style.css ja kuvat eivät ole esbuildin seurannassa: kopioidaan ne itse muuttuessaan
  for (const f of ['index.html', 'style.css', 'manifest.webmanifest']) {
    let timer;
    fs.watch(f, () => {
      clearTimeout(timer);
      timer = setTimeout(() => { copyStatic(); console.log(`[${time()}] ${f} kopioitu`); }, 100);
    });
  }
  if (fs.existsSync('images')) {
    let timer;
    fs.watch('images', () => {
      clearTimeout(timer);
      timer = setTimeout(() => { copyImages(); console.log(`[${time()}] images/ kopioitu`); }, 200);
    });
  }
  console.log('Seurataan muutoksia… (Ctrl+C lopettaa)');
} else {
  await esbuild.build(options);
}
