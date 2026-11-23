// Näppäimistön luku. Käytetään e.code-arvoja, jotka eivät riipu näppäimistöasettelusta.
// Kosketusohjaus (touchControls.js) kirjoittaa samaan tilaan: polkimet samoihin
// totuusarvoihin ja ohjauksen analogisena arvona state.steer (−1 = oikea … 1 = vasen, null = ei käytössä).

const KEYMAP = {
  KeyW: 'forward', ArrowUp: 'forward',
  KeyS: 'back', ArrowDown: 'back',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  Space: 'handbrake',
};

export class Input {
  constructor() {
    this.state = { forward: false, back: false, left: false, right: false, handbrake: false, steer: null };
    this.resetRequested = false;
    this.roadRequested = false;
    this.mapToggled = false;
    this.restartRequested = false;
    this.menuRequested = false;
    this.soundToggled = false;

    addEventListener('keydown', (e) => {
      const key = KEYMAP[e.code];
      if (key) {
        this.state[key] = true;
        e.preventDefault();
      }
      if (e.repeat) return;
      if (e.code === 'KeyR') this.resetRequested = true;
      if (e.code === 'KeyT') this.roadRequested = true;
      if (e.code === 'KeyM') this.mapToggled = true;
      if (e.code === 'Enter' || e.code === 'NumpadEnter') this.restartRequested = true;
      if (e.code === 'Escape') this.menuRequested = true;
      if (e.code === 'KeyV') this.soundToggled = true;
    });

    addEventListener('keyup', (e) => {
      const key = KEYMAP[e.code];
      if (key) this.state[key] = false;
    });

    // Jos ikkuna menettää fokuksen, vapautetaan kaikki näppäimet
    addEventListener('blur', () => this.releaseAll());
  }

  /** Vapauttaa kaikki ohjaimet (näppäimet ja kosketus). */
  releaseAll() {
    for (const k in this.state) this.state[k] = false;
    this.state.steer = null;
  }

  consumeReset() {
    const r = this.resetRequested;
    this.resetRequested = false;
    return r;
  }

  consumeRoad() {
    const r = this.roadRequested;
    this.roadRequested = false;
    return r;
  }

  consumeRestart() {
    const r = this.restartRequested;
    this.restartRequested = false;
    return r;
  }

  consumeMenu() {
    const r = this.menuRequested;
    this.menuRequested = false;
    return r;
  }

  /** Unohtaa kertapainallukset (esim. valikosta palatessa). */
  clearEvents() {
    this.resetRequested = this.roadRequested = this.mapToggled = this.restartRequested = this.menuRequested = false;
  }

  consumeSound() {
    const r = this.soundToggled;
    this.soundToggled = false;
    return r;
  }

  consumeMap() {
    const r = this.mapToggled;
    this.mapToggled = false;
    return r;
  }
}
