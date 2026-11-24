// =============================================================================
//  AUTOT – valikossa näkyvät autot
// =============================================================================
//  Jokaisella autolla on config-kohdassa kaikki ajosäädöt. Tärkeimmät erot:
//    driveFront  vetävien renkaiden jako: 1 = etuveto, 0 = takaveto, 0.4 = neliveto
//    engineForce moottorin voima (keskimäärin per rengas)
//    mass        massa (kg)
//    friction*   renkaiden pito
//    tractionControl luistonesto 0…1 (car.js)
//  model = placeholder-mallin tyyli ('hatch', 'retro', 'wrc') ja väri.
//  stats = valikon palkit (0–5), puhtaasti näyttöä varten.
// =============================================================================

export const CARS = [
  {
    id: 'etuveto',
    name: 'FWD Hatchback',
    drive: 'Front-wheel drive',
    description: 'Light and grippy, easy to drive, but the least power',
    color: '#2350b8',
    model: { style: 'hatch', color: '#2350b8' },
    stats: { power: 2, grip: 5, agility: 4 },
    // Moottorin ääni (audio.js): kireä ja kirkas nelonen
    sound: { cylinders: 4, idle: 950, redline: 7400, tone: 1.15, rough: 0.12, volume: 0.9, turbo: 0, pops: 0.15 },
    config: {
        mass: 1000,
        centerOfMassY: -0.7,          // epärealistisen matala painopiste = auto ei kaadu helposti
        chassisHalf: { x: 1.9, y: 0.25, z: 0.8 },

        wheelRadius: 0.42,
        wheelWidth: 0.34,
        wheelX: 1.25,                 // akselien etäisyys keskeltä
        wheelZ: 0.86,                 // renkaiden etäisyys keskeltä sivulle
        wheelY: -0.25,                // jousituksen kiinnityskohta

        suspensionRest: 0.45,         // jousen lepopituus
        suspensionTravel: 0.3,        // suurin joustomatka
        suspensionStiffness: 30,
        suspensionCompression: 3.2,   // vaimennus puristuessa (pienempi = pomppivampi)
        suspensionRelaxation: 3.6,    // vaimennus palautuessa
        maxSuspensionForce: 100000,

        frictionFront: 1.15,
        frictionRear: 1.2,
        frictionHandbrake: 0.4,

        driveFront: 1.0,              // vetävien renkaiden jako: 1 = etuveto, 0 = takaveto
        tractionControl: 0,           // luistonesto 0…1 (0 = pois, 1 = puolet pidosta varataan ohjaukselle)
        engineForce: 3000,            // keskimäärin per rengas (koko voima = 4 ×)
        reverseForce: 2200,
        maxSpeed: 25,                 // m/s (~115 km/h)
        maxReverseSpeed: 8,

        brake: 50,
        coastBrake: 1.2,              // hidastuu itsestään kun kaasu ei ole pohjassa
        holdBrake: 40,                // pitää auton paikallaan rinteessä
        handbrake: 60,

        maxSteer: 0.5,               // rad paikallaan
        minSteer: 0.1,                // rad vähintään
        steerFalloff: 12,             // m/s; kääntökulma puolittuu tällä nopeudella
        steerSpeed: 10,

        airLevel: 4000,               // Nm, ilmassa auto oikaisee itseään
        airLevelDamping: 1200,
        airYaw: 1500,                 // Nm, ilmassa A/D kääntää autoa

        // Alusta: soratiellä käytetään yllä olevia pitoarvoja, maastossa näitä kertoimia
        offroadGrip: 0.85,            // pidon kerroin tien ulkopuolella
        offroadDrag: 0.12,            // vierintävastus tien ulkopuolella (1/s): hidastaa ja laskee huippunopeutta
    },
  },
  {
    id: 'takaveto',
    name: 'Retro RWD',
    drive: 'Rear-wheel drive',
    description: 'A wild and powerful 80s beast with a lively rear end',
    color: '#c51f2a',
    // color = korin pohjaväri, accent = katto, konepelti ja kylkiraita, accent2 = takakyljen raita
    model: { style: 'retro', color: '#f1efe8', accent: '#c51f2a', accent2: '#1d4ea3' },
    stats: { power: 5, grip: 2, agility: 3 },
    // Moottorin ääni: matala, rouhea ja epätasaisesti käyvä 70-luvun kone
    sound: { cylinders: 4, idle: 780, redline: 6300, tone: 0.75, rough: 0.85, volume: 1.05, turbo: 0, pops: 1.0 },
    config: {
        mass: 1100,
        centerOfMassY: -0.7,          // epärealistisen matala painopiste = auto ei kaadu helposti
        chassisHalf: { x: 1.9, y: 0.25, z: 0.8 },

        wheelRadius: 0.42,
        wheelWidth: 0.34,
        wheelX: 1.25,                 // akselien etäisyys keskeltä
        wheelZ: 0.86,                 // renkaiden etäisyys keskeltä sivulle
        wheelY: -0.25,                // jousituksen kiinnityskohta

        suspensionRest: 0.45,         // jousen lepopituus
        suspensionTravel: 0.3,        // suurin joustomatka
        suspensionStiffness: 30,
        suspensionCompression: 3.2,   // vaimennus puristuessa (pienempi = pomppivampi)
        suspensionRelaxation: 3.6,    // vaimennus palautuessa
        maxSuspensionForce: 100000,

        frictionFront: 1.1,
        frictionRear: 1.0,
        frictionHandbrake: 0.35,

        driveFront: 0.0,              // vetävien renkaiden jako: 1 = etuveto, 0 = takaveto
        tractionControl: 0,           // luistonesto 0…1 (0 = pois, 1 = puolet pidosta varataan ohjaukselle)
        engineForce: 5200,            // keskimäärin per rengas (koko voima = 4 ×)
        reverseForce: 3200,
        maxSpeed: 26,                 // m/s (~115 km/h)
        maxReverseSpeed: 8,

        brake: 50,
        coastBrake: 1.2,              // hidastuu itsestään kun kaasu ei ole pohjassa
        holdBrake: 40,                // pitää auton paikallaan rinteessä
        handbrake: 60,

        maxSteer: 0.6,               // rad paikallaan
        minSteer: 0.1,                // rad vähintään
        steerFalloff: 15,             // m/s; kääntökulma puolittuu tällä nopeudella
        steerSpeed: 11,

        airLevel: 4000,               // Nm, ilmassa auto oikaisee itseään
        airLevelDamping: 1200,
        airYaw: 1500,                 // Nm, ilmassa A/D kääntää autoa

        // Alusta: soratiellä käytetään yllä olevia pitoarvoja, maastossa näitä kertoimia
        offroadGrip: 0.85,            // pidon kerroin tien ulkopuolella
        offroadDrag: 0.12,            // vierintävastus tien ulkopuolella (1/s): hidastaa ja laskee huippunopeutta
    },
  },
  {
    id: 'wrc',
    name: 'WRC AWD',
    drive: 'All-wheel drive',
    description: 'Modern rally weapon: strong acceleration and controllable slides',
    color: '#d8342c',
    // color = keula ja punaiset raidat, body = muu kori, roof = katto
    model: { style: 'wrc', color: '#d8262c', body: '#25272c', roof: '#f1f1ef' },
    stats: { power: 4, grip: 3, agility: 5 },
    // Moottorin ääni: korkeat kierrokset, turbon vihellys ja pamahdukset kaasua nostettaessa
    sound: { cylinders: 4, idle: 1100, redline: 8200, tone: 1, rough: 0.42, volume: 1, turbo: 1, pops: 1 },
    config: {
        mass: 1300,
        centerOfMassY: -0.7,          // epärealistisen matala painopiste = auto ei kaadu helposti
        chassisHalf: { x: 1.9, y: 0.25, z: 0.8 },

        wheelRadius: 0.42,
        wheelWidth: 0.34,
        wheelX: 1.25,                 // akselien etäisyys keskeltä
        wheelZ: 0.86,                 // renkaiden etäisyys keskeltä sivulle
        wheelY: -0.25,                // jousituksen kiinnityskohta

        suspensionRest: 0.45,         // jousen lepopituus
        suspensionTravel: 0.3,        // suurin joustomatka
        suspensionStiffness: 30,
        suspensionCompression: 3.2,   // vaimennus puristuessa (pienempi = pomppivampi)
        suspensionRelaxation: 3.6,    // vaimennus palautuessa
        maxSuspensionForce: 100000,

        frictionFront: 1.1,
        frictionRear: 0.95,
        frictionHandbrake: 0.4,

        driveFront: 0.4,              // vetävien renkaiden jako: 1 = etuveto, 0 = takaveto
        tractionControl: 0.0,           // luistonesto 0…1 (0 = pois, 1 = puolet pidosta varataan ohjaukselle)
        engineForce: 4600,            // keskimäärin per rengas (koko voima = 4 ×)
        reverseForce: 3200,
        maxSpeed: 30,                 // m/s (~115 km/h)
        maxReverseSpeed: 12,

        brake: 80,
        coastBrake: 1.2,              // hidastuu itsestään kun kaasu ei ole pohjassa
        holdBrake: 40,                // pitää auton paikallaan rinteessä
        handbrake: 60,

        maxSteer: 1.2,               // rad paikallaan
        minSteer: 0.1,                // rad vähintään
        steerFalloff: 20,             // m/s; kääntökulma puolittuu tällä nopeudella
        steerSpeed: 11,

        airLevel: 4000,               // Nm, ilmassa auto oikaisee itseään
        airLevelDamping: 1200,
        airYaw: 1500,                 // Nm, ilmassa A/D kääntää autoa

        // Alusta: soratiellä käytetään yllä olevia pitoarvoja, maastossa näitä kertoimia
        offroadGrip: 0.85,            // pidon kerroin tien ulkopuolella
        offroadDrag: 0.12,            // vierintävastus tien ulkopuolella (1/s): hidastaa ja laskee huippunopeutta
    },
  },
  {
    id: 'truck',
    name: 'Rally Raid Truck',
    drive: 'Four-wheel drive',
    description: 'Heavy desert truck: slow to turn, but rough ground barely slows it',
    color: '#1f5fc4',
    // color = sininen pohja, cab = ohjaamo, accent = vaaleansininen raita, stripe = keltainen raita
    model: { style: 'truck', color: '#1f5fc4', cab: '#eef0ec', accent: '#5cb6f0', stripe: '#f2c230', trim: '#163f8c' },
    stats: { power: 3, grip: 4, agility: 1 },
    // Moottorin ääni: matalakierroksinen V8-diesel, iso turbo, nakutus, moottorijarru ja paineilmajarrut
    sound: {
      cylinders: 8, idle: 620, redline: 2700, gears: [0.14, 0.25, 0.38, 0.52, 0.67, 0.83, 1.0],
      tone: 0.85, rough: 0.6, volume: 1.3, turbo: 1, turboPitch: 0.42, pops: 0,
      diesel: 1, jake: 0.75, airBrake: 1, inertia: 0.55,
    },
    // Takaa seuraava kamera kauempana ja korkeammalla, jotta iso auto ei peitä tietä
    camera: { distance: 11.5, height: 4.6, lookHeight: 1.9 },
    config: {
        mass: 2400,
        centerOfMassY: -1.0,          // matala painopiste: korkea auto ei silti kaadu helposti
        inertia: { x: 1300, y: 5600, z: 4800 },   // hitausmomentit (kallistus, kääntyminen, nyökkäys)
        chassisHalf: { x: 2.95, y: 0.45, z: 1.15 },
        cabinCollider: { x: -0.02, y: 1.12, hx: 2.9, hy: 0.67, hz: 1.15 },   // ohjaamo ja laatikko

        wheelRadius: 0.62,
        wheelWidth: 0.46,
        wheelX: 1.85,
        wheelZ: 1.0,
        wheelY: -0.35,

        suspensionRest: 0.6,          // pitkä joustovara
        suspensionTravel: 0.45,
        suspensionStiffness: 26,
        suspensionCompression: 3.4,
        suspensionRelaxation: 3.8,
        maxSuspensionForce: 260000,

        frictionFront: 1.15,
        frictionRear: 1.15,
        frictionHandbrake: 0.45,

        driveFront: 0.45,             // neliveto
        tractionControl: 0,
        engineForce: 5200,            // raskas: kiihtyy hitaammin kuin autot
        reverseForce: 3600,
        maxSpeed: 28,                 // m/s (~100 km/h)
        maxReverseSpeed: 8,

        brake: 95,
        coastBrake: 2.2,
        holdBrake: 75,
        holdSpeed: 1.5,               // m/s: tätä hitaammin ilman kaasua paineilmajarrut pitävät paikallaan
        handbrake: 110,

        maxSteer: 0.55,
        minSteer: 0.08,
        steerFalloff: 12,
        steerSpeed: 7,                // ohjaus kääntyy hitaammin

        airLevel: 9000,
        airLevelDamping: 2800,
        airYaw: 3400,

        offroadGrip: 0.97,            // isot nappularenkaat pitävät maastossakin
        offroadDrag: 0.05,

        spawnLift: 1.65,              // korkeampi auto: lähtöpaikalla korkeammalle tien pinnasta
        wadeDepth: 1.0,               // kahlaa syvemmässä vedessä kuin autot
        previewSuspension: 0.52,      // valikon kuvassa jouset ajoasennossa
    },
  },
];
