# Spec — Zielmodell v2: Planen und Absichern getrennt

Stand: 2026-08-05 · Status: normativ (ersetzt die Zielhierarchie aus AD-13, wo abweichend)
Entscheidungen des Skippers vom 2026-08-05 (Chat): Suchraum = kuratierte Etappen frei
kombinierbar; Liegeplatz-Wiederholung hart verboten, Insel-Wiederholung erlaubt.

## 1. Warum

Die App vermischte bisher zwei Rollen in einer Rechnung:

- **Planen** — den bestmöglichen Törn finden. Das braucht Optimismus: Forecast, wo er
  existiert; Extrapolation (Persistenz-Annahme), wo nicht.
- **Absichern** — täglich neu wissen, ab welchem Punkt man abbrechen und heimfahren
  muss, wenn das Wetter anders kommt als angenommen.

Der Meltemi-Worst-Case (30 kn N) stand als hartes K.-o. mitten im Options-Check
(`restPlanFeasible`), während die Plan-Gültigkeit ihn nur als Vorbehalt führte. Folge:
zwei widersprüchliche Machbarkeitsbegriffe (AD-3 verletzt), Santorin „zu", obwohl der
Solver einen gültigen Plan hätte bauen können — und weil jeder Kandidat als „Hinweg
entlang einer Variante + Rückfallkette" gebaut wurde und die Rückfallkette die
Umkehrung der Varianten ist, kam strukturell fast nur Pendeln heraus.

## 2. Das Zielmodell

### 2.1 Harte Bedingungen (nie verhandelbar, machen einen Plan ungültig)

1. FR16-Schwellen je Etappe nach Forecast (kein Aufkreuzen > 25 kn, Tagesbudgets,
   Nachtfahrt-Regeln) — jenseits des verlässlichen Horizonts unter der
   Persistenz-Annahme gerechnet und als `assumed` markiert (warnt, verurteilt nicht).
2. Ankunft an der Basis bis zum Stichtag (Datum UND Uhrzeit).
2'. Rückkehr nach aktuellem **Forecast** von jedem Plantag aus darstellbar.
   Der Worst-Case ist hier KEIN K.-o. mehr — er wandert in die Abbruch-Notation (§4).
3. FR31: fährgängige Insel am Zustiegstag.
4. **NEU — Liegeplatz-Regel (hart):** Kein Übernachtungsplatz kommt zweimal vor.
   Gezählt werden AUFENTHALTE (aufeinanderfolgende Nächte auf derselben Insel sind
   EIN Aufenthalt). Eine Insel darf mehrfach angelaufen werden, solange sie genug
   kuratierte Plätze für jeden Aufenthalt hat. Die Basis ist ausgenommen.
   Verletzung = strukturell (`wiederholung`), nicht sicherheitsrelevant: sie macht
   den Plan ungültig, schaltet die Rest-Trip-Ampel aber nicht rot.

### 2.2 Optimierung (lexikografisch, in dieser Reihenfolge — `preferred`)

1. Gültig vor ungültig; unter Ungültigen erst weniger Sicherheitsverletzungen,
   dann weniger Verletzungen überhaupt (FR18: die App antwortet immer).
2. **Möglichst weit nach Süden** — Reichweite = Distanz Basis → fernste Insel.
3. **Möglichst viele verschiedene Inseln.**
4. Weniger Nachgeben auf der Eskalationsleiter (Doppelschlag, Nachtfahrt) —
   VOR dem Wegstunden-Band, mit Absicht: zwei kurze Schläge an einem Tag füllen
   das Band besser als einer, aber der Doppelschlag bleibt eine Nachgabe
   ("ein Tag, eine Verbindung", Skipper 2026-08-05) und darf nicht zum
   Normalfall werden, nur weil er Stunden hübscher verteilt. Für mehr
   Reichweite oder mehr Inseln (Kriterien 2–3) gewinnt er weiterhin.
5. **Wegstunden-Band 5–7 h/Tag** — Summe der Abweichungen der Etappentage vom Band
   `[stageHoursBandMinH, stageHoursBandMaxH]`, kleiner ist besser. Zu kurze Tage
   sind genauso eine Abweichung wie zu lange.
6. **1–2 Hafentage** — Abstand der Hafentagszahl vom Zielband
   `[harbourDays, harbourDaysTargetMax]`, kleiner ist besser.
7. Uhrzeigersinn (Revier-Empfehlung: mit dem Meltemi im Rücken nach Süden).
8. Frühere Wende (Reserve auf dem Heimweg).
9. Mehr Etappen; zuletzt Kandidaten-Id alphabetisch (Determinismus).

### 2.3 Suchraum

Kandidaten sind **Rundkurse über den Graphen der kuratierten Etappen** (inklusive
Gegenrichtungen, `legIndexWithReverses`): jede Insel höchstens einmal, plus höchstens
EINE Stichfahrt (Insel anlaufen und auf derselben Etappe zurück — nötig für
Sackgassen wie Amorgos). Nur recherchierte Verbindungen, aber freie Komposition
(revidiert AD-13 „never a free-form graph" — der Graph bleibt kuratiert, frei ist
nur die Reihenfolge). Zusätzlich bleiben die bisherigen Kandidaten (Varianten-Präfix
+ Rückfallkette, Direktrückkehr, Bleiben) als Rückfallebene im Rennen; sie verlieren
gegen vielfältige Runden über die Kriterien, nicht per Verbot.

### 2.4 Wetterbasis der Planung

Geplant wird gegen Forecast + Persistenz-Annahme (wie AD-13 revised): jenseits des
verlässlichen Horizonts wird gerechnet, markiert (`basis: 'annahme'`) und als
Vorbehalt geführt (`horizonDependent` blockt Grün). Der Worst-Case bindet in der
PLANUNG nichts mehr.

## 3. Ein Machbarkeitsbegriff (AD-3 wiederhergestellt)

`assessRouteOption` beantwortet „geht dieses Ziel?" ab jetzt mit DERSELBEN Maschine
wie die Hauptroute: `completePlan` mit Wendepunkt-Filter. Die Messlatte ist die des
FR2-Zeugen: **offen = es existiert ein Plan ohne Sicherheits-, Termin- oder
Zustiegs-Verletzung.** Strukturelle Defizite (Hafentage über der Notgrenze, ein
wiederholter Liegeplatz) schließen ein ZIEL nicht — sie stehen am konkreten Plan.
offen-horizont = tragfähig, hängt aber an der Annahme; zu = kein tragfähiger Plan,
mit den Verletzungen des besten Versuchs als Begründung. Der Schliesstag-Scan
(`restPlanFeasible`) rechnet forecast-basiert gegen den echten Stichtag (nicht mehr
gegen den Puffertag — die Frist einer Option und die Gültigkeit eines Plans messen
am selben Tag).

## 4. Absichern: die tägliche Abbruch-Notation

Für jeden zukünftigen Plantag (außer an der Basis) rechnet `deriveReturnChecks`:

- `byForecast` — Rückkehr ab morgen nach aktuellem Forecast (bis Stichtag),
- `underWorstCase` — Rückkehr ab morgen, wenn der volle Meltemi einsetzt
  (bis PoR-Tag inkl. Puffer).

Daraus je Tag ein Status mit Anweisung:

- **meltemi-fest** — Heimweg hält auch im Worst-Case. Weiterfahren unkritisch.
- **wetterfenster** — Heimweg trägt nur nach Forecast: *Frischt der Nordwind über
  die Aufkreuz-Schwelle auf, hier abbrechen und den Rückweg einleiten.* Das ist die
  tägliche Entscheidung, die der Skipper ab diesem Punkt bewusst trifft.
- **kritisch** — Rückkehr schon nach Forecast nicht mehr darstellbar (deckt sich
  mit der harten Verletzung `return`).

`meltemiSafeUntilDay` fasst zusammen, bis zu welchem Tag die Route meltemi-fest ist.
Die Prüfung läuft bei jeder Forecast-Aktualisierung neu — das IST die tägliche
Neubeurteilung. Der PoR (FR19) bleibt unverändert die konservative Kennzahl dazu.

## 5. Parameter (AD-8: Config, nicht Code)

- `stageHoursBandMinH` = 5, `stageHoursBandMaxH` = 7 (Optimierungsband; die
  FR16-Sicherheitsbudgets bleiben unberührt).
- `harbourDaysTargetMax` = 2 (Zielband zusammen mit `harbourDays` = 1;
  `harbourDaysMax` = 5 bleibt die Notgrenze).

## 6. Nicht geändert

FR16-Schwellen und Eskalationsleiter (upwind/pickup nie relaxierbar), PoR-Rechnung,
Persistenz-Annahme, Pins/Check-in (AD-12), Ein-Etappen-Vorgabe als Standard.
