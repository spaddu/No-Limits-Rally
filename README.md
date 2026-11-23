# No Limits Rally

Pieni 3D-rallipeli: valitse rata ja auto valikosta ja aja pätkä
mäkien ja metsien keskellä mahdollisimman nopeasti.

## Käynnistys

Tarvitset Node.js:n. Asenna riippuvuudet kerran projektikansiossa:

```
npm install
```

Kehitys (lähdekoodi suoraan selaimeen, kirjastot CDN:stä):

```
npm run dev
```

Avaa sitten selaimessa http://localhost:3000.

## Rakennus palvelimelle (dist)

```
npm run build     kertarakennus
npm run watch     rakentaa, käynnistää palvelimen ja rakentaa uudelleen aina kun
                  tiedosto muuttuu (sama kuin start-js.bat)
npm run preview   kokeile valmista dist-kansiota osoitteessa http://localhost:3000
```

`build.mjs` ajaa esbuildin, joka lähtee `js/main.js`:stä ja seuraa import-lauseita.
Kaikki pelin tiedostot sekä Three.js ja Rapier (node_modules-kansiosta) päätyvät
yhteen minifioituun tiedostoon. Tulos:

- `dist/index.html` (ilman importmapia)
- `dist/style.css`
- `dist/images/` (latausruudun kuvat ja ikonit, kopioidaan `images/`-kansiosta)
- `dist/manifest.webmanifest` (kotivalikkoon lisäys puhelimella)
- `dist/main.min.js` ja `main.min.js.map` (lähdekartta selaimen debuggausta varten,
  palvelimelle ei ole pakko viedä)

Seurantatilassa peli aukeaa osoitteesta http://localhost:3000 (tai seuraavasta
vapaasta portista, jos 3000 on jo käytössä) ja sivu päivittyy itsestään, kun
js-koodi muuttuu. css- ja html-muutosten jälkeen päivitä sivu itse.

Palvelimelle kopioidaan dist-kansion sisältö. Kirjastojen versiot ovat
`package.json`:ssa; jos vaihdat versiota, vaihda se myös `index.html`:n importmapiin.

## Ohjaus

Pelin tekstit ovat englanniksi. Ohjeet näkyvät myös päävalikon alareunassa.

| Näppäin | Toiminto |
|---|---|
| W / ↑ | Kaasu |
| S / ↓ | Jarru, pysähtyneenä peruutus |
| A / D tai ← / → | Ohjaus (ilmassa: auton kääntö) |
| Välilyönti | Käsijarru |
| R | Nosta auto pystyyn |
| T | Takaisin tielle (lähimpään kohtaan) |
| M | Kartta (näyttää reitin ja reittipisteiden numerot) |
| Enter | Uusi yritys (auto lähtöviivalle, ajanotto nollaan) |
| Esc | Valikko (ajo pysähtyy, Esc uudelleen jatkaa) |
| V | Äänet päälle/pois (myös valikon Sound-napista; valinta muistetaan) |

### Äänet

Kaikki äänet syntetisoidaan Web Audio API:lla (`js/audio.js`), äänitiedostoja ei ole.
Selain sallii äänet vasta ensimmäisen painalluksen tai kosketuksen jälkeen, ja valikossa
on hiljaista.

- **Moottori:** näennäinen vaihteisto laskee kierrokset nopeudesta (vaihtaa ylös ja alas,
  rajoitin, kierrokset karkaavat ilmassa ja lähdössä). Ääni on sylinterien sytytystahdin
  mukainen aaltomuoto, särö ja kuorman mukaan aukeava suodatin. Jokaisella autolla on oma
  profiili `cars.js`:n kohdassa `sound` (`idle`, `redline`, `tone` = kirkkaus, `rough` =
  epätasaisuus, `turbo` = vihellys ja puhallus, `pops` = pamahdukset kaasua nostettaessa).
- **Alusta:** soran rapina vauhdin mukaan, sivuluisu ja käsijarru, maaston kahina, hiekan
  suhina (Egypti ja Bahama) ja vauhdin tuuli. Ilmassa rengasäänet hiljenevät, ja
  alastulosta kuuluu tömähdys.
- **Valikkomusiikki** (`js/music.js`): oma retrokappale (chiptune/synthwave, a-molli,
  150 BPM, 32 tahtia): intro, melodiaosa, nouseva väliosa ja melodia uudelleen. Soittimina
  pumppaava oktaavibasso, pulssiaaltoarpeggio, sahalaitamatto, kaikuva melodia ja rummut.
  Soi valikossa, hiljenee radan latauksen ja ajon ajaksi. Valikon Music-nappi sammuttaa
  pelkän musiikin, Sound-nappi (V) kaikki äänet. Melodiat ja soinnut ovat tiedoston alussa
  (`SONG`, `MELODY_B`, `MELODY_C`), tempo `BPM` ja voimakkuus `VOLUME`.
- **Törmäykset:** Rapier ilmoittaa auton iskuista (kynnys `IMPACT_THRESHOLD` tiedostossa
  `car.js`). Materiaali päätellään törmäysmuodosta: puut ja tolpat (sylinterit) = puu,
  kivet ja pyramidit (kuperat muodot) = kivi, rakennukset (laatikot) = rakennus,
  lähtö- ja maaliportti = metalli, maasto = korin osuma maahan. Mereen ajaminen roiskahtaa.

### Puhelin ja tabletti

Kosketusohjaimet (`js/touchControls.js`) tulevat näkyviin ensimmäisestä kosketuksesta,
pelkillä kosketuslaitteilla heti. Ne kirjoittavat samaan ohjaustilaan kuin näppäimistö.

- **Vasen alakulma:** ohjaus. Oletuksena vasen/oikea-napit, jotka toimivat kuten
  A/D-näppäimet (sormen voi liu'uttaa napilta toiselle). Tiedoston alussa
  `STEER_MODE = 'slider'` vaihtaa tilalle liukuohjauksen: peukalon vaakasiirtymä
  kosketuskohdasta on analoginen ohjauskulma (säädöt `DEAD_ZONE`, `FULL_LOCK`, `STEER_CURVE`).
- **Oikea alakulma:** kaasu, jarru/peruutus ja käsijarru. Sormen voi liu'uttaa polkimelta
  toiselle, ja käsijarrua voi painaa toisella sormella samaan aikaan.
- **Yläreuna:** Reset (R), Road (T), Map (M), Retry (Enter) ja Menu (Esc).
- **Valikko:** napauta etappia tai autoa, ja napauta valittua uudelleen jatkaaksesi.
  Matalalla näytöllä valikko tiivistyy.
- Pystyasennossa puhelin pyytää kääntämään laitteen vaakatasoon.
- Androidilla peli siirtyy koko näytölle ensimmäisestä kosketuksesta. Kotivalikkoon
  lisättynä (`manifest.webmanifest`, ikonit `images/icon-*.png`) peli aukeaa ilman
  selaimen palkkeja myös iPhonella.

Puhelimella testaaminen: `npm run watch` tulostaa myös koneen lähiverkko-osoitteen
(esim. `http://192.168.1.20:3000`), jonka voi avata samassa wifissä olevalla puhelimella.
Windowsin palomuuri voi kysyä lupaa Node.js:lle ensimmäisellä kerralla.

## Valikko, radat ja autot

Valikko on kaksiosainen: ensin valitaan auto (←/→) ja sitten etappi. Etappivaiheessa maa
valitaan välilehdeltä (Q/E, Tab tai ↑/↓), ja sen alla ovat maan etapit (←/→). Enter siirtyy
seuraavaan vaiheeseen ja etappivaiheessa käynnistää ajon. Esc palaa etappivalinnasta
autovalintaan ja autovalinnasta takaisin ajoon. Autokortissa näkyy ominaisuuspalkit ja
monellako etapilla autolla on aika; etappivaiheessa yläreunassa valittu auto, välilehdellä
monellako maan etapilla valitulla autolla on aika ja etappikortissa reittikartta, pituus,
alusta ja paras aika valitulla autolla.

Latausruutuna on `images/loading-screen.webp`, ja Italian etapeilla
`loading-screen2.webp` (muilla mailla kuvat vuorottelevat). Latausruudun vinkit
ovat `js/main.js`:n `TIPS`-listassa.

**Finland** (teema `forest`)
1. **Harju** (2,0 km): mäkinen metsäpätkä isoine nousuineen; noin 520 m kohdalla
   pihapiiri (kaksi vanhaa puutaloa, koivut ja maitolaituri tien vieressä)
2. **Päijälä** (1,8 km): tiheä metsä, lyhyet jyrkät mäet, tiukat mutkat ja hakkuuaukeat
3. **Ouninpohja** (3,8 km): pisin pätkä; metsää, nopeita suoria, tiukkoja mutkia
   ja peltoaukeita punaisine taloineen ja paaleineen. Maasto on muita suurempi
   (960 m, `terrain.size` tracks.js:ssä), joten rata on muita raskaampi piirtää

**Italy** (teema `tuscany`)
1. **Torrevecchia** (1,7 km): pitkä nousu kukkuloiden halki, viinitarhat, maatalot ja
   vanha torni maalissa
2. **Tricarico** (1,8 km): kapea vuoristotie harjanteen yli ja alas läntistä rinnettä,
   viinitarhat rinteillä
3. **Durazzano** (1,6 km): kukkulakylä, jonka läpi kulkee kapea mutkainen
   mukulakivikuja ja kellotorni, sitten itäisten viinitarhojen halki

**Egypt** (teema `desert`)
1. **Bawiti** (1,6 km): dyynit, kaktukset ja kolme keidasta; lähtö etelästä
2. **Giza** (1,6 km): jyrkät rinteet ja isot dyynit, lopuksi pitkä lenkki
   Gizan pyramidien ohi
3. **Ghamrin** (1,6 km): Niilin suiston pellot, kanavat, taatelipalmut ja
   egyptiläiset talot, välillä hiekkadyyneillä

**USA** (teema `arizona`: punaruskea hiekka, kerroksittaiset kalliot, pensaat,
paljon kiviä ja kalliomuodostelmia)
1. **Flagstaff** (1,7 km): mäntymetsän mutkat ja mäet, kaksi amerikkalaista
   omakotitaloa, sitten karumpaan aavikkomaastoon
2. **Bull Mountain** (1,6 km): karua kivistä vuoristoa, jyrkkiä nousuja ja laskuja,
   puusilta kanjonin yli
3. **Beaver Valley** (1,7 km): alkuosa kanjonin pohjaa vanhan rautatiesillan ali,
   puolivälissä nousu kanjonista ja loppu tiheää mäntymetsää

**Bahamas** (teema `tropical`: saaret, hiekkarannat, palmut ja turkoosi meri)
1. **Long Cay** (1,7 km): pitkä kapea saari, tie kulkee saaren päästä päähän ja
   takaisin rantojen ja keskiosan mutkissa, olkikattoisia majoja
2. **Bullet Hill** (1,6 km): rannalta saaren keskellä olevan vuoren huipulle (53 m)
   ja alas toiselle rannalle, rinteillä kalkkikivimuodostelmia
3. **Treasure Cay** (1,6 km): viidakkoa, rantahietikkoa ja mäkiä, tie kulkee
   bahamalaisen kylän läpi

**Scotland** (teema `highlands`: pilvinen harmaa taivas, loivat nummet, kanerva,
ruohotupsut, vaivaiskoivut, paljon kiviä ja kivikasoja, osittain sortuneet kiviaidat,
lammastarhat, tien varren koivut ja yksittäiset mökit (crofts), lampaita laitumilla)
1. **Loch Ness** (1,7 km): tie kiemurtelee nummilla pitkän kapean järven rannalla,
   niemellä linnan rauniot (tornilinna, muurit ja portin tornit), rannalla kivimökkejä.
   Rannoilla tiheä metsä (isot koivut, kotimännyt, vaivaiskoivut), puulaitureita
   soutuveneineen, ja järvessä ui Nessie
2. **Fort William** (1,6 km): kapea sola korkeiden kukkuloiden välissä, lopussa tie
   nousee solasta ylängölle, jossa kasvillisuus harvenee ja kalliota on enemmän.
   Solan yli kulkee kaarisilta, jolla seisoo höyryjuna (Glenfinnanin tapaan); rinteillä
   kotimäntyjä, ylämaankarjaa ja punahirviä, ylängöllä pieni autiotupa
3. **Skelwick** (1,6 km): puuton, tuulinen pohjoisrannikko, kalliopintaa ja kivikkoa,
   puolivälissä pieni kylä kivi- ja puutaloineen (turvepinot, punainen puhelinkoppi),
   niemen kärjessä majakka, kukkulalla pystykivikehä ja rannalla kalastusveneitä

Jos auton ajaa syvään veteen (meri tai Loch Nessin järvi), se hyytyy: ajanotto
pysähtyy ja vain Enter (uusi yritys) auttaa. Matalassa rantavedessä voi ajaa, ja renkaista roiskuu vettä.

Radat on lueteltu tiedostossa `js/tracks.js` (reitti, maasto, teema) ja autot
tiedostossa `js/cars.js` (vetotapa, teho, pito, massa ja ulkonäkö). Jokaisella autolla
on oma täydellinen ajosäätö `config`-kohdassa.

Autot: FWD Hatchback, Retro RWD, WRC AWD ja **Rally Raid Truck** (4×4-kuorma-auto
Dakar-tyyliin). Kuorma-auto on raskas (2 400 kg) ja pitkä: se kiihtyy ja kääntyy
hitaammin, mutta isot nappularenkaat pitävät hyvin myös tien ulkopuolella, ja se
kahlaa syvemmässä vedessä (`wadeDepth`). Pysähtyessä paineilmajarrut pitävät sen paikallaan
(`holdSpeed`). Kamera on kauempana (`camera` cars.js:ssä). Ääni on matalakierroksinen
V8-diesel: iso turbo, dieselin nakutus, moottorijarrun rätinä kaasun noustessa ja
paineilmajarrujen sihahdus pysähtyessä (`sound`: `diesel`, `jake`, `airBrake`,
`turboPitch`, `inertia`).

Teemat (`js/themes.js`) määräävät tunnelman (`atmosphere`), maaston värit, tien
pinnan, pölyn värit, tienvarren pikkuyksityiskohdat (`roadside`) ja maisemaelementit.

## Tunnelma ja grafiikka

Kaikki on proseduraalista (ei kuvia eikä ladattavia malleja).

- **Tunnelma-asetukset** (`js/atmosphere.js`, `ATMOSPHERES`): yksi selkeä asetusolio
  per tunnelma, ja teema valitsee omansa (`atmosphere: 'finnishEvening'` themes.js:ssä):
  - `finnishEvening` (Suomi): kesäilta, matala lämmin aurinko, vaaleanpunertava horisontti
  - `tuscanGoldenHour` (Italia): golden hour, kultainen valo ja lämmin utu
  - `desertHaze` (Egypti): kuuma iltapäivä, vaalea pölyinen utu
  - `arizonaAfternoon` (Arizona): myöhäinen iltapäivä, syvänsininen taivas ja kumpupilvet
  - `bahamasNoon` (Bahama): kirkas keskipäivä, korkea aurinko, lähes pilvetöntä
  - `highlandOvercast` (Skotlanti): pilvinen ja usvainen, hajavalo ja pehmeät varjot

  Jokaisessa: aurinko (väri, voimakkuus, korkeus ja suunta → varjojen pituus),
  täyttövalo (`HemisphereLight`: taivas- ja maaväri), taivaan liukuväri (lakipiste →
  horisontti), auringon hehku, pilvet (peittävyys, pehmeys, värit, tuuli), utu
  (näkyvyys metreinä), ACES-valotus, bloom, vinjetti ja värisävy. Rata voi muuttaa
  yksittäisiä arvoja: `env.atmosphere = { sun: { elevation: 10 } }` tracks.js:ssä
  (vanhat `env.sky` = horisontin väri ja `env.fog` = näkyvyys toimivat edelleen).
- **Taivas**: iso taivaskupu (`SphereGeometry`, `BackSide`) omalla shaderilla:
  liukuväri, auringon kiekko ja hehku sekä fBm-kohinasta lasketut, hitaasti liikkuvat
  pilvet.
- **Utu**: `FogExp2`, jonka väri on täsmälleen taivaan horisonttiväri. Three.js:n
  sumupalaa on laajennettu niin, että utu saa auringon suunnassa saman hehkun kuin
  taivas, joten kaukaiset vuoret sulautuvat taivaaseen saumatta (`applyFogGlow`).
- **Jälkikäsittely** (`js/postfx.js`): MSAA-puskuri → `UnrealBloomPass` (korkea kynnys:
  vain aurinko ja takavalot hehkuvat) → värisävy ja vinjetti → ACES-sävytys
  (`OutputPass`). Osoitteella `?fx=0` jälkikäsittely on pois (vertailuun tai heikoille
  laitteille). Puhelimilla bloom lasketaan pienemmällä tarkkuudella.
- **Tienvarsi** (`js/roadside.js`): ruohotupsut, saniaiset, kanerva, kuiva heinä,
  pensaat ja pikkukivet ojanpenkoilla, `InstancedMesh`-joukkoina (muutama kolmio per
  kappale). Tyypit, määrät ja värit teemoittain (`roadside` themes.js:ssä).
- **Pöly** (`js/dust.js`): pienempi alkukoko, laajenee nopeasti ja haalistuu
  pehmeästi (oma läpinäkyvyys per hiukkanen); värit tienpinnan mukaan teemoittain.
- **Kamera** (`js/camera.js`, `CAMERA_FX`): näkökenttä levenee vauhdissa (+11°
  huippunopeudessa) ja soralla kamera tärisee hienovaraisesti (maastossa enemmän).

## Suorituskyky

- Maasto on jaettu 32 m paloihin, joiden tarkkuus riippuu etäisyydestä tiehen
  (`LOD_LEVELS` heightmap.js:ssä): tien lähellä 1,6 m ruudut, kauempana 3,2 m ja
  6,4 m. Saumat liitetään toisiinsa, joten rakoja ei synny, ja auto ajaa samalla
  pinnalla kuin näkyy.
- Maasto piirretään 64 m paloina ja puut, kivet ja muut toistuvat kappaleet 96 m
  ruutuina, joten näkymän ulkopuolisia paloja ei piirretä lainkaan.
- Maasto ei heitä varjoja (vain autot, puut ja rakennukset), näkymä päättyy sumun
  loppuun ja tarkkuus on enintään 1,5 × näytön pikseleistä (`main.js`).

## Sillat ja kanjonit

- Tien voi viedä sillalla kanjonin yli: reittitiedostoon `bridges: [{ from, to }]`
  (metreinä tien alusta). Sillan kohdalla tie on suora kansi, maastoa ei täytetä sen
  alta ja teema rakentaa puusillan pukkitukineen (Bull Mountain).
- Maastoon voi tehdä kanjoneita (`terrain.canyons`) ja kanjonin, jonka pohjaa tie
  kulkee (`terrain.roadCanyon`, Beaver Valley). `terrain.terraces` tekee kallioista
  portaittaisia kuin Arizonan mesat.
- `terrain.island` tekee saaren meren keskelle (muoto kapseleina, ranta ja matala
  rantavesi) ja `terrain.peaks` vuoria. Teeman `sea`-asetus lisää meren.
- `terrain.lake` tekee pitkän järven pisteiden kautta (Loch Ness): laakson pohjalla
  vesi, rannat nousevat loivasti, ja järven ulkopuolinen maasto pysyy vedenpinnan
  yläpuolella. Rata voi tuoda oman vetensä `env.sea`-asetuksella (taso, värit ja nimi,
  joka näkyy viestissä "stalled in the loch").

## Ajanotto

Ajanotto käynnistyy, kun auto ylittää lähtöviivan, ja pysähtyy maaliviivalla.
Paras aika tallentuu selaimeen rata- ja autokohtaisesti: jos reittiä
muutetaan, ennätys alkaa alusta. Mutkia ei voi oikaista maaston kautta, sillä eteneminen
lasketaan vain, kun auto pysyy tien lähellä.

## Tien reitin muokkaus

Ratojen reitit ovat tiedostoissa `js/roadPath*.js` (katso tiedostolista alla):
lista `[x, z]`-pisteitä, joiden kautta
tie kulkee pehmeänä käyränä ensimmäisestä viimeiseen (tai lenkkinä, jos
`closed: true`). Samassa tiedostossa ovat lähtö- ja maaliviivan paikat. Siirrä, lisää tai poista
pisteitä ja päivitä sivu. Maasto muotoutuu tien mukaan automaattisesti
(leikkaukset ja penkereet), ja puut väistävät tietä. Samassa tiedostossa voi
säätää tien leveyttä, luiskien leveyttä, tasoitusta ja suurinta jyrkkyyttä.
Paina pelissä **M** nähdäksesi kartan, jossa pisteiden numerot näkyvät.

## Tiedostot

- `index.html`: sivu ja kirjastojen importmap
- `package.json`, `build.mjs`: npm-skriptit ja rakennus dist-kansioon
- `style.css`: HUD, valikko ja latausruutu
- `js/main.js`: käynnistys, pelisilmukka, valikon ja ajon vaihto
- `js/session.js`: yksi ajokerta (näkymä, fysiikka, rata, auto), rakennus ja purku
- `js/menu.js`: kaksiosainen päävalikko (auto, sitten maavälilehdet ja etappi)
- `js/modelHatch.js`: FWD Hatchbackin 3D-malli (kolmiovinen hot hatch, vain ulkonäkö)
- `js/modelRetro.js`: Retro RWD:n 3D-malli (70-luvun kaksiovinen ralli-sedan teippauksineen)
- `js/modelWrc.js`: WRC AWD:n 3D-malli (Rally1-tyylinen kilpa-auto isolla siivellä)
- `js/modelTruck.js`: Rally Raid Truckin 3D-malli (ohjaamo, huoltolaatikko, nappularenkaat, varapyörä)
- `js/audio.js`: syntetisoidut äänet (moottori, alusta, törmäykset)
- `js/music.js`: valikkomusiikki (syntetisoitu retrokappale)
- `js/sceneryScotland.js`: Skotlannin nummet, kiviaidat, mökit, kylä ja linnan rauniot sekä
  ratojen erikoisuudet (kaarisilta ja höyryjuna, majakka, kivikehä, Nessie, laiturit, veneet, eläimet)
- `js/touchControls.js`: kosketusohjaimet (ohjausnapit tai liukuohjaus, polkimet, yläreunan napit)
- `js/carPreview.js`: renderöi valikon autokuvat pelin omista automalleista etuviistosta
- `js/tracks.js`, `js/cars.js`: valikon radat ja autot
- **Ratojen reitit (muokattavat):** `js/roadPath.js` (Harju),
  `roadPath_paijala.js`, `roadPath_ouninpohja.js`, `roadPath2.js` (Torrevecchia),
  `roadPath_tricarico.js`, `roadPath_durazzano.js`, `roadPath3.js` (Bawiti),
  `roadPath_giza.js`, `roadPath_ghamrin.js`, `roadPath_flagstaff.js`,
  `roadPath_bullmountain.js`, `roadPath_beavervalley.js`, `roadPath_longcay.js`,
  `roadPath_bullethill.js`, `roadPath_treasurecay.js`
- `js/road.js`: tien keskilinja (spline) ja korkeusprofiili
- `js/heightmap.js`: luonnollinen maasto ja tien muotoilu maastoon, etäisyyskenttä
- `js/terrain.js`: maaston grafiikka ja törmäysmuoto
- `js/roadMesh.js`: soratien pinta
- `js/themes.js`: ratojen teemat (tunnelma, värit, tienvarsi, maisema)
- `js/atmosphere.js`: tunnelma-asetukset, taivaskupu ja pilvet, hehkuva utu
- `js/postfx.js`: jälkikäsittely (bloom, värisävy, vinjetti, ACES)
- `js/roadside.js`: tien reunan ruohotupsut, kanerva ja pikkukivet
- `js/scenery.js`: metsäteeman puut ja kivet
- `js/sceneryFinland.js`: hakkuuaukeat, pellot, paalit ja punaiset talot
- `js/sceneryTuscany.js`: Italian maisema (pellot, viinitarhat, talot, torni, puut, kylä)
- `js/sceneryDesert.js`: aavikko (keitaat, palmut, majat, kaktukset, pyramidit, suiston pellot ja talot)
- `js/sceneryArizona.js`: Arizona (kalliot, pensaat, männyt, talot, puusillat)
- `js/sceneryTropical.js`: Bahama (palmut, viidakko, majat, kalkkikivet, kylä)
- `js/sceneryKit.js`: maisemien yhteiset apufunktiot
- `js/car.js`: auton malli, jousitus ja ajologiikka; autojen säädöt ovat `cars.js`:ssä
- `js/dust.js`: pöly ja roiskeet renkaista; säädöt `DUST_CONFIG`-oliossa
- `js/stage.js`: lähtö- ja maaliportit, ajanotto ja ennätys
- `js/camera.js`: perässä seuraava kamera (vauhdin mukaan levenevä näkökenttä, tärinä)
- `js/mapView.js`: karttanäkymä
- `js/input.js`: näppäimistö
- `js/noise.js`: kohinafunktiot
