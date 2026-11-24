// =============================================================================
//  RALLIPÄTKÄ – muokkaa vapaasti!
// =============================================================================
//
//  Tie kulkee pehmeänä käyränä alla olevien pisteiden kautta ensimmäisestä
//  viimeiseen. (closed: true tekisi siitä lenkin.)
//
//  - Pisteet ovat [x, z] metreinä. Koko alue on -320…320, mutta reunavuoret
//    alkavat noin ±256 m kohdalla, joten pidä pisteet välillä ±240.
//  - +x on itään (oikealle kartalla), +z etelään (alas kartalla).
//  - Auto aloittaa tien alusta, ja ajanotto alkaa lähtöviivalta (startAt).
//    Maaliviiva on finishAt metrin päässä tien lopusta (negatiivinen luku),
//    jotta maalin jälkeen jää tilaa jarruttaa.
//  - Pidä tien eri osuudet vähintään ~30 m päässä toisistaan, muuten niiden
//    luiskat sotkeutuvat keskenään.
//  - Tiukat mutkat syntyvät, kun kolme peräkkäistä pistettä muodostavat
//    terävän kulman. Liian terävä kulma tekee mutkasta mahdottoman.
//
//  Pelissä M-näppäin näyttää kartan, jossa pisteiden numerot näkyvät.
// =============================================================================

export const ROAD = {
  closed: false,     // false = pätkä alusta loppuun, true = lenkki
  startAt: 15,       // lähtöviiva (m tien alusta)
  finishAt: -50,     // maaliviiva (m tien lopusta, negatiivinen)

  width: 6,          // tien leveys (m)
  shoulder: 1.5,     // tasainen piennar tien molemmin puolin (m)
  blend: 7,          // luiskan leveys, jolla tie liittyy maastoon (m)
  smoothing: 3,      // pituuskaltevuuden tasoitus (m): suurempi = tasaisempi tie
  maxGrade: 0.35,    // suurin nousu tai lasku (0.35 = 35 %)
  spacing: 1,        // näytteiden väli käyrällä (m)

  points: [
    [-250, 135],  // 0  lähtöalue
    [-215, 140],  // 1  lähtöviiva tämän välissä
    [-185, 110],  // 2  ensimmäinen nousu
    [-205, 70],   // 3
    [-235, 40],   // 4
    [-215, 5],    // 5
    [-170, 15],   // 6
    [-150, -20],  // 7
    [-195, -45],  // 8
    [-240, -70],  // 9  laakso
    [-238, -115], // 10
    [-205, -150], // 11
    [-165, -138], // 12 mäen laki
    [-130, -165], // 13
    [-95, -130],  // 14
    [-60, -150],  // 15
    [-30, -115],  // 16
    [-45, -80],   // 17 neulansilmä
    [-10, -55],   // 18
    [30, -75],    // 19
    [70, -60],    // 20
    [95, -20],    // 21 jyrkkä lasku
    [130, -5],    // 22
    [165, -30],   // 23
    [205, -10],   // 24 jatko etelään
    [215, 40],    // 25
    [180, 75],    // 26
    [205, 120],   // 27
    [220, 165],   // 28
    [175, 200],   // 29
    [130, 170],   // 30
    [95, 215],    // 31
    [45, 205],    // 32
    [20, 160],    // 33
    [55, 120],    // 34
    [25, 75],     // 35
    [45, 35],     // 36 lenkki kartan keskellä
    [0, 10],      // 37
    [-45, 40],    // 38
    [-30, 90],    // 39
    [-60, 140],   // 40
    [-105, 165],  // 41
    [-120, 210],  // 42
    [-70, 230],   // 43 tien loppu (maali ennen tätä)
  ],
};
