# Review: Edge Case Hunter — sailgreece-router MVP

**Scope:** `git diff ee58689..HEAD` (Branch `claude/create-prd-5twc39`), 82 Dateien — kompletter Neubau `src/` + `seeding/` + Konfig. `_bmad-output/` ignoriert. Methode: erschöpfende Pfad-/Grenzwert-Aufzählung; berichtet werden **nur unbehandelte** Pfade. Keine Schweregrade (skill-konform), aber Finding 1 hat unmittelbare Fachlogik-Wirkung.

**Soll-Referenzen:** `_bmad-output/implementation-artifacts/spec-mvp-sailgreece-router.md` (I/O-Matrix), ARCHITECTURE-SPINE (AD-1…AD-11).

**Deletion-Check (Step 4):** Der Diff löscht nur die alte 1-Zeilen-README — keine fachlich relevante Löschung, Check entfällt.

**Explizit geprüft und als behandelt verworfen (Auswahl):** Nord-Wrap 330–60 inklusiv (`sectorContains`, korrekt inkl. Grenzen), halboffenes Nachtfenster 18:00→09:00 Athens→UTC (`nightWindow`/`hourIndices`), Offset nur in `polar.ts` (Offset nicht auf stehendes Boot), Marine-Horizont < Wetter → `null` → `unbewertet` (nie grün), Marine-API-Ausfall killt Wind nicht, invalides Platz-Dokument sichtbar als `unbewertet`, manual > gps Präzedenz, approved-Gate mit Exit ≠ 0, worstAmpel-Ordnung rot > unbewertet > gelb > gruen, Warten in `packLegsFeasible` auch an roten Tagen erlaubt, Etappe > 24 h → rot, `hourIndexAt` off-axis → `unbewertet` in `assessLeg`.

---

## Findings (21)

### 1. Umgedrehte Etappen verlieren ihre Wegpunkt-Forecasts — Rückkehr ab Amorgos/Santorin dauerhaft „Horizont"
**Ort:** `src/domain/ppr.ts:165-175` (`reverseLeg`) × `src/domain/scoring.ts:88-100` (`legPoints`/`legWaypointKey`) × `src/adapters/openMeteo.ts:45-63` (`collectLocations`).
**Trigger:** `remainingReturnLegs` dreht kuratierte Etappen um (Konnektor auf die Rückfallkette). `reverseLeg` vergibt eine **neue id** (`amorgos--naxos`), `legPoints` bildet daraus Wegpunkt-Keys `leg:amorgos--naxos:0` — `collectLocations` hat aber nur `leg:naxos--amorgos:0` gefetcht. `naxos--amorgos` und `naxos--santorin` haben beide Wegpunkte.
**Folge:** Jede Stunde der umgekehrten Etappe liefert am Wegpunkt `windAt = null` → Verdict `unbewertet`; sobald der Fortschrittspunkt der Wegpunkt ist, kippt die ganze Etappe auf `unbewertet`. `packLegsFeasible` stuft solche Tage als „admissible-but-unconfirmed" ein → Rückkehr-Machbarkeit ab Amorgos/Santorin ist **nie `feasible`, immer bestenfalls `horizon`** — auch bei vollständigem Forecast. PPR und Optionszustände (`verlaengerung-amorgos`/`-santorin` enden dort) bleiben dauerhaft mit Vorbehalt.
**Guard-Skizze:** `reverseLeg` behält die Original-id für die Forecast-Keys: `key: legWaypointKey(leg.id, leg.waypoints.length - 1 - n)` (Spiegel-Index), oder `collectLocations` fetcht Keys zusätzlich in Gegenrichtung.

### 2. Restplan-Suche übersieht Doppel-Etappen-Tage am Deadline-Rand
**Ort:** `src/domain/options.ts:62-67` (`restPlanFeasible`).
**Trigger:** Schleife startet bei `arrivalDay = startDay + legs.length - 1` (1 Etappe/Tag). `packLegsFeasible` erlaubt aber zwei kurze Etappen an einem Tag — Ankunft kann früher liegen. Ist `deadline < startDay + legs.length - 1`, läuft die Schleife nie.
**Folge:** Option fälschlich `zu`/`schliesst` einen Tag zu früh, obwohl ein zulässiger Plan mit Doppeltag existiert (z. B. Serifos→Sifnos→Paros an einem Tag, wie im Brief).
**Guard-Skizze:** `for (let arrivalDay = startDay + Math.ceil(legs.length / 2) - 1; ...)`.

### 3. Schließtag-Scan bricht am Horizont ab und meldet uneingeschränkt „offen"
**Ort:** `src/domain/options.ts:145-152, 164-171`.
**Trigger:** Beim Suchen des Schließtags: `if (f === 'horizon') break;` — danach fällt der Code in den `offen`-Zweig ohne `closesOnDay` und **ohne Reason/Vorbehalt**.
**Folge:** Eine Option, deren Schließtag knapp jenseits des Forecast-Horizonts liegen kann, erscheint als uneingeschränkt „offen" — die I/O-Matrix verlangt für Horizont-Fälle sichtbaren Vorbehalt.
**Guard-Skizze:** `reasons.push('Schließtag jenseits des Horizonts nicht bestimmbar');` (oder Zustand `offen-horizont`).

### 4. Nächste-Insel-Ableitung ohne Plausibilitätsradius
**Ort:** `src/domain/assess.ts:34-39` (`deriveCurrentIslandId`).
**Trigger:** GPS-Fix weit außerhalb des Reviers (Flughafen, Zuhause, falsches Gerät) → nächstgelegener Platz gewinnt ohne Distanz-Obergrenze.
**Folge:** Boot wird stumm einer Kykladen-Insel zugeordnet; alle Tagesoptionen/PPR beziehen sich auf eine falsche Position.
**Guard-Skizze:** `if (best && best.nm > MAX_SNAP_NM) return null;` (z. B. 30 sm) + Reason im Assessment.

### 5. `athensOffsetMinutes`: Stunde „24" wird korrigiert, der Tag nicht
**Ort:** `src/domain/time.ts:22-35`.
**Trigger:** `hour12: false` ohne `hourCycle: 'h23'` kann implementationsabhängig `hour = 24` liefern; `get('hour') % 24` setzt die Stunde auf 0, übernimmt aber die übrigen Datumsteile unverändert → `wallMs` um einen Tag daneben, Offset um ±1440 min falsch.
**Folge:** Fenstergrenzen (Nacht-/Etappenfenster) um einen Tag verschoben — genau an Mitternachtsgrenzen.
**Guard-Skizze:** `hourCycle: 'h23'` in den `Intl.DateTimeFormat`-Optionen setzen (dann ist `% 24` obsolet).

### 6. DST-Lücke/Ambiguität in `athensToUtcMs` unbehandelt
**Ort:** `src/domain/time.ts:38-49`.
**Trigger:** Nicht existierende (Frühjahrs-Sprung 03:00→04:00) bzw. doppelte (Herbst) Athens-Wandzeiten; die 2-Iterationen-Heuristik wählt stillschweigend einen Zeitpunkt ohne definierte Regel.
**Folge:** Für den August-Törn irrelevant, aber `tripStartDate` ist frei konfigurierbar — Fenstergrenzen an DST-Tagen um 1 h unbestimmt.
**Guard-Skizze:** Kommentar/Assertion der Wahlregel oder dritte Iteration mit Konvergenz-Check.

### 7. Keine Cross-Feld-Validierung der Params
**Ort:** `src/domain/schema/params.ts:36-58` (+ Konsumenten `time.ts:72-82`, `scoring.ts:33-60`, `ampel.ts:56`).
**Trigger:** Schema validiert Felder nur einzeln. Unbehandelte Kombinationen: `nightEndHourAthens >= nightStartHourAthens` (Fenster wird >24 h, Ende ist fix „Tag N+1"), `targetDayHours > maxSailHours + maxMotorHours` (gruen trotz Überschreitung des harten Max), `gelbReserveKn >= sector.maxKn` (grün unerreichbar), `returnByEveOfDay - 1 - bufferDays < 1`.
**Folge:** Fehlkonfiguration im Firestore-`config`-Dokument (AD-8: ohne Redeploy änderbar!) erzeugt stumm sinnlose Fenster/Ampeln.
**Guard-Skizze:** `.refine()` auf `ParamsSchema`, z. B. `p => p.nightEndHourAthens < p.nightStartHourAthens` und `p.targetDayHours <= p.maxSailHours + p.maxMotorHours`.

### 8. Sektor mit `fromDeg === toDeg` wird stiller Vollkreis
**Ort:** `src/domain/ampel.ts:40` (`sectorContains`), Schema `src/domain/schema/shelter.ts:12-24`.
**Trigger:** Kurator-Tippfehler `350–350` (oder `0–0`) — normalisiert `from === to` → „geschützt aus allen Richtungen".
**Folge:** Platz kann in Wahrheit ungeschützten Richtungen grün zeigen — sicherheitsrelevant, und weder Import-Check noch Review-Markdown markieren den Fall.
**Guard-Skizze:** `.refine(s => normDeg(s.fromDeg) !== normDeg(s.toDeg) || (s.fromDeg === 0 && s.toDeg === 360), 'Punkt-Sektor: Vollkreis nur als 0–360')`.

### 9. Polar-Raster: aufsteigende Sortierung nirgends erzwungen
**Ort:** `src/domain/schema/polar.ts:8-23` × `src/domain/polar.ts:12-24` (`interp1`) × `seeding/parsePolar.ts:43-57`.
**Trigger:** Schema-Kommentar sagt „ascending", weder Zod-Refine noch Parser prüfen es (auch keine Duplikat-Prüfung der TWA-Zeilen/TWS-Spalten). `interp1` liefert für unsortierte `xs` falsche Bracketing-Intervalle bzw. fällt auf den letzten Index.
**Folge:** Ein unsortiertes/dupliziertes Polar-Dokument (Firestore-Handbearbeitung, AD-5-Hinweis!) interpoliert stumm falsche Bootsgeschwindigkeiten → falsche Etappendauern überall.
**Guard-Skizze:** `.refine(p => isStrictlyAscending(p.twaDeg) && isStrictlyAscending(p.twsKn))`.

### 10. TWA-Faltung falsch für |twa| > 360
**Ort:** `src/domain/polar.ts:28` (`rawPolarSpeedKn`).
**Trigger:** `Math.min(Math.abs(twa), 360 - Math.abs(twa)) % 360` — für `twa = 540` ergibt sich 0 (statt 180). Aktuelle Aufrufer liefern 0–180, die exportierte Funktion ist aber unguarded.
**Folge:** Zukünftiger Aufrufer mit unnormalisiertem Winkel bekommt Am-Wind- statt Vor-Wind-Speed.
**Guard-Skizze:** `const t = Math.abs(twa) % 360; const folded = t > 180 ? 360 - t : t;`.

### 11. Windpfeile: „jetzt" außerhalb der Achse fällt stumm auf Stunde 0 zurück
**Ort:** `src/ui/views/MapView.tsx:70-72` (`hourIndexAt(Date.now(), …) ?? 0`).
**Trigger:** Gecachter/alter Snapshot (Query-Fehler → letzter Datenstand, laut Spec-Matrix erwünscht) oder Uhr vor Achsenbeginn → `hourIndexAt` liefert `null`.
**Folge:** Pfeile zeigen die **älteste** Forecast-Stunde, Tooltip suggeriert aktuelle Werte — genau im Fehlerszenario, in dem die Matrix „letzter Datenstand mit Zeitstempel" fordert.
**Guard-Skizze:** `if (nowIdx === null) return null;` (Pfeile weglassen oder Stunde im Tooltip nennen).

### 12. Persistierter TripState wird ungeprüft gespreadet
**Ort:** `src/app/tripContext.tsx:81-90` (`loadPersisted`).
**Trigger:** `JSON.parse` + `{ ...INITIAL, ...parsed }` ohne Formvalidierung: älteres/fremdes `sailgreece-trip-v1`-Objekt mit z. B. `position: {}` oder `position: "kea"` passiert.
**Folge:** `deriveCurrentIslandId` rechnet `distanceNm(NaN,…)` → alle Vergleiche `false` → erste Insel der Bibliothek gewinnt stumm; kein Fehler sichtbar.
**Guard-Skizze:** Zod-Schema für `TripState` (`TripPositionSchema` mit `lat/lon` Zahlen) und bei Fehlschlag `INITIAL`.

### 13. `deriveCurrentDay` mit fest verdrahtetem `+03:00`
**Ort:** `src/app/tripContext.tsx:98`.
**Trigger:** Athens-Mitternacht wird als fixes `+03:00` (Sommerzeit) angenommen statt über die vorhandene `Europe/Athens`-Logik in `time.ts`. Für einen konfigurierten Törn außerhalb der Sommerzeit (AD-8: `tripStartDate` ist Parameter) verschiebt sich der Tageswechsel um 1 h.
**Folge:** Törntag springt eine Stunde zu früh/spät — Nachtfenster und Tagesoptionen beziehen sich auf den falschen Tag N.
**Guard-Skizze:** `const start = athensToUtcMs(tripStartDate, 0);`.

### 14. Törntag-Override wird nirgends geklemmt
**Ort:** `src/app/tripContext.tsx:47-48` (`SET_DAY`) × `src/app/usePlanning.ts:36-38`.
**Trigger:** Reducer akzeptiert jedes `day`; persistierter `currentDayOverride` (z. B. aus altem State mit anderem `tripLengthDays`) fließt ungeklemmt in `snapshot.trip.currentDay`.
**Folge:** Tag > `tripLengthDays` oder < 1 → Nachtfenster jenseits der Achse (alles `unbewertet`), Select zeigt einen Wert außerhalb der Optionsliste.
**Guard-Skizze:** in `usePlanning`: `Math.min(Math.max(override, 1), params.tripLengthDays)`.

### 15. Modell-Id unkodiert im Meta-URL-Pfad
**Ort:** `src/adapters/openMeteo.ts:111` (`fetchModelRunIso`).
**Trigger:** `params.forecastModel` (freier String aus Firestore-Config) wird in den Pfad interpoliert — beim Forecast-URL wird `encodeURIComponent` benutzt, hier nicht. Ein Wert mit `/`, `?`, `#` trifft einen beliebigen Pfad.
**Folge:** Modelllauf-Zeitstempel still `null` bzw. Request gegen falschen Endpoint.
**Guard-Skizze:** `.../data/${encodeURIComponent(model)}/static/meta.json`.

### 16. Nicht-JSON-200-Antwort umgeht die typisierte Fehlerklasse
**Ort:** `src/adapters/openMeteo.ts:105` (`return resp.json();` in `fetchJson`).
**Trigger:** HTTP 200 mit Nicht-JSON-Body (Captive Portal im Marina-WLAN, Proxy-Fehlerseite) → `SyntaxError` statt `OpenMeteoError`, `endpoint`-Kontext geht verloren.
**Folge:** UI-Fehlertext ohne Endpoint-Zuordnung; der Marine-`catch` fängt zwar alles, der Forecast-Pfad meldet aber kryptisch.
**Guard-Skizze:** `try { return await resp.json(); } catch { throw new OpenMeteoError('… liefert kein JSON', endpoint); }`.

### 17. Stundenachse nur von Location 0 — abweichende Achsen anderer Locations still fehlausgerichtet
**Ort:** `src/adapters/openMeteo.ts:176-190`.
**Trigger:** `times` stammt ausschließlich aus `forecastList[0]`; die Serien aller weiteren Locations werden per **Index** auf diese Achse gelegt (`seriesOf(..., times.length)`). Marine wird per Timestamp gemappt, Wind nicht.
**Folge:** Liefert die API für eine Location eine versetzte/kürzere Achse (Modell-Randlage), verrutschen deren Windwerte stundenweise — falsche Ampeln ohne jedes Signal.
**Guard-Skizze:** pro Location `hourly.time[0]` gegen `times[0]` prüfen und bei Abweichung wie Marine per Timestamp mappen (oder auf `null` setzen).

### 18. Import-Cross-Checks decken vier Referenz-Invarianten nicht ab
**Ort:** `seeding/importToFirestore.ts:113-125`.
**Trigger/Folge (je ein unbehandelter Pfad):**
- **Doppelte Platz-Ids** über Insel-Dateien: `batch.set` überschreibt still das erste Dokument.
- **Gleiche Leg-Id in mehreren Routen mit abweichenden Wegpunkten:** `collectLocations` dedupliziert per Key — die zweite Route bekommt Forecasts der Koordinaten der ersten.
- **Fehlende `rueckfallkette-west`/`isReturnChain`-Route:** Import läuft durch, PPR meldet zur Laufzeit nur „Keine Rückfallkette".
- **`baseIslandId`/`basePlaceId` aus config zeigen ins Leere:** Rückkehr-Logik (`returnFeasibleStarting`, letzter-Ausweg-Reversal) findet die Basis nie.
**Guard-Skizze:** Uniqueness-Sets + `fail(...)` für jede Verletzung; `routes.routes.some(r => r.id === 'rueckfallkette-west' || r.isReturnChain)` prüfen; `placeIds.has(config.parameters.basePlaceId)` prüfen.

### 19. Firestore-Batch-Limit (500 Ops) unguarded
**Ort:** `seeding/importToFirestore.ts:147-162`.
**Trigger:** Ein einziges `db.batch()` für alle Inseln + Plätze + Routen + Config. Aktuell ~50 Writes; wächst die Bibliothek über 500, wirft `commit()`.
**Folge:** Import bricht mit generischem Firestore-Fehler ab (teilweise atomar, aber ohne klare Meldung).
**Guard-Skizze:** Writes in 500er-Chunks committen oder `if (ops > 500) fail(…)`.

### 20. Tagesoptions-Dedupe zeigt bei Ziel-Insel-Kollision nur die Etappe der ersten Route
**Ort:** `src/domain/options.ts:196-217` (`deriveDayOptions`).
**Trigger:** Zwei Routen, deren nächste Etappe zur selben Ziel-Insel führt, aber mit **unterschiedlicher Etappen-Definition** (andere Wegpunkte/Distanz/anderer Zielplatz). Dedupe läuft über `toIslandId`; nur `servesRouteIds` wird ergänzt.
**Folge:** Karte zeigt Dauer/Score der Etappe von Route A, behauptet aber, auch Route B zu bedienen — deren Etappe anders bewertet sein kann. In den aktuellen Daten identisch, per Schema nicht garantiert (siehe Finding 18).
**Guard-Skizze:** Dedupe-Key `next.id` statt `next.toIslandId`, oder bei abweichender `legId` separate Option.

### 21. Forecast-QueryKey enthält die Bibliotheks-Identität nicht
**Ort:** `src/app/usePlanning.ts:28-34`.
**Trigger:** `queryKey: ['forecast', model]` — ändert sich die Bibliothek (Firestore-Refetch mit neuem Platz/neuer Route), bleiben Key und gecachte Antwort gleich; die normative Ortsmenge (AD-3) ist dann größer als die gefetchte.
**Folge:** Neue Plätze/Wegpunkte bleiben bis zu 1 h `unbewertet`, obwohl „Aktualisieren" gedrückt werden könnte — kein Hinweis auf die Ursache.
**Guard-Skizze:** `queryKey: ['forecast', model, collectLocations(bundle.library).map(l => l.key)]` (oder ein Bibliotheks-Hash).

---

## Findings als JSON (Skill-Ausgabeformat)

```json
[
  {"location":"src/domain/ppr.ts:165-175 + src/domain/scoring.ts:88-100","trigger_condition":"Umgekehrte Etappe mit Wegpunkten: Forecast-Keys der neuen Leg-Id nie gefetcht","guard_snippet":"key: legWaypointKey(originalLeg.id, originalLeg.waypoints.length - 1 - n)","potential_consequence":"Rueckkehr ab Amorgos/Santorin dauerhaft 'horizon', nie 'feasible'"},
  {"location":"src/domain/options.ts:62-67","trigger_condition":"deadline < startDay + legs.length - 1, aber Doppel-Etappen-Tag waere machbar","guard_snippet":"for (let arrivalDay = startDay + Math.ceil(legs.length / 2) - 1; ...)","potential_consequence":"Option faelschlich 'zu' obwohl zulaessiger Restplan existiert"},
  {"location":"src/domain/options.ts:145-171","trigger_condition":"Schliesstag-Scan trifft 'horizon' vor 'infeasible'","guard_snippet":"reasons.push('Schliesstag jenseits des Horizonts nicht bestimmbar')","potential_consequence":"Option zeigt uneingeschraenkt 'offen' trotz unbestimmtem Schliesstag"},
  {"location":"src/domain/assess.ts:34-39","trigger_condition":"GPS-Fix weit ausserhalb des Reviers","guard_snippet":"if (best && best.nm > MAX_SNAP_NM) return null;","potential_consequence":"Boot stumm falscher Insel zugeordnet, alle Optionen/PPR falsch"},
  {"location":"src/domain/time.ts:22-35","trigger_condition":"Intl liefert hour '24' um Mitternacht (h24-Cycle)","guard_snippet":"new Intl.DateTimeFormat('en-US', { ..., hourCycle: 'h23' })","potential_consequence":"Offset um 1440 min falsch, Fenster um einen Tag verschoben"},
  {"location":"src/domain/time.ts:38-49","trigger_condition":"Nicht existierende/doppelte Athens-Wandzeit an DST-Grenze","guard_snippet":"dritte Iteration + Konvergenz-Assertion dokumentieren","potential_consequence":"Fenstergrenzen an DST-Tagen um 1 h unbestimmt"},
  {"location":"src/domain/schema/params.ts:36-58","trigger_condition":"Inkonsistente Param-Kombination aus Firestore-Config (z.B. nightEnd >= nightStart)","guard_snippet":"ParamsSchema.refine(p => p.nightEndHourAthens < p.nightStartHourAthens)","potential_consequence":">24h-Nachtfenster oder gruen trotz Ueberschreitung des harten Budgets"},
  {"location":"src/domain/ampel.ts:40 + src/domain/schema/shelter.ts:12-24","trigger_condition":"Kuratierter Sektor mit fromDeg === toDeg (Tippfehler)","guard_snippet":"refine(s => normDeg(s.fromDeg) !== normDeg(s.toDeg) || (s.fromDeg===0 && s.toDeg===360))","potential_consequence":"Punkt-Sektor wird stiller Vollkreis-Schutz, gruen in Luv"},
  {"location":"src/domain/schema/polar.ts:8-23 + src/domain/polar.ts:12-24","trigger_condition":"Polar-Grid nicht aufsteigend/dupliziert (Handbearbeitung im Firestore)","guard_snippet":"refine(p => isStrictlyAscending(p.twaDeg) && isStrictlyAscending(p.twsKn))","potential_consequence":"Stumm falsche Interpolation, falsche Etappendauern ueberall"},
  {"location":"src/domain/polar.ts:28","trigger_condition":"rawPolarSpeedKn mit |twa| > 360 aufgerufen","guard_snippet":"const t = Math.abs(twa) % 360; const folded = t > 180 ? 360 - t : t;","potential_consequence":"540 grad faltet auf 0 statt 180: Am-Wind- statt Vorwind-Speed"},
  {"location":"src/ui/views/MapView.tsx:70-72","trigger_condition":"Date.now() ausserhalb der Forecast-Achse (alter gecachter Snapshot)","guard_snippet":"if (nowIdx === null) return null; // keine Pfeile","potential_consequence":"Windpfeile zeigen aelteste Stunde als 'jetzt'"},
  {"location":"src/app/tripContext.tsx:81-90","trigger_condition":"Korrupter/veralteter localStorage-State (position ohne lat/lon)","guard_snippet":"TripStateSchema.safeParse(parsed) mit Fallback INITIAL","potential_consequence":"distanceNm(NaN) waehlt stumm erste Insel der Bibliothek"},
  {"location":"src/app/tripContext.tsx:98","trigger_condition":"tripStartDate ausserhalb der Sommerzeit konfiguriert","guard_snippet":"const start = athensToUtcMs(tripStartDate, 0);","potential_consequence":"Toerntag-Wechsel um 1 h verschoben, falscher Tag N"},
  {"location":"src/app/tripContext.tsx:47-48 + src/app/usePlanning.ts:36-38","trigger_condition":"currentDayOverride ausserhalb [1, tripLengthDays] (persistiert/dispatcht)","guard_snippet":"Math.min(Math.max(override, 1), params.tripLengthDays)","potential_consequence":"Nachtfenster jenseits der Achse, alles 'unbewertet' ohne Erklaerung"},
  {"location":"src/adapters/openMeteo.ts:111","trigger_condition":"forecastModel-Config-String enthaelt '/', '?' oder '#'","guard_snippet":"`.../data/${encodeURIComponent(model)}/static/meta.json`","potential_consequence":"Meta-Request gegen falschen Pfad, Modelllauf still null"},
  {"location":"src/adapters/openMeteo.ts:105","trigger_condition":"HTTP 200 mit Nicht-JSON-Body (Captive Portal, Proxy)","guard_snippet":"try { return await resp.json(); } catch { throw new OpenMeteoError('kein JSON', endpoint); }","potential_consequence":"SyntaxError statt typisiertem Fehler, Endpoint-Kontext verloren"},
  {"location":"src/adapters/openMeteo.ts:176-190","trigger_condition":"Eine Location liefert abweichende/versetzte Stundenachse","guard_snippet":"pro Location hourly.time gegen times pruefen, sonst per Timestamp mappen","potential_consequence":"Windwerte stundenweise verrutscht, falsche Ampeln ohne Signal"},
  {"location":"seeding/importToFirestore.ts:113-125","trigger_condition":"Doppelte Platz-Ids / gleiche Leg-Id mit anderen Wegpunkten / fehlende Rueckfallkette / basePlaceId unbekannt","guard_snippet":"Uniqueness-Sets + fail(...); Existenz von 'rueckfallkette-west' und basePlaceId pruefen","potential_consequence":"Stilles Ueberschreiben, Forecast-Key-Kollision, PPR ohne Kette"},
  {"location":"seeding/importToFirestore.ts:147-162","trigger_condition":"Mehr als 500 Dokumente im einen Batch","guard_snippet":"Writes in 500er-Chunks committen","potential_consequence":"commit() wirft, Import bricht mit generischem Fehler ab"},
  {"location":"src/domain/options.ts:196-217","trigger_condition":"Zwei Routen mit unterschiedlicher naechster Etappe zur selben Ziel-Insel","guard_snippet":"seenTargets ueber next.id statt next.toIslandId dedupen","potential_consequence":"Angezeigte Dauer/Score gilt nur fuer erste Route, servesRouteIds behauptet beide"},
  {"location":"src/app/usePlanning.ts:28-34","trigger_condition":"Bibliothek aendert sich (neuer Platz/Route) bei gleichem forecastModel","guard_snippet":"queryKey: ['forecast', model, libraryLocationsHash]","potential_consequence":"Neue Orte bis zu 1 h 'unbewertet' trotz vorhandener API"}
]
```
