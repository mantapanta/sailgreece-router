# Review — Versions- & Realitäts-Check (Lens: web-researched vs. asserted)

- **Prüfobjekt:** `_bmad-output/planning-artifacts/architecture/architecture-sailgreece-router-2026-07-30/ARCHITECTURE-SPINE.md` (Revision 2, updated 2026-08-02)
- **Reviewer-Lens:** Jede committete Entscheidung muss web-recherchiert oder realitätsgeprüft sein statt aus Trainingsdaten behauptet. Brownfield-Regel: Das Repo ist die Realität — was das Repo deckt, braucht keine Web-Recherche; geflaggt wird nur, was weder Repo noch dokumentierte Verifikation deckt.
- **Methode:** Stack-Tabelle gegen `package.json` + `package-lock.json` (installierte, nicht deklarierte Versionen); fachliche Anker gegen `src/domain/`, `src/app/`, `src/adapters/`, `src/ui/`, `seeding/`, `firebase.json`, `firestore.rules`, `vitest.config.ts` geprüft.
- **Datum:** 2026-08-02

## Ergebnis in einem Satz

Die Stack-Tabelle ist vollständig repo-gedeckt (alle 10 Versionsangaben stimmen exakt mit `package-lock.json` überein — vorbildlich: „installiert und bestätigt am 2026-08-02" ist wahr); die verbleibenden Befunde betreffen zwei nicht-versionsbezogene Realitätsbehauptungen der Revision-2-Präambel und zwei kleine, nicht repo-verifizierbare Ökosystem-Aussagen.

---

## Verifikationsmatrix Stack (alle GEDECKT)

| Spine-Behauptung | Repo-Realität | Status |
| --- | --- | --- |
| Vite 8.2.0 | `package-lock.json` → 8.2.0 | ✅ exakt |
| React 19.2.8 | 19.2.8 (react + react-dom) | ✅ exakt |
| TypeScript 5.9.3 | 5.9.3 (`~5.9.0` in package.json) | ✅ exakt |
| Firebase JS SDK 12.16.0 | 12.16.0 | ✅ exakt |
| @vis.gl/react-google-maps 1.9.0 | 1.9.0 | ✅ exakt |
| TanStack Query 5.101.4 | 5.101.4 | ✅ exakt |
| Zod 4.4.3 | 4.4.3 | ✅ exakt |
| Vitest 4.1.10 | 4.1.10; `vitest.config.ts` vorhanden (node-env, `src/**/__tests__`) | ✅ exakt |
| firebase-admin 14.2.0, Node ≥ 22.18 | 14.2.0; `engines.node: ">=22.18"` | ✅ exakt |
| Vanilla CSS + Custom Properties | `src/ui/styles.css` existiert, keine CSS-Lib in deps | ✅ |
| AdvancedMarker nativ; Polyline als kopierte Beispielkomponente, gestrichelt via Symbol-`repeat` | `MapView.tsx:12` importiert `AdvancedMarker`; `src/ui/components/Polyline.tsx` mit dokumentiertem symbol-repeat-Workaround | ✅ |

## Verifikationsmatrix fachliche Anker (alle GEDECKT)

| Spine-Behauptung | Repo-Realität | Status |
| --- | --- | --- |
| Solver erweitert `packLegsFeasible`-Kern (AD-13) | `src/domain/ppr.ts:45` `export function packLegsFeasible(` | ✅ existiert |
| Rückfallkette fixe ID `rueckfallkette-west` (AD-10) | `src/domain/schema/route.ts:57` `RETURN_CHAIN_ROUTE_ID = 'rueckfallkette-west'`; Route in `seeding/data/routes.json:685`; Import-Gate prüft sie | ✅ |
| Ampel-Typ `'gruen'\|'gelb'\|'rot'\|'unbewertet'` aus `domain/schema` | `src/domain/schema/common.ts:8` `AmpelSchema = z.enum([...])` + `worstAmpel` | ✅ |
| `staleTime` ≈ 1 h (AD-7, FR13) | `src/app/usePlanning.ts:20` `STALE_TIME_MS = 3600_000`; genutzt in usePlanning + App.tsx QueryClient-Default | ✅ |
| Plan/TripContext in `localStorage`, Zod-validiert (AD-11) | `src/app/tripContext.tsx:81` `STORAGE_KEY = 'sailgreece-trip-v1'`, Zod-Parse beim Laden | ✅ |
| `nightWindow(N) = [18:00, N+1 09:00)`, `legWindow` Default 09:00 (AD-9) | `src/domain/time.ts:85ff` wortgleich normiert | ✅ |
| Polar-Offset +0,5 kn, `motorSpeedKn` = 8 in config (AD-8) | `src/domain/schema/params.ts:12,14` Defaults; `seeding/data/config.json` identisch | ✅ |
| Firestore Rules `read: true, write: false` (AD-5) | `firestore.rules` exakt so | ✅ |
| Hosting → `dist/` (AD-8) | `firebase.json` `"public": "dist"` | ✅ |
| Vitest-Fixtures mit Referenzfällen (AD-2) | `src/domain/__tests__/` mit 8 Test-Dateien + `fixtures.ts` | ✅ |
| FR24-Review-Markdown je Insel in `seeding/review/` | 14 Markdown-Dateien vorhanden | ✅ |
| `approved`-Gate beim Import (AD-10) | `seeding/importToFirestore.ts` per-File-Gate dokumentiert und implementiert | ✅ |
| Attributionen (Open-Meteo CC BY 4.0, CruisersWiki, NFR3-Hinweis) | `App.tsx:251–253`, `PlaceDetailView.tsx:160`, `App.tsx:190` | ✅ |
| Modul-/Baumstruktur (adapters, schema-Dateien, Views) | deckungsgleich; Pivot-Punkte (solver.ts, schema/leg|variant|plan) korrekt als NEU/kursiv markiert und noch nicht vorhanden | ✅ |

---

## Befunde

### B1 — MEDIUM: Präambel-Behauptung „Bestandscode hält AD-1 bis AD-11 nachweislich ein" gilt nur für die Revision-1-Fassung der ADs

- **Fundstelle:** Spine, Revisions-Präambel (Zeile 21–24): „Der Bestandscode (One-Shot-MVP) hält AD-1 bis AD-11 nachweislich ein; dieser Spine ratifiziert ihn."
- **Realität:** AD-3, AD-4, AD-5, AD-11 sind in Revision 2 *amendiert* und enthalten Regeln, die der Bestandscode nachweislich **nicht** einhält:
  - AD-5: „Top-Level-Collection **`legs`**" — existiert nicht; `src/adapters/firestore.ts:185–189` liest nur `islands`, `places`, `routes`, `config`; Legs liegen inline in Routen (`src/domain/schema/route.ts:48` `legs: z.array(LegSchema)` — nicht dedupliziert/First-Class).
  - AD-5/AD-11/AD-12: „der Plan (AD-12) liegt in `localStorage`" — es gibt noch kein Plan-Modell; persistiert wird der alte TripContext.
  - AD-11: „`trackedRouteId` entfällt zugunsten des Plans" — `trackedRouteId` existiert und ist aktiv in Gebrauch (`src/app/tripContext.tsx:26,43,71,97`, `usePlanning.ts:84`, `MapView.tsx:92`, `App.tsx:105`).
- **Risiko:** Ein Leser (oder Implementierungs-Agent) nimmt die amendierten ADs als bereits erfüllten Ist-Zustand und überspringt Umbau-Arbeit — genau die Sorte unbelegter Realitätsbehauptung, die diese Lens jagen soll.
- **Fix:** Präambel präzisieren: „…hält AD-1 bis AD-11 **in ihrer Revision-1-Fassung** nachweislich ein; die Revision-2-Amendments (Legs-Collection, Plan-Modell, Entfall `trackedRouteId`) sind Soll-Zustand des Umbaus." Alternativ die Ist/Soll-Differenz je amendiertem AD in einem Satz markieren (analog zur kursiv-Konvention im Structural Seed, die das bereits richtig macht).

### B2 — LOW: `[ADOPTED]`-Tag an AD-5 trotz Revision-2-Amendment mit Nicht-Ist-Elementen

- **Fundstelle:** Spine AD-5-Überschrift („…ein programmatischer Schreiber `[ADOPTED]`") vs. Präambel, die AD-5 als „amendiert" listet.
- **Realität:** Der adoptierte Kern (flache Collections, App strikt lesend, Rules, Seeding als einziger Schreiber, Rücktrag-Pflicht) ist repo-gedeckt. Die in Rev 2 eingefügten Teile (**`legs`**-Collection, „Plan liegt in localStorage") sind es nicht (siehe B1). Das Tag suggeriert einen durchgängig realitätsgeprüften Status.
- **Fix:** Tag qualifizieren (`[ADOPTED, Rev-2-Amendments offen]`) oder die neuen Satzteile als Umbau kennzeichnen.

### B3 — LOW: „TypeScript 5.9.3 (bewusst nicht 7.0)" — Ökosystem-Behauptung ohne dokumentierte Verifikation

- **Fundstelle:** Spine, Stack-Tabelle, Zeile TypeScript.
- **Realität:** 5.9.3 installiert ist repo-gedeckt (✅). Die Parenthese behauptet aber implizit Existenz/Reife von TypeScript 7.0 (natives Compiler-Port) — das ist weder aus dem Repo verifizierbar noch ist eine Web-Prüfung dokumentiert; Stand und Versionsnummer des TS-Native-Ports können sich seit Trainingsstand geändert haben.
- **Risiko:** Gering — die Entscheidung (bleiben auf installiertem 5.9.x) ist unabhängig davon richtig und repo-gedeckt.
- **Fix:** Entweder die Parenthese streichen (die installierte Version trägt die Entscheidung allein) oder mit einem Satz Verifikationsdatum/Quelle notieren.

### B4 — LOW: AD-8-Begründung „Firebase App Hosting (zielt auf SSR-Frameworks, braucht Blaze)" — externe Produktbehauptung ohne dokumentierte Verifikation

- **Fundstelle:** Spine AD-8, Prevents-Zeile.
- **Realität:** Die *Entscheidung* (klassisches Firebase Hosting, `dist/`-Deploy) ist repo-gedeckt (`firebase.json`) und trägt sich selbst. Die *Begründung* referenziert Eigenschaften eines externen Google-Produkts (App-Hosting-Zielgruppe, Blaze-Pflicht), die aus Trainingsdaten stammen und sich ändern können; keine Verifikation dokumentiert.
- **Risiko:** Gering — selbst wenn die Begründung veraltet, bleibt die Entscheidung für ein Solo-SPA korrekt.
- **Fix:** Begründung weicher formulieren („zum Entscheidungszeitpunkt auf SSR-Frameworks ausgerichtet") oder Verifikationsnotiz ergänzen.

### B5 — INFO: „Saronische Alternative … wird aus dem Seed entfernt" — korrekt als Zukunft formuliert, noch offen

- **Fundstelle:** Spine AD-4; `seeding/data/routes.json:6` (`saronische-alternative` noch vorhanden).
- **Bewertung:** Kein Widerspruch — der Spine formuliert die Entfernung als Umbau-Aufgabe (Futur). Nur als Tracking-Hinweis notiert, damit die Entfernung beim Pivot nicht untergeht.

### Positiv hervorzuheben

- Die Stack-Tabelle deklariert ihre Verifikationsmethode explizit („`package.json` ist die Quelle; installiert und bestätigt am 2026-08-02") — und die Behauptung hält der Prüfung gegen `package-lock.json` zu 100 % stand.
- Unbestätigte fachliche Werte sind konsequent als `[ASSUMPTION]`/`[ANNAHME: …]` markiert (returnDeadline, Worst-Case-Kalibrierung, Fähren-Datenform, reliableHorizonDays) statt als Fakten behauptet — genau richtig.
- Pivot-Elemente (solver.ts, Schema leg/variant/plan) sind im Structural Seed sauber als NEU/kursiv vom Bestand getrennt.

## Verdict

**PASS mit Auflagen (B1 beheben empfohlen).** Keine Version und kein technischer Anker ist aus Trainingsdaten behauptet — alles ist gegen das Repo verifizierbar und verifiziert. Die einzigen Schwächen sind eine zu pauschale Ist-Zustands-Behauptung in der Revisions-Präambel (B1/B2) und zwei harmlose, nicht repo-verifizierbare Ökosystem-Parenthesen (B3/B4).
