# sailgreece-router

Törnplanungs-Web-App für den 12-Tage-Kykladen-Familientörn ab 8. August 2026.
Der Skipper plant den Törn **Insel zu Insel frei von Hand**; die App rechnet
ihm jeden Tag vor — sie ersetzt sein Kopfrechnen, **nicht sein seemännisches
Urteil** und seit dem 2026-08-08 auch nicht mehr seine Routenwahl.

- **Freie Handplanung (zentrale Logik):** Jeder Törntag trägt ein Ziel, das der
  Skipper setzt — eine Insel, oder „hier bleiben" als Hafentag. **Jede Insel des
  Reviers ist wählbar und jede Verbindung zugelassen:** steht sie kuratiert in
  der Bibliothek, gilt sie mit ihrer geprüften Distanz; kennt die Bibliothek sie
  nicht, wird der Kurs landfrei erzeugt (`domain/manualPlan.ts`, `searoute.ts`)
  oder aus den bekannten Etappen verkettet. Keine Reichweite, kein Zeitbudget,
  keine Rundkurs-Bedingung, kein Nein. Wer Tag 5 umlegt, ändert die
  Ausgangsinsel von Tag 6 — der wird darum neu verbunden und behält sein Ziel;
  alles davor bleibt stehen.
- **Was die App dazu sagt — Zahlen, keine Urteile über den Törn:** je Etappentag
  Distanz, Abfahrt, Fahrtzeit, Ankunft, Wind auf Kurs, Kreuz-Abschnitte und die
  Stunde-für-Stunde-Rechnung dahinter; je Liegeplatz die Nacht-Ampel. Was ein
  Tag kostet, steht als Zahl da, nicht als Verbot.
- **Früh los, 15:00 vor Anker:** Je Etappentag empfiehlt die App die späteste
  Abfahrtsstunde, deren simulierte Ankunft das Ankerziel 15:00 noch hält
  (`domain/abfahrt.ts`) — Crowd-Strategie: entspannt anlegen, bevor der
  Nachmittags-Meltemi steht. Diese Empfehlung ist der **Default der Abfahrt**;
  abweichen geht per Klick in der Abfahrt-Kachel, die Wahl gilt pro Törntag und
  ist jederzeit zurückzusetzen.
- **Tagesansicht:** der heutige Tag als Karte, darunter der Plan Tag für Tag,
  jeder aufklappbar und jeder änderbar. „Törn leeren und neu planen" setzt alles
  auf den leeren Törn zurück.
- **Karte:** Besprechungsbild mit Ampel-Markern, der geplanten Route mit
  Fahrtrichtungspfeilen, Windpfeilen (Google Maps, Hybrid-Ansicht). Jede
  **Etappennummer auf der Karte ist ein Knopf** in die Tagesansicht.
- **Platz-Detail:** Foto, Qualitäten, sicherer Liegeplatz (kuratiert), Nacht-Ampel,
  **Liegeplatz-Details** (Tiefe, Grössenlimit, Anlegeart, Haltegrund;
  Reservierbarkeit, Müll, Strom, Wasser, Diesel, Preis) und die
  **Gastronomie-Subebene** des Platzes — die kuratierten Tavernen mit
  Bewertung, Spezialitäten, Anlandung und Reservierungskontakt
  (`domain/schema/gastro.ts`). Beides bewertet nichts.

- **Kite-Spots:** Die kuratierten Spots des Reviers als eigene Ebene auf der
  Karte **und** als Hinweis an der Etappe — liegt einer auf der Start- oder
  Ziel-Insel des Tages oder am Kurs, sagt die Tagesansicht es samt Link auf den
  Spot (`domain/kite.ts`). Bewertet wird davon nichts. Ausführlich unten:
  „Kite-Spots".

- **Topografische Windkorrektur:** Windschatten und Kanaldüsen, die ICON-EU auf
  7 km nicht auflöst (`domain/windTopo.ts`). Sie sind kuratiert, nicht
  gerechnet, weil sie Topografie sind und kein Wetter. Angewandt wird
  **asymmetrisch**: Düsen bewerten, Schatten beraten nur. Ausführlich unten:
  „Topografische Windkorrektur".

## Die Routenberatung ist abgeschaltet, nicht gelöscht

Bis zum 2026-08-07 war diese App ein Routen-BERATER: sie rechnete zwei
Revier-Konzepte samt Wechsel-Empfehlung, einen Optionsraum mit Reichweite,
Preis und Frist je Ziel, Alternativ-Routen zum Ansehen und Übernehmen, den
Predicted Point of Return, Entscheidungstore, eine Rest-Trip-Ampel und einen
Solver, der den ganzen Rundkurs vorschlug. Der Skipper hat das abbestellt:

> „Ich möchte die App vereinfachen. Ich plane den Trip Insel zu Insel frei von
> Hand ohne Routen-Warnungen und Empfehlungen — alle Verbindungen sind
> zugelassen."

**Gelöscht wurde dafür nichts.** Solver (`solver.ts`), Rundkurs-Aufzählung
(`roundTrips.ts`), Optionen (`options.ts`), Konzepte (`konzept.ts`), PPR
(`ppr.ts`), Reichweite (`reach.ts`) und Engpass (`engpass.ts`) liegen samt
ihren Tests unverändert im Repo — sie werden nur nicht mehr gerechnet und nicht
mehr angezeigt. Der Schalter dafür ist eine Zeile:

```ts
// src/domain/features.ts
export const ROUTENBERATUNG = false;
```

`assessPlanning(snapshot, { routenberatung })` nimmt ihn als Parameter (Default
`true`, damit Tests und Werkzeuge unverändert die volle Bewertung sehen);
abgeschaltet wird an genau einer Stelle, in `app/usePlanning.ts`. Warum ein
Schalter und nicht bloss eine stumme Oberfläche: der Solver ist der teuerste
Schritt der ganzen Bewertung, und ihn bei jeder Planänderung für ein Ergebnis
laufen zu lassen, das niemand mehr sieht, wäre Wartezeit ohne Gegenwert. Die
zugehörigen Ansichten (Optionsraum, Konzept-Panel, Alternativ-Menü der Karte,
Trip-Statuszeile) stehen in der Git-Historie vor dem Commit
„Handplanung"; ihre Bausteine (`ui/altRoutes.ts`,
`ui/components/TripStatusLine.tsx`) liegen weiter im Repo.

Was der Umbau NICHT angetastet hat: Wind- und Wellenrechnung, Polare, Kreuzen,
Abfahrtsempfehlung, Nacht-Ampeln, Landfreiheit der Kurse, Kite, Windtopo,
Gastro, Seeding.

### Wo die Erzeugung von Verbindungen aufhört

Drei Anläufe je Insel-Paar, in dieser Reihenfolge: die kuratierte Etappe
(Gegenrichtungen eingeschlossen), der direkte landfreie Kurs zwischen den Häfen
beider Inseln, und — wenn beides nichts hergibt — die kürzeste bekannte Kette
durch die Etappen-Bibliothek, zu EINER Etappe verkettet (die Zwischeninseln
werden Wegpunkte, keine Stopps). Inseln ohne eigene Etappe hängen sich über
einen kurzen selbst gerechneten Schlag an die nächste Insel am Graphen.

Damit ist jede Nachbarschaft des Reviers wählbar und selbst Attika → Amorgos
(97 sm) darstellbar. Nicht darstellbar bleiben **Dokos, Ermioni, Porto Heli und
Spetses** im Argolischen Golf: dort löst `searoute.ts` die Ansteuerung nicht
auf, und keine kuratierte Etappe führt hin. Das ist eine Grenze der Geometrie
in einer Ecke ausserhalb des Kykladen-Reviers — sie steht als benannte Ausnahme
in `domain/__tests__/manualPlanLibrary.test.ts`, statt stillschweigend
mitgeschleppt zu werden.

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
   `kitespots.json`, `windtopo.json`, `config.json`, `polar.json`) das Feld `approved` auf
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

   Das Skript validiert strikt gegen dieselben Zod-Schemas wie die App. Das
   Freigabe-Gate wirkt **pro Datei**: eine Staging-Datei mit `approved: false`
   wird mit einer `ÜBERSPRUNGEN:`-Zeile ausgelassen, der Rest wird importiert
   — eine Teil-Übernahme geprüfter Inseln ist also möglich. **Der Import
   bricht ab (Exit ≠ 0), wenn `config.json` nicht freigegeben ist** (die
   Parameter sind Pflicht) **oder wenn gar nichts freigegeben ist.**

   Daraus folgt der häufigste Stolperstein: ein Lauf kann erfolgreich enden
   und trotzdem eine ganze Ebene ausgelassen haben. Die Schlusszeile
   (`Import abgeschlossen: … kiteSpots=0`) nennt die Zahlen — sie ist die
   Kontrolle, nicht der Exit-Code.

   Feldkorrekturen über die Firebase-Konsole sind als Notweg erlaubt —
   müssen aber ins Staging-JSON zurückgetragen werden, sonst überschreibt
   der nächste Import sie (AD-5).

### 5. Deploy (klassisches Firebase Hosting)

```bash
npm run build          # baut nach dist/
firebase deploy        # Hosting (dist/) + Rules
```

Manuell, kein CI — reicht für einen Nutzer und 9 Tage (AD-8).

### Neue Bibliotheksdaten sind in der App nicht sichtbar

Ein Merge nach `main` bringt **Code**, keine **Daten**. Die Bibliothek lebt in
Firestore und kommt dort nur durch einen neuen Import an. Im local-Modus
(`VITE_DATA_SOURCE=local`) ist alles sofort da, weil die Staging-JSONs direkt
gelesen werden — das `approved`-Flag gilt nur für den Import, nicht für den
local-Modus. Wer eine Ebene im Deploy vermisst, geht diese vier Schritte der
Reihe nach durch:

> **Ausnahme: Kite-Spots und Tavernen.** Die beiden brauchen keinen Import
> mehr — sie kommen direkt aus den JSON-Dateien im Bundle. Siehe den Abschnitt
> gleich darunter.

1. **Freigabe:** trägt die Staging-Datei `approved: true`? Eine Datei ohne
   Freigabe wird bei *jedem* Import stillschweigend übersprungen — der Lauf
   endet trotzdem mit Exit 0.
2. **Import:** `npm run seed:import` erneut laufen lassen und die Schlusszeile
   lesen.
3. **Rules:** `firebase deploy --only firestore:rules`. Eine Collection ohne
   eigenen Block fällt in den Catch-All und ist gesperrt; der Adapter fängt
   die Ablehnung für `windTopoZones` bewusst ab, damit eine fehlende Regel
   nicht die ganze Bibliothek mitnimmt — die Korrektur fehlt dann still, mit
   einer Meldung in der Browser-Konsole.
4. **Bundle:** `npm run build && firebase deploy` — neue Ansichten stecken im
   Bundle, nicht in den Daten.

#### Zwei Ebenen stehen gar nicht in Firestore (seit 2026-08-09)

Die vier Schritte oben gelten für alles, was in der Datenbank lebt — für
**Kite-Spots und Tavernen aber nicht mehr.** Sie kommen in *beiden* Modi
direkt aus den JSON-Dateien im App-Bundle:

| Ebene | Quelle | Firestore |
| --- | --- | --- |
| Kite-Spots | `seeding/data/kitespots.json` | Sammlung `kiteSpots` wird **nicht gelesen** |
| Tavernen (`place.restaurants`) | `restaurants`-Blöcke in `seeding/data/islands/*.json` | Datei gewinnt, wo sie etwas sagt |

Grund: Für Ebenen, die **nichts bewerten**, war der Umweg über den Import der
ganze Fehler. Ein Merge nach `main` bringt Code, keine Daten — die Ebene fehlte
im Deploy, und im Boot sieht man das nicht als „Import ausstehend", sondern als
„es gibt keine Kite-Spots". Die Datei liegt ohnehin im Bundle, ist mit jedem
Deploy aktuell, kann nicht halb importiert sein und hängt an keiner Rule.
Praktisch heisst das: **Datei ändern, `npm run build && firebase deploy` —
fertig.** Kein Service-Account, kein Import, kein Rules-Deploy.

Die Grenze ist eng und sie ist der Punkt: **nur diese beiden Ebenen.** Weder
Ampel noch Solver noch Gültigkeit liest ein Feld von ihnen (`schema/kite.ts`,
`schema/gastro.ts`). Alles, was ein Urteil trägt — Plätze mit ihren
Schutzsektoren, Etappen, Parameter, Polare — bleibt in Firestore, weil dort
eine zurückgezogene Kuratierung **ohne Redeploy** wirksam wird; genau dafür
gibt es die Datenbank (AD-8). Gelesen wird nur aus Dateien mit
`approved: true`, also durch dasselbe Freigabe-Gate wie der Import (im
local-Modus gilt es wie bisher nicht).

Der Import schreibt die `kiteSpots`-Sammlung weiterhin — die App liest sie
bloss nicht mehr. Was geladen ist, sagt die Fusszeile („Forecast: …"
antippen): `Bibliothek: 42 Inseln · 97 Plätze · … · 14 Kite-Spots`, mit dem
Hinweis, dass diese beiden Ebenen aus den Dateien kommen. **0 Kite-Spots**
heisst dann: in der Datei steht etwas nicht — nicht „Import ausstehend".

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

#### Ratenlimit: warum jeder Abruf auf das Modellgitter gerastert wird

Open-Meteo gewichtet sein Free-Tier-Kontingent nach **Orten × Variablen ×
Tagen**, nicht nach Anfragen. Die Bibliothek hat 585 Orte (97 Liegeplätze +
488 Etappen-Wegpunkte), und vier Modell-Abrufe ergaben damit rund
**602 Call-Einheiten pro Aktualisierung** — bei einem Minutenlimit von 600.
Jede Aktualisierung lag also genau auf der Kante: mal ging sie durch, mal kam
**HTTP 429**, und weil der Fern-Wind das Fundament ist, stand die App danach
auf „unbewertet". Das Tageslimit (10 000) war nach 16 Aktualisierungen leer.

Behoben wird das dort, wo die Verschwendung sitzt: zwei Wegpunkte 800 m
auseinander bekommen aus einem 25-km-Gitter **denselben Wert**. Der Adapter
rastert die Ortsliste deshalb je Modell auf dessen halbe Gitterweite
(`gridDeg` in `models.ts`, `aufModellgitter` in `openMeteo.ts`) und fragt jede
Zelle einmal:

| Anfrage | Modell | Orte | Gewicht |
|---|---|---|---|
| Wind fern | `ecmwf_ifs025` (0,25°) | 585 → **95** | 167 → 27 |
| Wind nah | `dwd_icon_eu` (0,0625°) | 585 → **212** | 84 → 30 |
| Wellen fern | `best_match` (~0,08°) | 585 → **194** | 251 → 83 |
| Wellen nah | `ewam` (0,05°) | 585 → **234** | 100 → 40 |
| **gesamt** | | | **602 → 181** (30 %) |

Damit passt eine Aktualisierung wieder deutlich unter das Minutenlimit, und
das Tageskontingent trägt ~55 statt 16 Aktualisierungen. **Verloren geht
dabei nichts:** zwei Orte einer Rasterzelle liegen höchstens eine halbe
Gitterweite auseinander und treffen dasselbe Gitterfeld — es ist derselbe
Wert, nur einmal geholt. Was die Modelle im Kanal wirklich nicht auflösen,
beantwortet die kuratierte Topografie-Korrektur (`domain/windTopo.ts`), nicht
ein zweiter Abruf ins selbe Gitterfeld.

Kommt trotzdem ein 429, unterscheidet der Adapter die drei Kontingente:
beim **Minutenlimit** wartet er und fragt noch einmal (4 s, dann 12 s), beim
**Stunden- oder Tageslimit** nicht — das wäre nur mehr Last. Der von
Open-Meteo genannte Grund steht wörtlich im Fehlerpanel, statt „HTTP 429".

Weitere Hebel, falls es wieder eng wird — beide ohne Redeploy in
`config/parameters`: `forecastModelNear: ""` und `waveModelNear: ""` schalten
die Nahfelder ab (−39 %), ein kleineres `forecastDays` kürzt proportional.

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

### Der letzte Forecast überlebt den Neustart

Der Abruf lag bisher nur im Speicher der Seite. Auf dem Handy heisst das: jedes
Neuladen ist ein Kaltstart, und ohne Netz — Funkloch zwischen zwei Inseln,
Ratenlimit, Captive Portal in der Marina — stand die ganze Planung auf
„unbewertet", obwohl zwanzig Minuten vorher noch ein vollständiger Forecast da
war. Der letzte erfolgreiche Abruf liegt deshalb im `localStorage`
(`src/adapters/forecastCache.ts`) und ist beim nächsten Start der **Startwert**
der Abfrage — nicht ihr Ersatz: TanStack Query bekommt ihn samt echtem
Abrufzeitpunkt, hält ihn für so alt wie er ist und lädt sofort nach.

Zwei Dinge fallen dabei ab, und beide sind der Punkt:

- Ein **Kaltstart ohne Netz** zeigt die Planung statt lauter „unbewertet" —
  mit der Stale-Markierung der Fusszeile und dem Fehlerpanel darüber.
- Ein **Neuladen innerhalb der TTL** (1 h) kostet gar keinen Abruf mehr. Das
  ist nebenbei die zweite Hälfte der Ratenlimit-Frage oben: bisher war jedes
  Neuladen ein voller Abruf.

**Nichts wird frischer gemacht, als es ist.** Gespeichert wird das Bundle mit
seinem `fetchedAtIso`; Alter und Stale-Markierung rechnet die Fusszeile daraus
wie bisher, und die Herkunfts-Aufklappung sagt zusätzlich, dass die Zahlen aus
dem Gerätespeicher stammen. Drei Gründe schliessen die Nutzung hart aus:
ein **anderer Schlüssel** (andere Modellwahl oder Ortsmenge — das wäre kein
alter, sondern ein falscher Forecast), eine **Achse ganz in der Vergangenheit**
(er sagt über heute nichts mehr) und ein **unlesbarer Eintrag** (fliegt still
raus). Volle Quota oder Privatmodus bleiben folgenlos: der Speicher ist eine
Bequemlichkeit, kein Vertrag.

Damit er überhaupt hineinpasst, werden **inhaltsgleiche Reihen einmal**
abgelegt: 585 Orte × 5 Reihen × 240 Stunden wären als JSON ~4,7 MB, mehr als
die ~5 MB des ganzen Origins. Seit der Rasterung auf das Modellgitter sind
viele Reihen bitgleich — gespeichert werden ~1,2 MB, und das ist keine
Näherung, verglichen wird der Inhalt.

### Und wenn gar kein Forecast kommt

Antwortet Open-Meteo überhaupt nicht — Netz weg, HTTP 429 am Ratenlimit — und
liegt auch kein früherer Datenstand im Query-Cache **oder im Gerätespeicher**,
dann tritt der **windfreie Stand** an seine Stelle (`OHNE_FORECAST` in
`src/adapters/openMeteo.ts`): ein Bundle mit leerer Stundenachse und leerer
Ortsmenge.

Der Törn bleibt damit **planbar**. Vom Wetter hängt nur ein Teil der Planung
ab — die Bewertung; Inseln, Plätze, Etappen, Distanzen und die Kette der Tage
stehen in der Bibliothek. Vorher blieb `snapshot` in diesem Fall null, und mit
ihm verschwand die ganze Ansicht hinter dem roten Fehlerpanel.

Erfunden wird trotzdem nichts: die Fortschreibung greift nicht (sie hätte
keinen Tagesgang, aus dem sie schöpfen könnte), jede Ampel bleibt
`unbewertet`, und `Assessment.forecastHorizonIso` bleibt null. Genau dieses
Feld liest die Anzeige — Fehlerpanel und Fusszeile sagen dann „keine
Winddaten“ statt einen Modellnamen und einen Abrufzeitpunkt zu behaupten, die
es nicht gibt.

### Trip-Parameter (Törn-Rahmen)

| Feld | Bedeutung | Default |
|---|---|---|
| `tripStartDate` | Kalenderdatum von Törntag 1 (`YYYY-MM-DD`) | `2026-08-08` |
| `tripLengthDays` | Törnlänge in Tagen (Tag 1 … Tag N) | `11` |
| `returnDeadlineDate` | **DIE EINE Deadline** (AD-8/AD-9): Kalenderdatum der Rückgabe an der Basis. Alles andere — Stichtag in Törntagen, PoR-Reserve — wird daraus abgeleitet (`domain/time.ts` `deadlineFrame`). Nie eine zweite Deadline daneben pflegen. | `2026-08-18` |
| `returnDeadlineHourAthens` | Uhrzeit der Rückgabe (Athen) — die Deadline ist ein Zeitpunkt, kein Tag | `18` |
| `bufferDays` | PoR-Reserve in Tagen (FR19) — nur für den *Spätesten Umkehrtag*, nicht für die Plan-Gültigkeit | `1` |
| `baseIslandId` / `basePlaceId` | Heimatbasis (Start/Ziel der Rückfallkette) | `athen` / `athen-alimos` |
| `maxSnapNm` | Max. Distanz (sm), bis zu der ein GPS-Fix auf den nächsten Bibliotheksplatz gesnappt wird; weiter entfernte Fixes gelten als „außerhalb des Reviers" (sichtbare Meldung statt stummer Zuordnung) | `30` |
| `nightLookaheadDays` | Wie viele Nächte ab heute für die Anzeige bewertet werden | `10` |

Beispiel: `tripStartDate: 2026-08-08`, `returnDeadlineDate: 2026-08-18`
⇒ Stichtag ist **Törntag 11**, und der Törn hat 11 Etappen — einen Törntag,
eine Verbindung.

> **Hafentage sind kein Parameter mehr** (Zielmodell v3, Skipper 2026-08-07).
> `harbourDays`, `harbourDaysTargetMax` und `harbourDaysMax` sind entfallen.
> Der Vertrag steht direkt in der Rangfolge des Solvers: jeder Törntag trägt
> eine Etappe (`preferred`, Kriterium 2). Ein Tag ohne Etappe ist damit eine
> schlechtere Runde und braucht kein eigenes Zielband. Ein Config-Dokument,
> das die alten Schlüssel noch trägt, bleibt gültig — das Schema streift sie ab.
>
> `disembarkDay` ist ebenfalls entfallen. Es wurde vom Schema schon länger
> stumm verworfen; maßgeblich ist `returnDeadlineDate`.

## Projektstruktur

```text
src/
  domain/          # purer Core: schema/ (Zod), time, polar, scoring,
                   # ampel, manualPlan (freie Handplanung), persistence,
                   # assess, searoute, legGeometry, kite — kein
                   # React/Firebase/fetch, Zeit/Törntag/Position werden
                   # injiziert (AD-2)
                   # features.ts — EIN Schalter: ROUTENBERATUNG
                   # abgeschaltet, aber vollständig vorhanden: solver,
                   # roundTrips, options, konzept, ppr, reach, engpass
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
                   # windtopo.json, config.json, polar.json — je Datei ein
                   # Freigabe-Gate
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
```

Gemeldet werden nur Kreuz (bis 60° TWA, plus alles, was gekreuzt werden muss)
und Halbwind (bis 100°) — raumschots trägt der Wind, und ein Abschnitt, über den
nichts zu sagen ist, gehört nicht in eine Warnliste. **Grüne Abschnitte zeigt
die Karte gar nicht** (Skipper 2026-08-07): eine Warnliste, in der die Hälfte
der Zeilen „alles in Ordnung" sagt, wird überlesen. Gerechnet werden sie
weiterhin mit, und `kursAbschnitte` trägt sie unverändert — weggelassen wird nur
in der Anzeige. Die Meilen werden je
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
Kite-Spots sind eine **eigene Bibliothek** (`seeding/data/kitespots.json` —
gelesen direkt aus der Datei, nicht aus Firestore; Schema
`src/domain/schema/kite.ts`) und keine
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
`'niedrig'` samt Vorbehalt in der Anzeige. Die Datei ist nach Sichtung von
`seeding/review/kite-spots.md` freigegeben (`approved: true`, 2026-08-06) —
**trotz** dieser Lage, nicht weil sie sich geändert hätte: die Ebene bewertet
nichts, und ein Hinweis, den man vor Ort prüft, ist mehr wert als eine leere
Karte. Der Vorbehalt liegt damit in der Anzeige, nicht im Import. Sektor,
Koordinate und Zulässigkeit eines Spots gehören vor Ort geprüft.

## Topografische Windkorrektur

Geroutet wird mit ICON-EU (7 km). Der Vergleich mit **Poseidon** (HCMR, 1/30° ≈
3,7 km über echter Ägäis-Topografie, Skipper 2026-08-07) zeigt zwei Dinge, die
im 7-km-Gitter schlicht nicht enthalten sind:

1. **Windschatten** südlich jeder hohen Insel. Serifos ist 10 km breit und
   585 m hoch — bei 7 km Gitter anderthalb Zellen, und die Höhe wird beim
   Gitter-Mitteln zu einem flachen Buckel. Ein flacher Buckel wirft keinen
   Schatten. Ein Lee reicht 5–15 Hindernishöhen weit, hier also 3–8 km: genau
   die Grössenordnung, die unter das Gitter fällt.
2. **Düsen** in den Kanälen (Kea-Kanal, Steno Kythnou, Paros–Naxos,
   Paros–Antiparos): lokal +20–30 %, weggeglättet. Für sie trug die Etappe
   bereits einen Warntext (`Leg.windWarnings`) — was fehlte, war die Zahl.

**Warum das kuratiert wird statt abgerufen:** Lee und Düse sind kein Wetter,
sondern Topografie. Sie liegen bei gleicher Windrichtung immer an derselben
Stelle — also sind sie Ortskenntnis, und Ortskenntnis ist in dieser App
kuratiert (AD-4), wie die Schutzsektoren eines Liegeplatzes. Die Daten liegen in
`seeding/data/windtopo.json` (Firestore-Sammlung `windTopoZones`, Schema
`src/domain/schema/windTopo.ts`).

**Zwei Gestalten, weil es zwei Phänomene sind** — als diskriminierte Union, die
Felder sind nicht mischbar:

- Eine **Düse** ist ein fester Kreis plus Richtungssektoren. Ein Kanal liegt, wo
  er liegt, und er düst nur bei Wind längs seiner Achse.
- Ein **Windschatten** ist eine leewärtige **Keule** hinter der Insel: Hindernis
  (Mittelpunkt + Radius), Keulenlänge, und ein Faktor, der von der Leeküste bis
  zum Keulenende auf 1,0 ausläuft. Wo die Keule im Wasser liegt, rechnet
  `domain/windTopo.ts` je Stunde aus — **sie dreht mit dem Wind.**

Die Keule ersetzt seit 2026-08-07 einen festen Kreis mit Sektoren, und zwar
wegen einer Falsifikation: die Poseidon-Bilder vom 10.08. zeigen den Schatten
von Sikinos bei NNW-Wind SSE der Insel und den von Naxos bei NE-Wind SW davon.
Ein fest im Süden platzierter Kreis traf die zweite Lage gar nicht — er hätte
die Absenkung dort angesetzt, wo kein Schatten steht. Bei einer Zone, die
bewertet, ist das kein Schönheitsfehler.

### Die zentrale Regel: Düsen ungebremst, Schatten nur gebremst

Eine Korrektur nach **oben** (`kind: 'duese'`, Faktor > 1) geht ungebremst in
die Bewertung ein — liegt sie daneben, war die App zu vorsichtig, und das ist
der Fehler, den ein Törnplaner machen darf. Jede so angefasste Stunde trägt
`windAdjusted`, dieselbe Rolle wie `windAssumed` für die Persistenz-Annahme:
kein Wert, den kein Modell so vorhergesagt hat, bleibt unmarkiert (AD-10).

Eine Korrektur nach **unten** (`kind: 'lee'`, Faktor < 1) geht seit 2026-08-07
ebenfalls in Ampel und Routing ein — Grundlage ist die Skipper-Beobachtung, dass
die Abdeckungszonen im Poseidon-Modell über mehrere Tage und über schwachen wie
starken Wind an derselben Stelle stehen. Genau das sagt „Topografie, kein
Wetter" voraus. Aber sie geht **gebremst** ein, durch vier Sicherungen:

| Sicherung | Wirkung |
|---|---|
| **Kappung** (`leeBewertungMaxAbzugKn`, Default 8 kn) | Begrenzt den Abzug. Aus 30 kn werden mit Faktor 0,5 nicht 15, sondern 22. Physikalisch ist ein Lee multiplikativ — die Kappung ist keine Physik, sondern die Schadensgrenze: steht der Schatten nicht, findet die Crew höchstens diese Differenz mehr vor. `0` schaltet die Bewertung ab, dann berät das Lee wieder nur. |
| **Confidence-Tor** | Nur Zonen mit `confidence` `'mittel'`/`'hoch'` bewerten; `'niedrig'` berät weiter. Damit hat das Feld eine mechanische Folge — eine Zone, deren Faktor nur aus einer anderen abgeleitet ist, kann keine Ampel drehen. Bewusst **kein** Parameter: ein Regler wäre die Einladung, das Tor aufzudrehen statt nachzukalibrieren. Für Düsen gibt es das Tor nicht. |
| **Kein Grün aus dem Lee** | Eine Etappe, deren Bewertung auf einer Lee-Korrektur ruht, wird höchstens **gelb**. Das Lee darf ein Rot aufheben, es darf keinen Tag freisprechen. Die Etappe bleibt gültig, planbar und in der Rangfolge vor jeder roten — der Solver liest nur rote Sätze als Sicherheitsverletzung. |
| **Zwei blinde Flecken** | Der Meltemi-Worst-Case des Rückkehr-Checks (AD-13) sieht **nie** ein Lee — er fragt „kommen wir auch bei voller Lage heim?", und diese Frage mit kuratierter Abdeckung zu beantworten hiesse, das Sicherheitsnetz aus dem zu knüpfen, wogegen es sichert. Und die **Nacht-Ampel** eines Liegeplatzes: der hat seinen Schutzsektor bereits kuratiert, beides zusammen wäre dieselbe Abdeckung zweimal gezählt. |

Die Grundasymmetrie ist nicht bloss Konvention, sondern **Schema**: `kind: 'lee'`
verlangt Faktor < 1, `kind: 'duese'` verlangt Faktor > 1. Eine Lee-Zone, die den
Wind erhöht, ist kein Konfigurationsfehler, sondern unmöglich. Und strukturell
bleibt: `applyWindTopo` — der Pfad, der den **Snapshot** ändert — liest weiterhin
ausschliesslich Düsen. Der Schatten fasst `windKn` nirgends an, er wirkt nur dort,
wo eine Etappe gerechnet wird (`scoring.ts`), gekappt und an Ort und Stelle.

### Was ein Lee nicht ist

Gleichmässig ruhig. Unter der Abfallkante einer Steilküste stehen katabatische
**Fallböen**; sie drehen und schlagen deutlich über dem Gradientwind ein, und
Poseidon zeigt dort trotzdem Blau, weil es den *Mittelwind* zeigt. Die Taktik
„so dicht wie möglich unter Land aufkreuzen" fährt genau dort hinein.
`fallboeenNm` sagt, ab welchem Abstand das Lee nutzbar wird; der Hinweistext
sagt es mit.

### Vollständigkeit: alle Inseln ab 250 m

Bis zum Prüf-Befund vom 2026-08-07 hatten nur **neun** der 42 Inseln eine Zone —
und der `WEST_LEE_KORRIDOR` (konzept.ts) war genau zur Hälfte gedeckt: Kea,
Kythnos, Serifos, Sifnos ja, aber Milos, Kimolos, Polyaigos, Folegandros,
Sikinos nicht. Also ausgerechnet die Gegend um den Wendepunkt, den der Solver
wählt. Der Grund war simpel und schlecht: kuratiert war, was zufällig im
Bildausschnitt lag.

Jetzt trägt **jede Insel ab 250 m Gipfelhöhe** eine Zone (30 Lee-Zonen). Unter
250 m wäre die Keule kürzer als der Näherungsradius der Insel selbst, also nicht
von „keine Zone" zu unterscheiden. Dokos fällt trotz 308 m heraus, weil in
seinem Lee kein einziger Forecast-Ort dieser Bibliothek liegt — der Wächter
meldet solche Zonen als stumm.

**Kein Festland** (Attika, Athen, Ermioni, Korfos, Porto Heli, Epidavros),
obwohl Attika im Korridor steht: das Keulenmodell nähert ein *kompaktes*
Hindernis durch einen Kreis an, und eine Küstenlinie ist keines. Der Effekt der
attischen Halbinsel steckt stattdessen in der Düse des Kea-Kanals.

Wirkung, gemessen bei 26–30 kn aus N/NNE: **keine einzige Ampel ändert sich**,
die Zahl der Lee-Hinweise steigt von 35 auf 56. Genau so soll es sein — 18 der
30 Zonen stehen auf `niedrig` und beraten nur. Die Südhälfte des Korridors
spricht jetzt: `milos--polyaigos` nennt vier Zonen statt einer.

### Mittelpunkt und Radius kommen aus der Landmaske (`leeZones.ts`)

Die Zonen wurden zunächst von Hand geschrieben, mit `island.coordinates` als
Hindernis-Mittelpunkt. Das sind **kuratierte Bezugspunkte, keine
Landschwerpunkte** — bei Milos liegt er im Hafen mitten in der Bucht, also im
Wasser und 2 sm daneben; bei Tinos 3,3 sm, bei Naxos 3,0, bei Aegina 3,0. Für
eine Keule, die genau dort ansetzt, ist das kein Detail: sie beginnt an der
falschen Stelle und zeigt an der Insel vorbei.

Behoben ohne jede neue Messung — die Landmaske liegt im Repo. Zwei der drei
Geometriezahlen kommen jetzt aus ihr: `center` ist der Schwerpunkt der
zusammenhängenden Landfläche (Flutfüllung, damit Antiparos nicht in Paros'
Zone rutscht), `obstacleRadiusNm` die mittlere halbe **Querschnittsbreite** im
Meltemi-Band — nicht der Flächenradius, denn was einen Schatten wirft, ist die
Breite quer zum Wind.

Das **Festland-Tor** fiel dabei als Nebenprodukt an: reicht die zusammenhängende
Landfläche über ihr eigenes Suchfenster hinaus, ist sie keine Insel mehr. Bei
Methana, Salamina und Poros lief die Füllung über die schmale Straße aufs
Festland und lieferte Hindernisradien von 16, 11 und 7 sm. Die drei haben jetzt
keine Zone — derselbe Grund, aus dem Attika keine hat.

### Was mit Milos ist

Richtig platziert deckt die Milos-Zone **genau einen** Forecast-Ort:
`milos-kleftiko`, den klassischen Meltemi-Ankerplatz an der SW-Küste. Alles
andere um Milos liegt in Luv — die Etappen verlassen Adamas nach Norden, also
gegen den Wind. Vorher waren es 16 Etappenpunkte, und das war der Artefakt des
Mittelpunkts in der Bucht.

Damit ist auch die frühere Einschätzung hinfällig, ein Punktabruf im Lee von
Milos sei die lohnendste offene Messung: sie würde an dieser Bibliothek nichts
ändern. Die Zone ist richtig und wirkungslos zugleich.

### Stand der Kalibrierung

**Anker ist ein gemessener Wert**, kein abgelesener Farbton: der Punktabruf im
Poseidon-Modell vom 10.08.2026, 15:00 LT, südlich von Ios — `wind: 12 km/h`
(6,5 kn) bei rund 32 km/h (17 kn) freier Anströmung in derselben Kachel, also
Faktor **0,37** direkt hinter der Insel. Alle anderen Faktoren sind daraus nach
Gipfelhöhe abgestuft. Die Keulenlängen folgen der Faustregel `lobeNm ≈
Gipfelhöhe / 60`, ebenfalls empirisch aus denselben Bildern (Naxos, 1004 m:
Lee-Zunge ~15–20 sm; Ios, 713 m: ~10–12 sm).

`confidence` ist dabei ein **Tor**, keine Verzierung:

- **`'mittel'`** = Lage und Ausdehnung sind im Modell abgelesen, der Faktor ist
  vom Ios-Messwert nach Höhe abgestuft. Diese Zonen bewerten mit.
- **`'niedrig'`** = die Zone ist nur aus Nachbarn hochgerechnet (Kythnos, die
  drei Düsen ausser Kea-Kanal). Sie beraten weiter, drehen aber keine Ampel.
- **`'hoch'`** ist nirgends vergeben: dafür müsste der Faktor je Zone an
  mehreren Windstärken abgerufen sein, nicht einmal an einer Nachbarinsel.

Screenshots sind damit die **Kalibrier**quelle und nicht die Datenquelle —
nachkalibriert wird pro Saison, nicht täglich.

Zwei Tests halten die Kuration ehrlich: keine Zone darf wirkungslos sein (bei
der Erstkalibrierung traf die Serifos-Zone zunächst keinen einzigen
Forecast-Ort), und keine Düsen-Zone darf über einem Liegeplatz liegen — wie
exponiert ein Hafen ist, sagt sein Schutzsektor, nicht eine Fläche für die
offene Passage.

### Der Lee-Korridor rettet den Rückweg nicht — und das ist die richtige Antwort

Gemessen auf der echten Bibliothek bei 26–30 kn aus N bis NE hebt die
Lee-Bewertung **keine** rote Etappe des westlichen Korridors. Das ist kein
Fehler der Mechanik, sondern der Befund. Eine Etappe wird gegen ihren
*schlechtesten* Punkt bewertet, und der Faktor je Punkt sieht so aus (Wind aus
Nord, `—` = kein Schatten):

```
sifnos--serifos    kamares —  wp0 —  wp1 0,45  wp2 0,45  livadi 0,45
serifos--kythnos   livadi 0,45  wp0 0,45  wp1 0,45  wp2..wp6 —  merichas —
kythnos--athen     loutra 0,91  wp0 —  wp1 0,64  wp2 —  wp3 —  alimos —
```

Das Muster ist bei jeder Etappe dasselbe: **Abdeckung an den Enden, freier Wind
in der Mitte.** Die Korridor-Etappen queren genau die Lücken zwischen den
Inseln, und die Lücken sind der Ort, an dem der Meltemi steht. `serifos--kythnos`
hat 20 sm offenes Wasser zwischen den beiden Schatten — kein Windschatten macht
die segelbar, und die App hat recht, wenn sie das rot nennt.

Damit ist auch klar, was der Lee-Korridor wirklich ist: ein **taktischer**
Vorteil (wo man die Schläge unter Land legt, wo man ausruht, wo man loskommt),
kein **strategischer** (er macht den Rückweg im Starkwind nicht sicher). Genau
das sollte eine Planungshilfe sagen, statt eine Sicherheit zu versprechen, die
in den Zahlen nicht steckt.

### Die Kurse liegen jetzt im Schatten (`leeWaypoints.ts`)

**Skipper-Regel 2026-08-07:** „Ein Katamaran segelt bei Wind und Welle einfach
nicht besonders gut. Insgesamt ist eine angenehmere, längere Fahrt grundsätzlich
einer kürzeren im Wind vorzuziehen." Damit ist die Zielgrösse der Etappen-
Bibliothek nicht mehr die kürzeste Linie, sondern die geschützteste, die man in
vertretbarer Zeit fährt.

`seeding/tools/leeWaypoints.ts` setzt das um: je Insel-Paar sucht es zwei
Kontrollpunkte auf einem Raster seitlicher Versätze, legt den Kurs landfrei und
bewertet ihn. Die Zielfunktion ist **nicht** blosse Abdeckung — das war der
erste Versuch, und er hat `paros--sifnos` von grün auf rot gedreht, weil der
Bogen in Sifnos' Schatten führte, Kamares aber im Nordwesten liegt: die
Ansteuerung aus dem Lee heraus wurde ein Schlag mit 9° TWA. Gelernt daraus:

- **Belastung statt Abdeckung.** Der Lee-Faktor wird mit dem Kurs zum Wind
  gewichtet (gegenan × 2,0, halbwind × 1,0, raum × 0,7). Die Gewichte stehen
  schon in den Parametern: `kreuzGelbAbKn` 10 gegen `halbwindGelbAbKn` 20 —
  derselbe Wind ist gegenan doppelt so unangenehm.
- **Eine harte Schranke obendrauf.** Ein Umweg darf keinen Kreuz-Abschnitt
  schaffen, den die alte Bahn nicht hatte. Die App bewertet ein *Maximum*
  (FR16), nicht ein Mittel — eine Stunde Aufkreuzen über 25 kn macht die Etappe
  rot, egal wie angenehm die übrigen zehn waren.
- **Der Wechselkurs in einem Satz:** jede zusätzliche Seemeile muss **zehn
  Prozent** weniger Wind bringen (Skipper-Preis 2026-08-07, nachdem ein Prozent
  je Meile Umwege von fünf Meilen für zwölf Prozent durchliess). Ein strenger
  Kurs: er lässt praktisch nur Bahnen zu, die den Schutz fast geschenkt
  bekommen — eine bessere Linie durch dieselbe Distanz, nicht ein Bogen darum
  herum. Dazu harte Deckel von +35 % und +6 sm.
- **Dieselbe Latte wie der Wächter.** Der erste Lauf erzeugte Wegpunkte auf
  Kimolos und im Antiparos-Kanal, die `pathCrossesLand` durchgelassen und
  `libraryGeometry.test.ts` gefunden hat. Das Werkzeug tastet die Landmaske
  jetzt mit derselben Auflösung und denselben Toleranzen ab wie der Test.

Ergebnis bei diesem Preis: **13 Etappen umgelegt, zusammen +4,8 sm** über die
ganze Bibliothek. Grösster Umweg `milos--sifnos` +1,5 sm; **sechs Etappen werden
ganz ohne Umweg besser**, nur durch einen günstigeren Kurs zum Wind. Die
Belastung sinkt dort, wo es zählt: `paros--polyaigos` −16 %, `milos--sifnos`
−13 %, `kythnos--serifos` −12 %.

**Was der strenge Preis kostet, ehrlich beziffert.** Bei einem Prozent je Meile
hätte das Werkzeug 17 Etappen umgelegt (+24,2 sm) und dabei `syros--kythnos` von
**rot auf gelb** gehoben sowie `serifos--sifnos` von gelb auf grün — beide
brauchten dafür rund 3 sm Umweg und fallen bei zehn Prozent je Meile heraus. Der
strenge Kurs erntet also die kostenlosen Verbesserungen und verzichtet auf die
bezahlten. Bei 26–30 kn aus N/NNE ändert sich damit **keine** Ampel; zwei
Etappen gehen grün → gelb bei unveränderter Zeit und Distanz, was die
Grün-Sperre ist und keine schlechtere Passage. Die übrigen 37 bleiben gleich.

Wer den Preis anders setzen will, ändert `UMWEG_STRAFE_PRO_NM` im Werkzeug und
lässt es neu laufen — es ist idempotent.

Weil der Kurs absichtlich länger wird, ändert dieses Werkzeug als einziges auch
`distanceNm` — der **gemessene** Umweg wird auf die recherchierte Distanz
addiert, und `distanceNote` sagt in jeder betroffenen Etappe, wer das getan hat
und um wie viel. Ohne das würde die Simulation den neuen Weg mit der alten Länge
rechnen: Abdeckung geschenkt, ohne den Umweg zu bezahlen.

**Eine Bahn je Paar, nicht je Richtung:** der Schatten ist eine Eigenschaft des
Wassers, nicht der Fahrtrichtung, und 21 der 30 Paare sind ohnehin nur in einer
Richtung gespeichert (die Gegenrichtung wird gespiegelt abgeleitet). Der Preis
ist genannt: auf dem Hinweg raumschots kostet die Abdeckung Fahrt, ohne viel
Bequemlichkeit zu bringen.

### Wie der Korridor gefunden wurde

Die zweite Bildserie (Zoom auf Kea–Kythnos–Serifos, Meltemi aus NNE ~025°) zeigt
die Abdeckung als **zusammenhängende türkise Bahn** von Kea über Kythnos bis
Serifos. Sie liegt aber nicht auf der Verbindungslinie der Inseln: ein Schatten
läuft nach **SSW** (Windrichtung + 180°), die kuratierten Etappen laufen
SSE/NNW. Die Kurse streifen die Abdeckung deshalb nur am Rand.

Gemessen als Anteil der Strecke im Lee, wenn man den ganzen Kurs rechtwinklig
nach Westen versetzt (Wind aus 025°, Abtastung 0,5 sm; in Klammern der mittlere
Faktor über die Strecke):

| Etappe | unverändert | +3 sm West | +5 sm West | +7 sm West |
|---|---|---|---|---|
| `serifos--kythnos` | 45 % (Ø0,84) | **73 % (Ø0,79)** | 42 % | 21 % |
| `kythnos--kea` | 34 % (Ø0,83) | **83 % (Ø0,72)** | 60 % | 43 % |
| `sifnos--serifos` | 17 % (Ø0,91) | 42 % | 58 % | **75 % (Ø0,79)** |
| `kythnos--athen` | 18 % | 26 % | 29 % | 11 % |

Ein Versatz von rund **3 sm nach Westen** verdoppelt die Abdeckung auf den
beiden Kernetappen des Korridors; `sifnos--serifos` braucht eher 5–7 sm. Der
lange Schlag nach Attika profitiert kaum — er quert offenes Wasser.

Das ist eine Frage an die **kuratierten Wegpunkte**, nicht an die Kuration der
Zonen: der Umweg kostet Distanz und bringt Abdeckung. Solange die Wegpunkte
liegen, wo sie liegen, bleibt der Befund oben bestehen.

Sichtbar wird die Abdeckung trotzdem an jedem Etappentag — als Hinweiszeile mit
Modellwind, Lee-Wind und Fallböen-Warnung, und in der Rückweg-Empfehlung.

### Und Poseidon direkt?

Ginge — kostet aber ein Backend, das dieses Projekt nicht hat. HCMR verteilt
über THREDDS (OPeNDAP, typischerweise auch NCSS für Punkt-Zeitreihen); der
Blocker ist CORS plus reines Hosting. Eine geplante Cloud Function könnte die
Ortsmenge abrufen und nach Firestore legen; Poseidon hinge dann als drittes,
noch feineres **Nahfeld** in `mergeNearFar` — derselbe Mechanismus, kein neuer.
Die Korrektur hier ersetzt das nicht, sie holt den Teil, der planbar ist.

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
