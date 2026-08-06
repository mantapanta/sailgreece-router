# sailgreece-router

Törnplanungs-Web-App für den 12-Tage-Kykladen-Familientörn ab 8. August 2026.
Die App übersetzt Windvorhersagen täglich in bewertete Routen-Optionen — sie
ersetzt das Kopfrechnen des Skippers, **nicht sein seemännisches Urteil**.

- **Routen-Konzept (zentrale Logik):** Geroutet wird nach einem von zwei
  Revier-Konzepten — Route 1 (Klassische Kykladen-Runde West & Zentral,
  Rückweg im Lee-Korridor Milos–Sifnos–Serifos–Kythnos) oder Route 2
  (Ost-Kykladen, nur bei moderatem Meltemi). Die Konzept-Eignung kommt aus dem
  Forecast (`domain/konzept.ts`), überschreibt im Solver die Reichweite,
  erzeugt den Konzeptwechsel-Entscheid („Vorstoß nach Osten — abgeraten") und
  trägt die Rückweg-Empfehlung der Törnanalyse.
- **Abraten statt verbieten:** Zu viel Wind nimmt keine Best-Practice-Route
  aus dem Angebot. Jede kuratierte Route (Westkykladen-Runde, Ostkykladen-
  Runde …) behält ihren Plan, bleibt ansehbar und übernehmbar und trägt die
  Empfehlung `empfohlen` / `möglich` / `abgeraten · wählbar` samt Begründung.
  Der Zustand („offen / schließt / zu") beantwortet weiterhin, ob ein
  tragfähiger Plan existiert — zwei Aussagen, keine Sperre. Und eine kuratierte
  Route wird als sie selbst geplant: „Westkykladen-Runde" heißt die
  Westkykladen-Runde, nicht irgendeine Kette zum selben Wendepunkt.
- **Schwellen als Regler:** Wo „zu viel Wind" anfängt, stellt der Skipper im
  Konzept-Panel ein (eingeklappt am Ende der Tagesansicht) — je Konzept eine kn-Schwelle und die Zahl der Tage in
  Folge, über die sie halten muss (`KONZEPT_REGLER` in `domain/konzept.ts`,
  persistiert im Trip-Kontext, jederzeit auf die Törnanalyse-Werte
  zurücksetzbar). Die Regler sind gekoppelt: Route 2 darf nie über Route 1
  liegen — wer den einen darüber schiebt, schiebt den anderen mit.
- **Früh los, 15:00 vor Anker:** Je Etappentag empfiehlt die App die späteste
  Abfahrtsstunde, deren simulierte Ankunft das Ankerziel 15:00 noch hält
  (`domain/abfahrt.ts`) — Crowd-Strategie: entspannt anlegen, bevor der
  Nachmittags-Meltemi steht. Diese Empfehlung ist der **Default der Abfahrt**:
  Solver, Gültigkeit, Karte und Anzeige rechnen mit ihr, nicht mit einer
  pauschalen Standardstunde (`scoring.departureHourForDay`). Abweichen geht per
  Klick — in der Abfahrt-Kachel der Etappenkarte und am Chip der Etappenliste
  in der Karte; die Wahl gilt pro Törntag und ist jederzeit auf die Empfehlung
  zurückzusetzen.
- **Entscheidungstore:** An natürlichen Knoten (Paros/Naxos, Syros) prüft die
  App am Tag der Festlegung, ob ein 48-h-Forecast-Fenster samt machbarem
  Rückweg den Vorstoß dahinter deckt (`domain/konzept.ts`,
  `deriveTorChecks`).
- **Tagesansicht:** „Was machen wir heute?" — Tagesoptionen mit Etappen-Score,
  bester Platz je Ziel-Insel mit Nacht-Ampel, Zustand des Mittelfristplans
  (offen / schließt am Tag X / geschlossen), Predicted Point of Return,
  Entscheidungspunkte.
- **Karte:** Besprechungsbild mit Ampel-Markern, gestrichelten Routen-Optionen,
  Windpfeilen, Itinerar↔Karte-Hover (Google Maps, Hybrid-Ansicht).
- **Platz-Detail:** Foto, Qualitäten, sicherer Liegeplatz (kuratiert), Nacht-Ampel,
  **Liegeplatz-Details** (Tiefe, Grössenlimit, Anlegeart, Haltegrund;
  Reservierbarkeit, Müll, Strom, Wasser, Diesel, Preis) und die
  **Gastronomie-Subebene** des Platzes — die kuratierten Tavernen mit
  Bewertung, Spezialitäten, Anlandung und Reservierungskontakt
  (`domain/schema/gastro.ts`). Beides bewertet nichts: weder Ampel noch Solver
  lesen davon ein Feld. Ein unbestätigter Reservierungskontakt trägt seinen
  Vorbehalt sichtbar, statt wie eine gesicherte Nummer auszusehen.

- **Kite-Spots:** Die kuratierten Spots des Reviers als eigene Ebene auf der
  Karte **und** als Hinweis an der Etappe — liegt einer auf der Start- oder
  Ziel-Insel des Tages oder am Kurs, sagt die Tagesansicht es samt Link auf den
  Spot (`domain/kite.ts`). Bewertet wird davon nichts: kein Feld geht in Ampel,
  Solver oder Plan ein. Ausführlich unten: „Kite-Spots".

Stack: Vite 8 · React 19 · TypeScript 5.9 · TanStack Query 5 · Zod 4 ·
@vis.gl/react-google-maps 1.x · Firebase (Authentication + Firestore +
Hosting) · Vitest 4.

## Schnellstart (Entwicklung)

**Voraussetzung: Node.js ≥ 22.18** (die Seeding-Skripte `npm run seed:*`
laufen über natives TypeScript-Type-Stripping, das es erst ab dieser Version
gibt — mit Node 20 scheitern sie kryptisch). Deklariert im `engines`-Feld
der `package.json`.

```bash
npm install
cp .env.example .env        # VITE_DATA_SOURCE=local ist der Standard
npm run dev
```

`VITE_DATA_SOURCE=local` lädt die Staging-JSONs aus `seeding/data/` direkt —
die App rechnet damit voll (echte Open-Meteo-Forecasts, alle Bewertungen), ohne
dass Firestore befüllt sein muss. Ohne Google-Maps-Key zeigt die
Karten-Ansicht einen Hinweis statt der Karte; alles andere funktioniert.

**Die Anmeldung ist auch in der Entwicklung Pflicht.** Vor der Tagesansicht
steht der Login-Gate (Firebase Authentication, Google Sign-in); die
`VITE_FIREBASE_*`-Werte müssen also in jedem Fall in der `.env` stehen (siehe
Schritt 1 und 3). Fehlen sie, zeigt der Login-Screen einen benannten Hinweis
statt des Google-Buttons — es gibt bewusst keinen Bypass, weder für `local`
noch für `firestore`.

Verifikation:

```bash
npm test           # Vitest-Fixturen (Ampel, Scoring, Polare, Zeitfenster, Optionen)
npm run build      # tsc --noEmit + vite build
```

## Setup für den Betrieb (Philipp)

### 1. Firebase-Projekt, Web-App, Authentication, Firestore

Alles über die CLI — die Konsole braucht es nur für den Sign-in-Provider.

1. Anmelden und Projekt verknüpfen:

   ```bash
   npx -y firebase-tools@latest login
   npx -y firebase-tools@latest use <projectId>
   ```

2. Web-App registrieren und Config auslesen:

   ```bash
   npx -y firebase-tools@latest apps:create WEB "sailgreece-router Web"
   npx -y firebase-tools@latest apps:sdkconfig WEB
   ```

   Aus dem Config-Objekt brauchst du `apiKey`, `projectId`, `appId` — und
   optional `authDomain`, `messagingSenderId`, `storageBucket`.

3. **Authentication einrichten und Google Sign-in aktivieren** (nur in der
   Konsole möglich, weder CLI noch MCP können das):
   <https://console.firebase.google.com> → Projekt → **Authentication → Jetzt
   starten** → **Sign-in method → Google → aktivieren** → Support-E-Mail
   wählen → Speichern.

   Die beiden Stufen sind unterschiedliche Fehlerbilder, und die App
   unterscheidet sie:
   - Authentication nie initialisiert → `auth/configuration-not-found`. Das
     SDK meldet diesen Fall **gar nicht** an `onAuthStateChanged` (auch
     `authStateReady()` bleibt hängen), deshalb bricht ein Watchdog nach 8 s
     ab und zeigt den Hinweis, statt ewig zu laden.
   - Initialisiert, Google-Provider aus → `auth/operation-not-allowed`.

4. **Autorisierte Domains** prüfen (Authentication → Settings → Authorized
   domains): `localhost` steht dort per Default, die Hosting-Domain
   (`<projectId>.web.app` / `.firebaseapp.com`) ebenfalls. Jede weitere Domain
   (z. B. Vercel-Preview) muss ergänzt werden, sonst schlägt der Login mit
   `auth/unauthorized-domain` fehl.

5. Firestore-Datenbank anlegen (falls noch nicht vorhanden), Region
   `europe-west` (z. B. `europe-west1`), Produktionsmodus.

6. Security Rules deployen (angemeldet lesen, niemand schreibt — AD-5):

   ```bash
   npx -y firebase-tools@latest deploy --only firestore:rules
   ```

### 2. Google-Maps-Key

1. In der Google Cloud Console (gleiches Projekt): **Maps JavaScript API**
   aktivieren, API-Key anlegen.
2. Key doppelt absichern: **HTTP-Referrer-Restriction** (deine
   Hosting-Domain, z. B. `sailgreece-router.web.app/*`) **und**
   **API-Restriction** (nur Maps JavaScript API). Der Key liegt als
   `VITE_`-Variable im Bundle — öffentlich by design, darum die Restriktionen.
3. Pflicht für die Karte: eine **Map ID** anlegen (Map Management) für
   AdvancedMarker. Ohne echte Map-ID zeigt die App einen benannten Hinweis
   statt der Karte — es gibt keinen Demo-Fallback.

### 3. Umgebungsvariablen

`.env` (aus `.env.example` kopieren):

```bash
VITE_DATA_SOURCE=firestore          # 'local' = Staging-JSONs statt Firestore
VITE_GOOGLE_MAPS_API_KEY=<dein Key>
VITE_GOOGLE_MAPS_MAP_ID=<Map-ID>     # Pflicht für die Karte, kein Demo-Fallback

# Pflicht (Login-Gate), Werte aus `apps:sdkconfig WEB`:
VITE_FIREBASE_API_KEY=<apiKey>
VITE_FIREBASE_PROJECT_ID=<projectId>
VITE_FIREBASE_APP_ID=<appId>
# optional, sonst aus projectId abgeleitet:
VITE_FIREBASE_AUTH_DOMAIN=<projectId>.firebaseapp.com
VITE_FIREBASE_MESSAGING_SENDER_ID=<messagingSenderId>
VITE_FIREBASE_STORAGE_BUCKET=<storageBucket>
```

Der Firebase-API-Key ist — wie der Maps-Key — öffentlich by design: er
identifiziert das Projekt, er autorisiert nichts. Der Schutz kommt aus den
Security Rules und der Liste der autorisierten Domains, nicht aus der
Geheimhaltung des Keys.

### 4. Seeding: Review → Freigabe → Import

Die Bibliotheken (Inseln, Plätze als sichere Liegeplätze, Routen, Polare,
Parameter) leben als Staging-JSON in `seeding/data/`. Die App liest nur;
**einziger programmatischer Schreiber ist das Import-Skript** (AD-5).

1. **Polare erzeugen** (parst das WindySail-Transkript aus den PRD-Inputs):

   ```bash
   npm run seed:polar
   ```

2. **Review-Sichten generieren** (FR24 — sichere Liegeplätze zuerst, sie sind
   sicherheitsrelevant):

   ```bash
   npm run seed:review
   # -> seeding/review/<insel>.md, routes.md, polar.md lesen und prüfen
   ```

3. **Freigeben:** Nach der Prüfung in jeder Staging-Datei
   (`seeding/data/islands/*.json`, `legs.json`, `variants.json`,
   `kitespots.json`, `config.json`, `polar.json`) das Feld `approved` auf
   `true` setzen. Die Polare erst
   freigeben, nachdem das Transkript gegen die Original-Exportdatei
   („Fountaine Pajot 45.txt") verifiziert wurde.
   **Wichtig:** Die mitgelieferten Beispieldaten stammen aus dem
   Brief-Addendum, Koordinaten und Sektoren sind approximiert
   (`sourceNote` je Datei) — sie sind bewusst **nicht** freigegeben.

4. **Importieren** (firebase-admin braucht einen Service-Account-Key:
   Projekteinstellungen → Dienstkonten → Neuen privaten Schlüssel erstellen):

   ```bash
   export GOOGLE_APPLICATION_CREDENTIALS=/pfad/zum/service-account.json
   export FIREBASE_PROJECT_ID=<projectId>
   npm run seed:import -- --dry    # nur validieren + Freigabe-Gate prüfen
   npm run seed:import             # schreibt islands/places/routes/config
   ```

   Das Skript validiert strikt gegen dieselben Zod-Schemas wie die App und
   **verweigert den Import (Exit ≠ 0), solange irgendeine Datei
   `approved: false` trägt.**

   Feldkorrekturen über die Firebase-Konsole sind als Notweg erlaubt —
   müssen aber ins Staging-JSON zurückgetragen werden, sonst überschreibt
   der nächste Import sie (AD-5).

### 5. Deploy (klassisches Firebase Hosting)

```bash
npm run build          # baut nach dist/
firebase deploy        # Hosting (dist/) + Rules
```

Manuell, kein CI — reicht für einen Nutzer und 9 Tage (AD-8).

## Tuning-Parameter

Alle fachlichen Parameter (Polar-Offset +0,5 kn, Motorfahrt 8 kn,
FR16-Budgets, Aufkreuz-Schwelle 25 kn, Gelb-Reserve, Zeitfenster,
Forecast-Modell …) liegen im Firestore-Dokument `config/parameters`
(bzw. `seeding/data/config.json` im local-Modus) — Feldkorrektur ohne
Redeploy.

### Forecast-Modelle: Nahfeld + Fernfeld

Der Wind kommt aus ZWEI Modellen. Das **Fernfeld** trägt die Stundenachse und
den Horizont, das **Nahfeld** liefert die Stunden, die es abdeckt — feiner
aufgelöst. Dahinter steht ein Befund der Törnanalyse: ein globales 25-km-Gitter
bügelt genau die Kanaldüsen glatt, an denen es in den Kykladen hängt (Kea-Kanal,
Paros–Naxos, Mykonos–Paros).

| Parameter | Default | Bedeutung |
|---|---|---|
| `forecastModel` | `ecmwf_ifs025` | Fernfeld Wind, ~25 km, 10 Tage |
| `forecastModelNear` | `dwd_icon_eu` | Nahfeld Wind, ~7 km, ~5 Tage |
| `waveModel` | `best_match` | Fernfeld Wellen (MFWAM ~8 km) |
| `waveModelNear` | `ewam` | Nahfeld Wellen, ~5 km, 79 h |

Die gültigen Ids stehen in `src/domain/schema/models.ts` — **dort und nur dort**.
Ein `""` im Nah-Feld schaltet den Hybrid ab; dann verhält sich die App wie vor
der Umstellung. Zwei gleiche Modelle sind NICHT der Aus-Schalter (das wären zwei
identische Abrufe) und werden abgelehnt.

**Die Nahtstelle ist ein harter Schnitt — es wird nichts geblendet.** Ein
geblendeter Wert wäre eine Zahl, die kein Modell vorhergesagt hat, und käme
unmarkiert daher (AD-10). Ein Sprung an der Übergabestunde ist deshalb kein
Fehler, sondern der Abstand zwischen zwei Modellen; das Annahme-Detail im
Tagesblick sagt das auch so.

**Achtung bei der Kalibrierung:** die Schwellen (`konzeptOstMaxKn`,
`konzeptKlassikMaxKn`, `openSectorMaxKn`, `maxUpwindTwsKn`) wurden gegen
ECMWF-geglättete Werte eingestellt. Ein 7-km-Modell zeigt in den Kanälen
schärfere Spitzen — Ampeln können dort kippen, wo sie vorher grün waren. Das ist
gewollt; nachjustiert wird über dieselben Config-Parameter, ohne Redeploy.

**Poseidon (HCMR) ist nicht anbindbar** — nicht aus Mangel an Daten: das
griechische System verteilt ausschliesslich NetCDF über THREDDS/OPeNDAP, ohne
CORS, und diese App ist reines Hosting ohne Backend. Bei Open-Meteo ist Poseidon
ebenfalls nicht dabei. Begründung ausführlich im Modulkopf von
`src/domain/schema/models.ts`.

Inkonsistente Kombinationen (z. B. `nightEndHourAthens >= nightStartHourAthens`
oder `targetDayHours > maxSailHours + maxMotorHours`) werden vom Zod-Schema
abgelehnt — ein fehlerhaft editiertes Config-Dokument fällt sichtbar auf die
Defaults zurück statt stumm falsche Fenster/Ampeln zu erzeugen.

## Der Fernbereich: es wird immer geroutet

Jenseits von `reliableHorizonDays` (Default 7) liefert kein Modell mehr
verlässliche Tageswerte. Die App schweigt dort trotzdem nicht — sonst hätte
der zweite Törnabschnitt keine Aussage, und der Skipper nichts, wogegen er
sein Urteil abwägen kann.

`src/domain/persistence.ts` schreibt fehlende Stunden mit dem **typischen
Tagesgang** der vorliegenden Forecast-Tage fort: Mittel je Stunde-des-Tages,
Windrichtung vektoriell und geschwindigkeitsgewichtet. Der Tagesgang statt
eines Tagesmittels, weil das nachmittägliche Auffrischen des Meltemi genau die
Information ist, an der Etappen scheitern; ein Mittel über alle Tage statt
einer Kopie des letzten, weil ein einzelner Tag verrauscht ist.

Drei Regeln halten die Annahme ehrlich:

1. **Sie deklariert sich.** Jede gefüllte Stunde ist einzeln markiert
   (`windAssumed` / `waveAssumed`); jede Bewertung trägt
   `basis: 'forecast' | 'annahme'` und sagt in ihren Gründen, worauf sie beruht.
2. **Sie kann nichts freigeben.** Eine Etappe auf Annahme setzt
   `horizonDependent` — der Rest-Trip wird damit nie grün.
3. **Sie kann nichts verurteilen.** Verletzungen aus Annahme-Etappen tragen
   `Violation.assumed` und zählen nicht als `safetyViolation`. Ein
   extrapolierter Mittelwert darf keinen real fahrbaren Törn rot stempeln.

Unangetastet bleibt die **Rückkehr-Prüfung**: sie rechnet weiter gegen den
Meltemi-Worst-Case (`meltemiWorstCase`, kursabhängig maximal ungünstig). Das
ist die Sicherheitsfrage, und ein Mittelwert hat darauf keine Antwort.

Was ohne Daten bleibt, bleibt leer: ein Ort ohne einen einzigen echten Wert
wird nicht erfunden, er bleibt `unbewertet`.

### Trip-Parameter (Törn-Rahmen)

| Feld | Bedeutung | Default |
|---|---|---|
| `tripStartDate` | Kalenderdatum von Törntag 1 (`YYYY-MM-DD`) | `2026-08-08` |
| `tripLengthDays` | Törnlänge in Tagen (Tag 1 … Tag N) | `12` |
| `disembarkDay` | **Ausschiffungstag** (1-basiert). Die Rückkehr nach Alimos am **Vorabend** wird intern gerechnet: effektiver Stichtag = `disembarkDay − 1 − bufferDays`. Hier den Ausschiffungstag eintragen, **nicht** den Vorabend! | `12` |
| `bufferDays` | Zusätzlicher Puffertag vor dem Vorabend (FR19) | `1` |
| `baseIslandId` / `basePlaceId` | Heimatbasis (Start/Ziel der Rückfallkette) | `athen` / `athen-alimos` |
| `maxSnapNm` | Max. Distanz (sm), bis zu der ein GPS-Fix auf den nächsten Bibliotheksplatz gesnappt wird; weiter entfernte Fixes gelten als „außerhalb des Reviers" (sichtbare Meldung statt stummer Zuordnung) | `30` |
| `nightLookaheadDays` | Wie viele Nächte ab heute für die Anzeige bewertet werden | `10` |

Beispiel: `disembarkDay: 12`, `bufferDays: 1` ⇒ Basis muss bis **Tag 10**
erreicht sein (Vorabend Tag 11, minus 1 Puffertag).

## Projektstruktur

```text
src/
  domain/          # purer Core: schema/ (Zod), time, polar, scoring,
                   # ampel, options, ppr, persistence, assess, searoute,
                   # legGeometry, kite — kein React/Firebase/fetch,
                   # Zeit/Törntag/Position werden injiziert (AD-2)
    data/          # landmass.ts — GENERIERTE Küstenlinien des Reviers
                   # (seeding/tools/extractLandmass.ts)
    __tests__/     # Vitest-Fixturen (Referenzfälle Sektorsemantik, 25-kn-Regel,
                   # Budgets, Polar-Interpolation+Offset, Athens→UTC)
  adapters/        # openMeteo (Snapshot-Builder), firebase (eine einzige
                   # App-Initialisierung, lazy), auth (Google Sign-in),
                   # firestore (read-only, toleranter Parse, local-Modus),
                   # geolocation
  ui/              # drei Views + Login-Gate + Komponenten, Vanilla CSS
  app/             # Provider (QueryClient staleTime 1 h, AuthContext mit
                   # Login-Gate, TripContext-Reducer mit localStorage,
                   # manual > gps), View-Switch ohne Router
seeding/           # Staging-JSON je Insel (approved-Flag), Review-Generator,
  data/            # islands/*.json, legs.json, variants.json, kitespots.json,
                   # config.json, polar.json — je Datei ein Freigabe-Gate
  review/          # generierte FR24-Review-Sichten
  tools/           # extractLandmass (Küstenlinien zuschneiden),
                   # seaRouteLegs (Etappenkurse landfrei legen)
firebase.json      # Hosting -> dist/
firestore.rules    # read: nur angemeldet, write: false
```

## Ein Segelboot fährt nicht durch eine Insel

Etappen waren Luftlinien zwischen zwei Häfen — und in den Kykladen liegt
zwischen zwei Häfen fast immer Land. Ermoupoli sitzt auf der Ostseite von Syros:
wer von Kea kommt, hatte die ganze Insel im Kurs, gezeichnet UND gerechnet.
Dazu sprang die Kette, weil dieselbe Insel je Etappe einen anderen kuratierten
Hafen trägt (`mykonos--paros` endet in Naoussa, `paros--sifnos` beginnt in
Parikia): der Endpunkt eines Tages war nicht der Startpunkt des nächsten.

Beides hängt jetzt an zwei Modulen:

- `src/domain/searoute.ts` — beantwortet gegen die Küstenlinie, ob ein Schlag
  über Land führt, und legt den Kurs andernfalls um das Land herum
  (Sichtbarkeitsgraph über die Inselecken). Jeder Endpunkt behält eine
  Ansteuerungszone von 1,5 sm, in der die eigene Insel nicht blockiert — der
  letzte Kilometer in die Bucht ist Pilotage, nicht Routing. Tiefen, Untiefen
  und Sperrgebiete kennt das Modul **nicht**: es sagt „hier ist Land", nicht
  „hier ist es sicher".
- `src/domain/legGeometry.ts` — macht aus der kuratierten Etappe die gesegelte:
  verankert an dem Platz, an dem das Boot wirklich liegt, und landfrei gelegt.
  Die Bewertung rechnet gegen diese Geometrie, und die Karte zeichnet sie
  (`LegAssessment.sailedLeg`) — es gibt nur eine.

Die kuratierte `distanceNm` bleibt die Wahrheit über die Länge einer Etappe;
sie wird nur mitskaliert, wenn ein Ankerpunkt die Etappe verschiebt.

Die Landmaske ist eingecheckt, nicht zur Laufzeit geladen. Neu erzeugen:

```bash
npm pack @geo-maps/earth-coastlines-250m --pack-destination /tmp
tar xzf /tmp/geo-maps-earth-coastlines-250m-*.tgz -C /tmp
node seeding/tools/extractLandmass.ts /tmp/package/map.geo.json
node seeding/tools/seaRouteLegs.ts --dry-run   # Etappenkurse gegen die neue Maske
```

`src/domain/__tests__/libraryGeometry.test.ts` hält den Zustand fest: kein
Wegpunkt an Land, kein gespeicherter Kurs über Land, keine Route mit Sprung.

## Ein Boot segelt keine 22 Grad am Wind

Santorin → Folegandros stand mit „22° TWA · gegenan, 6,5 kn, 3,5 h Segeln" in
der Tagesansicht. Das ist kein Kurs, das ist eine Behauptung: bei 22° zum Wind
steht das Vorsegel back. Das Schiff segelt höchstens `beatTwaDeg` = **50° TWA**
(Skipper 2026-08-06); alles darunter wird **gekreuzt**.

Gerechnet wird das in `src/domain/polar.ts` (`courseSpeedKn` / `kreuzFactor`):
gesegelt wird bei 50°, und auf der Ideallinie kommt davon

```
v_kurs = v(50°) · cos(50°) / cos(TWA)
```

an — bei 22° also 69 %, umgekehrt 1,44 sm durchs Wasser je Seemeile Kurs. Die
vorige Faltung `cos(50° − TWA)` hatte denselben Fall um rund ein Viertel zu gut
gerechnet, weshalb eine Kreuz-Etappe fast so schnell aussah wie ein anliegender
Am-Wind-Kurs.

Gefahren wird dabei kein enger Kurs, sondern ein **Zickzack**: ein Schlag auf
dem einen Bug mit 50° zum Wind, wenden — 100° Kursänderung —, wieder 50° auf dem
anderen. `src/domain/kreuz.ts` legt diese Schläge: aus Kurs C, Wind aus W und
δ = C − W folgen die beiden Bugs auf W ± 50° und ihre Längen

```
l_A = D · sin(50° + δ) / sin(100°)     l_B = D · sin(50° − δ) / sin(100°)
```

deren Summe genau `D · cos(δ) / cos(50°)` ist — der Kehrwert des Kreuz-Faktors.
Zeit und Gestalt sagen dasselbe, an zwei Stellen; ein Test hält das fest. Der
lange Schlag kommt zuerst (näher am Kurs), die Schlaglänge kommt aus
`kreuzSchlagNm` (Default 5 sm), und jeder Zickzack wird gegen die Landmaske
geprüft: passt er nicht, wird halbiert, und wenn er dann immer noch an Land
läuft, wird **nichts** gezeichnet statt einer Linie über Land.

Sichtbar wird das überall, wo die Etappe von sich erzählt: die Bewertung führt
`kreuzHours`, `kreuzExtraNm`, `wenden` und den `kreuzTrack`, jede simulierte
Stunde trägt `kreuzen`, `sailedTwaDeg` und die Fahrt durchs Wasser. Die
Tagesansicht schreibt „Kreuzen (50° am Wind) · 6 Wenden à 100°" statt „gegenan",
und die Tageskarte legt den Zickzack gestrichelt über die Ideallinie — als
Skizze des Umwegs, nicht als Wendeanweisung: wo wirklich gewendet wird,
entscheiden Dreher und Welle.

Vermieden wird Kreuzen an zwei Stellen — beide raten ab, keine verbietet:

- **Ampel**: mehr als `kreuzGelbAbStunden` (Default 0,5 h) Kreuzschläge machen
  die Etappe gelb, mit Begründung. Gelb heisst hier nicht „gefährlich", sondern
  „nicht der Törn, der gewollt ist"; rot bleibt der FR16-Fall (Aufkreuzen über
  25 kn), und nur der zählt als Sicherheitsverletzung.
- **Rangfolge**: `PlanMetrics.kreuzTenths` ist Kriterium 7 in `preferred`
  (`src/domain/solver.ts`) — unter sonst gleichen Plänen gewinnt der, der seine
  Ziele anliegen kann. Bewusst UNTER Reichweite und Inselvielfalt: Kreuzen ist
  ein Preis, kein Ausschluss.

### Problematische Abschnitte in der Etappenkarte

„Ich will bei den Etappenkarten erkennen, ob problematische Abschnitte mit dabei
sind" (Skipper 2026-08-06). Die Kacheln nennen EINEN Wind für den ganzen Tag,
und ein mittlerer TWA verschluckt genau das, wonach gefragt wird: vier Meilen
gegenan verschwinden im Mittel einer Etappe, die danach raumschots läuft — an
Bord sind sie die Stunde, über die geredet wird.

Deshalb fasst `src/domain/kursAbschnitte.ts` die **Abschnitte** der Durchfahrten
(`pointPassages`, dieselben Zeilen wie in der aufgeklappten Rechnung — AD-3)
nach Kurs zum Wind zusammen und hängt sie als `kursAbschnitte` an Etappe und
Tag. Die Karte zeigt daraus je eine Zeile:

```
● ca. 4 sm Kreuz (16 kn) · GELB
● ca. 10 sm Halbwind (9 kn) · GRÜN
```

Gemeldet werden nur Kreuz (bis 60° TWA, plus alles, was gekreuzt werden muss)
und Halbwind (bis 100°) — raumschots trägt der Wind, und ein Abschnitt, über den
nichts zu sagen ist, gehört nicht in eine Warnliste. Die Meilen werden je
Kategorie addiert, gemeldet wird der **stärkste** Wind über ihnen (dieselbe
Doktrin wie bei der Platz-Ampel: die schlechteste Stunde trägt das Urteil). Die
Schwellen stehen in der Konfiguration (AD-8), Grenzwerte zählen zum milderen
Band:

| Kurs     | grün      | gelb                | rot        |
| -------- | --------- | ------------------- | ---------- |
| Kreuz    | < 10 kn   | 10–20 kn            | > 20 kn    |
| Halbwind | < 20 kn   | 20–30 kn            | > 30 kn    |

Zwei Bänder, weil derselbe Wind auf den beiden Kursen nicht dasselbe bedeutet.
Und wie überall in dieser App ist das eine **Meldung, kein Urteil**: diese
Ampeln gehen NICHT in `StageAssessment.ampel` ein — über die Gültigkeit
entscheiden weiterhin FR16-Windregel und Fahrtbudgets.

## Kite-Spots

Das Board kommt mit — also muss die App sagen, wo man es benutzen kann. Die
Kite-Spots sind eine **eigene Bibliothek** (`seeding/data/kitespots.json`,
Firestore-Sammlung `kiteSpots`, Schema `src/domain/schema/kite.ts`) und keine
Subebene des Platzes wie die Gastronomie: ein Spot liegt dort, wo Wind und
Wasser stimmen, und das ist regelmässig nicht der Hafen — Mikri Vigla liegt 5 sm
von Naxos-Stadt, der Pounda-Kanal gehört zu Paros, geankert wird auf Antiparos.
Nur mit eigener Koordinate lässt sich beantworten, ob ein Spot an der Etappe von
heute liegt.

Sichtbar wird das an drei Stellen:

- **Tagesansicht:** je Etappen-Karte die Spots auf der Start- oder Ziel-Insel und
  die im Korridor neben dem **gesegelten** Kurs (`params.kiteKorridorNm`,
  Default 5 sm) — mit dem Urteil des Kite-Fensters und einem Link, der den Spot
  im Platzdetail seines Bezugs-Liegeplatzes aufschlägt und dort hervorhebt.
  Gezeigt werden die Zeilen, deren Windrichtung heute trifft; der Rest steht als
  Zahl darunter statt stillschweigend zu fehlen.
- **Karte:** eine eigene Ebene (Chip „Kite-Spots"), Raute statt Punkt und ein
  eigener Farbton — ein Spot ist kein Ampel-Urteil. Gefüllt heisst „der Wind
  passt heute"; die Bedeutung steht in der Legende und im `aria-label`, nie nur
  in der Füllung. Die Ebene folgt bewusst **nicht** der Plan-Kontextmenge: ein
  Kite-Spot ist der Grund, eine Insel anzulaufen.
- **Platzdetail:** die Spots dieses Liegeplatzes mit Profil, Windrichtung,
  Anfahrt, Gefahren und Konfidenz — nach den Liegeplatz-Details, weil sie wie
  die Gastronomie nichts bewerten.

**Woher der Wind kommt, und wo die Grenze liegt:** für einen Kite-Spot wird
*kein* eigener Forecast geholt (AD-3: Forecast-Keys sind Plätze und
Etappen-Wegpunkte). Gelesen wird der Wind am kuratierten **Bezugsplatz**
(`refPlaceId`) — jeder Hinweis nennt diesen Platz, damit die Zahl nicht als Wind
*am Spot* gelesen wird; in einer Kanaldüse steht dort regelmässig mehr.
`refPlaceId` ist zugleich das Link-Ziel und bewusst kuratiert statt gerechnet:
der geometrisch nächste Liegeplatz zu Mikri Vigla liegt auf *Paros*, jenseits
des Kanals.

| Parameter | Default | Bedeutung |
|---|---|---|
| `kiteMinKn` / `kiteMaxKn` | 12 / 30 | Das Kite-**Band**: dazwischen ist ein Spot fahrbar. Global statt je Spot — die Richtung ist Ortskenntnis, die Stärke hängt an Material und Crew. |
| `kiteKorridorNm` | 5 | Bis zu diesem Abstand von der gesegelten Linie gilt ein Spot als „am Kurs". |
| `kiteFensterStartHourAthens` / `…EndeHourAthens` | 12 / 19 | Das Kite-**Fenster** (Athen-Zeit): die Stunden, in denen gekitet wird — genau die Zeit, die die Crowd-Strategie meidet. |

Bewertet wird mit der **günstigsten** Stunde des Fensters, nicht mit dem Worst
Case (anders als die Nacht-Ampel): eine Nacht muss man durchhalten, eine Session
sucht man sich aus. Dazu zählt die App die Stunden, in denen alles passt — eine
einzelne Stunde im Band ist keine Session.

**Die Datenlage ist bewusst als solche markiert.** Anders als die sicheren
Liegeplätze ist diese Bibliothek Revierwissen, nicht Revierführer: keine
Windstatistik, keine Ortsbegehung, und **behördliche Kite-Verbote,
Badezonen-Auflagen und Schutzgebiete (Delos/Rinia, Despotiko, Polyaigos) sind
nicht recherchiert**. Jeder Eintrag trägt darum `confidence: 'mittel'` oder
`'niedrig'` samt Vorbehalt in der Anzeige, und die Datei steht auf
`approved: false` — sie wird also erst importiert, nachdem
`seeding/review/kite-spots.md` geprüft und die Freigabe gesetzt ist (dieselbe
Regel wie für jede andere Staging-Datei, FR24/AD-10).

## Attribution

- Weather data by [Open-Meteo](https://open-meteo.com/) (CC BY 4.0)
- Modelle je nach Konfiguration: ECMWF, `Datenbasis: Deutscher Wetterdienst`
  (ICON-EU, EWAM), Météo-France / Copernicus Marine. Die Fusszeile der App
  nennt die tatsächlich AKTIVEN Quellen — aus der Registry gerendert
  (`src/domain/schema/models.ts`), damit die Angabe nicht veraltet, wenn das
  Modell in Firestore umgestellt wird. Die Werte werden unverändert
  durchgereicht (harter Schnitt an der Nahtstelle, kein Blending), es liegen
  also keine veränderten Daten im Sinne der GeoNutzV vor.
- Seezeichen-Overlay von [OpenSeaMap](https://www.openseamap.org)
  (`tiles.openseamap.org`, CC-BY-SA), Daten © OpenStreetMap-Mitwirkende,
  [ODbL 1.0](https://opendatacommons.org/licenses/odbl/) — rein visuelle
  Ebene, geht nicht in Scoring oder Routing ein; keine verlässlichen
  Tiefenangaben
- Küstenlinien aus [@geo-maps](https://github.com/simonepri/geo-maps)
  (`earth-coastlines-250m`), abgeleitet aus OpenStreetMap-Daten —
  © OpenStreetMap-Mitwirkende, [ODbL 1.0](https://opendatacommons.org/licenses/odbl/)
- Sichere Liegeplätze quellenbasiert kuratiert (Rod Heikell *Greek Waters Pilot*,
  [CruisersWiki](https://www.cruiserswiki.org/) — CC-Lizenz, Attribution in
  der Platz-Detailansicht)
