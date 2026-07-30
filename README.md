# sailgreece-router

Törnplanungs-Web-App für den 12-Tage-Kykladen-Familientörn ab 8. August 2026.
Die App übersetzt Windvorhersagen täglich in bewertete Routen-Optionen — sie
ersetzt das Kopfrechnen des Skippers, **nicht sein seemännisches Urteil**.

- **Tagesansicht:** „Was machen wir heute?" — Tagesoptionen mit Etappen-Score,
  bester Platz je Ziel-Insel mit Nacht-Ampel, Zustand des Mittelfristplans
  (offen / schließt am Tag X / geschlossen), Predicted Point of Return,
  Entscheidungspunkte.
- **Karte:** Besprechungsbild mit Ampel-Markern, gestrichelten Routen-Optionen,
  Windpfeilen, Itinerar↔Karte-Hover (Google Maps, Hybrid-Ansicht).
- **Platz-Detail:** Foto, Qualitäten, kuratiertes Schutzprofil, Nacht-Ampel.

Stack: Vite 8 · React 19 · TypeScript 5.9 · TanStack Query 5 · Zod 4 ·
@vis.gl/react-google-maps 1.x · Firebase (Firestore + Hosting) · Vitest 4.

## Schnellstart (Entwicklung, ohne Firebase)

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
die App läuft damit voll (echte Open-Meteo-Forecasts, alle Bewertungen), ohne
dass ein Firebase-Projekt existiert. Ohne Google-Maps-Key zeigt die
Karten-Ansicht einen Hinweis statt der Karte; alles andere funktioniert.

Verifikation:

```bash
npm test           # Vitest-Fixturen (Ampel, Scoring, Polare, Zeitfenster, Optionen)
npm run build      # tsc --noEmit + vite build
```

## Setup für den Betrieb (Philipp)

### 1. Firebase-Projekt + Firestore anlegen

1. <https://console.firebase.google.com> → **Projekt hinzufügen** (z. B.
   `sailgreece-router`). Google Analytics ist nicht nötig.
2. Im Projekt: **Build → Firestore Database → Datenbank erstellen** →
   Region `europe-west` (z. B. `europe-west1`) → Produktionsmodus.
3. **Projekteinstellungen → Allgemein → Meine Apps → Web-App hinzufügen**
   (`</>`). Aus dem angezeigten Config-Objekt brauchst du `apiKey`,
   `projectId`, `appId`.
4. Firebase CLI installieren und Projekt verknüpfen:

   ```bash
   npm install -g firebase-tools     # firebase-tools 15.x
   firebase login
   firebase use --add               # Projekt wählen, Alias z. B. "prod"
   ```

5. Security Rules deployen (App liest nur, niemand schreibt — AD-5):

   ```bash
   firebase deploy --only firestore:rules
   ```

### 2. Google-Maps-Key

1. In der Google Cloud Console (gleiches Projekt): **Maps JavaScript API**
   aktivieren, API-Key anlegen.
2. Key doppelt absichern: **HTTP-Referrer-Restriction** (deine
   Hosting-Domain, z. B. `sailgreece-router.web.app/*`) **und**
   **API-Restriction** (nur Maps JavaScript API). Der Key liegt als
   `VITE_`-Variable im Bundle — öffentlich by design, darum die Restriktionen.
3. Optional: eine **Map ID** anlegen (Map Management) für AdvancedMarker;
   `DEMO_MAP_ID` funktioniert für die Entwicklung.

### 3. Umgebungsvariablen

`.env` (aus `.env.example` kopieren):

```bash
VITE_DATA_SOURCE=firestore          # 'local' für Entwicklung ohne Firebase
VITE_GOOGLE_MAPS_API_KEY=<dein Key>
VITE_GOOGLE_MAPS_MAP_ID=<Map-ID oder DEMO_MAP_ID>
VITE_FIREBASE_API_KEY=<apiKey aus Schritt 1.3>
VITE_FIREBASE_PROJECT_ID=<projectId>
VITE_FIREBASE_APP_ID=<appId>
```

### 4. Seeding: Review → Freigabe → Import

Die Bibliotheken (Inseln, Plätze mit Schutzprofilen, Routen, Polare,
Parameter) leben als Staging-JSON in `seeding/data/`. Die App liest nur;
**einziger programmatischer Schreiber ist das Import-Skript** (AD-5).

1. **Polare erzeugen** (parst das WindySail-Transkript aus den PRD-Inputs):

   ```bash
   npm run seed:polar
   ```

2. **Review-Sichten generieren** (FR24 — Schutzprofile zuerst, sie sind
   sicherheitsrelevant):

   ```bash
   npm run seed:review
   # -> seeding/review/<insel>.md, routes.md, polar.md lesen und prüfen
   ```

3. **Freigeben:** Nach der Prüfung in jeder Staging-Datei
   (`seeding/data/islands/*.json`, `routes.json`, `config.json`,
   `polar.json`) das Feld `approved` auf `true` setzen. Die Polare erst
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
Redeploy. Das Forecast-Modell (Default `ecmwf_ifs025`) lässt sich dort
z. B. auf `icon_eu` umstellen.

Inkonsistente Kombinationen (z. B. `nightEndHourAthens >= nightStartHourAthens`
oder `targetDayHours > maxSailHours + maxMotorHours`) werden vom Zod-Schema
abgelehnt — ein fehlerhaft editiertes Config-Dokument fällt sichtbar auf die
Defaults zurück statt stumm falsche Fenster/Ampeln zu erzeugen.

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
                   # ampel, options, ppr, assess — kein React/Firebase/fetch,
                   # Zeit/Törntag/Position werden injiziert (AD-2)
    __tests__/     # Vitest-Fixturen (Referenzfälle Sektorsemantik, 25-kn-Regel,
                   # Budgets, Polar-Interpolation+Offset, Athens→UTC)
  adapters/        # openMeteo (Snapshot-Builder), firestore (read-only,
                   # toleranter Parse, local-Modus), geolocation
  ui/              # drei Views + Komponenten, Vanilla CSS (Creme/Navy)
  app/             # Provider (QueryClient staleTime 1 h, TripContext-Reducer
                   # mit localStorage, manual > gps), View-Switch ohne Router
seeding/           # Staging-JSON je Insel (approved-Flag), Review-Generator,
  review/          # generierte FR24-Review-Sichten
firebase.json      # Hosting -> dist/
firestore.rules    # read: true, write: false
```

## Attribution

- Weather data by [Open-Meteo](https://open-meteo.com/) (CC BY 4.0)
- Schutzprofile quellenbasiert kuratiert (Rod Heikell *Greek Waters Pilot*,
  [CruisersWiki](https://www.cruiserswiki.org/) — CC-Lizenz, Attribution in
  der Platz-Detailansicht)
