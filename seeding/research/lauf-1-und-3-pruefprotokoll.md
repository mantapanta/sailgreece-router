# Lauf 1 (Saronisch/Argolis) und Lauf 3 (Ostkykladen) — Prüfprotokoll

Quelle: Gemini Deep Research, Läufe 1 und 3, geliefert am 2026-08-03.
Eingepflegt am 2026-08-03. Alle Staging-Dateien stehen weiterhin auf
`approved: false`. Das Protokoll zu Lauf 2 liegt in
[`lauf-2-pruefprotokoll.md`](lauf-2-pruefprotokoll.md).

## Stand der Bibliothek

| | vorher | nach Lauf 2 | nach Lauf 1 | nach Lauf 3 |
|---|---|---|---|---|
| Inseln/Regionen | 12 | 22 | 32 | 42 |
| Plätze | 19 | 38 | 68 | 97 |
| mit Liegeplatzdaten | 0 | 31 | 64 | 96 |
| mit Fährdaten | 0 | 16 | 29 | 42 |

Neu in Lauf 1: attika, spetses, dokos, angistri, salamina, methana, epidavros,
korfos, ermioni, porto-heli. Ergänzt: aegina, poros, hydra, athen.
Neu in Lauf 3: mykonos, tinos, andros, iraklia, schinoussa, koufonisia, keros,
donousa, anafi, thirasia. Ergänzt: naxos, amorgos, santorin.

## Qualitätsvergleich der drei Läufe

| | Lauf 2 (West) | Lauf 1 (Saronisch) | Lauf 3 (Ost) |
|---|---|---|---|
| Distanzen | 8/17 überhöht, 3 unmöglich | 3 überhöht, 4 unmöglich | **keine geliefert** (wie gefordert) |
| Koordinaten vs. Bestand | 4 Punkte um bis 1,6 sm verschoben | max. 0,09 sm | **exakt übernommen** |
| IDs | `merikhas` statt `merichas` | `attika-alimos` doppelt | **alle korrekt** |
| Sektor-Selbstwidersprüche | 3 | 0 | 4 |
| Seitenzahlen | durchgehend, Muster verdächtig | durchgehend, Muster verdächtig | **meist weggelassen** |
| Fähr-Regel „täglich" | ignoriert (Sikinos true) | teils ignoriert (Sikinos true) | **befolgt** |

Die nach Lauf 2 in den Prompt eingearbeiteten Regeln haben in Lauf 3 fast
vollständig gegriffen. Der einzige verbleibende systematische Fehler sind die
Schutzsektoren.

## Lauf 1 — Distanzen: nachgerechnet, nicht übernommen

Großkreisdistanz aus den Koordinaten des Berichts als untere Schranke; Skript:
[`checkdist-lauf1.py`](checkdist-lauf1.py).

| von | nach | Bericht sm | Luftlinie sm | Faktor | Befund |
|---|---|---|---|---|---|
| athen-alimos | aegina-stadt | 16.5 | 16.3 | 1.01 | plausibel |
| athen-alimos | poros-stadt | 28.5 | 27.3 | 1.04 | plausibel |
| athen-alimos | attika-sounion | 23.5 | 21.8 | 1.08 | plausibel |
| athen-alimos | attika-lavrion | 31.0 | 20.6 | 1.50 | stark überhöht |
| athen-alimos | kea-vourkari | 38.0 | 33.0 | 1.15 | plausibel |
| athen-alimos | kythnos-merichas | 46.0 | 45.4 | 1.01 | plausibel |
| aegina-stadt | poros-stadt | 17.0 | 14.9 | 1.14 | plausibel |
| aegina-stadt | epidavros-palaia | 14.0 | 14.3 | 0.98 | **unmöglich** |
| aegina-stadt | methana-hafen | 8.5 | 10.2 | 0.83 | **unmöglich** |
| poros-stadt | hydra-hafen | 12.5 | 8.9 | 1.40 | verdächtig hoch |
| poros-stadt | kythnos-merichas | 35.0 | 45.4 | 0.77 | **unmöglich** |
| hydra-hafen | ermioni-nord | 11.5 | 10.5 | 1.09 | plausibel |
| hydra-hafen | spetses-baltiza | 16.0 | 15.3 | 1.04 | plausibel |
| spetses-baltiza | porto-heli-hafen | 9.0 | 3.9 | 2.32 | stark überhöht |
| epidavros-palaia | korfos-hafen | 10.5 | 7.7 | 1.36 | verdächtig hoch |
| kea-vourkari | kythnos-merichas | 20.0 | 17.0 | 1.18 | plausibel, aber Lauf 2 sagte 24.5 |
| kythnos-merichas | serifos-livadi | 24.0 | 15.8 | 1.52 | stark überhöht, Lauf 2 sagte 27.2 |
| serifos-livadi | sifnos-kamares | 12.5 | 11.4 | 1.09 | plausibel, Lauf 2 sagte 13.4 |
| sifnos-kamares | paros-parikia | 31.0 | 24.2 | 1.28 | verdächtig hoch |
| paros-parikia | naxos-stadt | 11.0 | 10.7 | 1.03 | plausibel, Lauf 2 sagte 11.2 |
| athen-alimos | salamina-palichori | 11.0 | 10.1 | 1.09 | plausibel |
| athen-alimos | angistri-skala | 19.5 | 20.2 | 0.97 | **unmöglich** |

Entscheidend ist nicht nur die Zahl der Fehler, sondern dass **drei Strecken, die
beide Läufe gemeldet haben, unterschiedliche Werte tragen** (kea→kythnos 20,0 vs.
24,5; kythnos→serifos 24,0 vs. 27,2; serifos→sifnos 12,5 vs. 13,4). Die Distanzen
sind geschätzt, nicht gemessen, und gehen aus keinem der Läufe in `routes.json`
ein.

Ein Wegpunkt aus Lauf 1 ist zusätzlich auffällig: `37.750 N / 23.900 E` für
athen-alimos → attika-sounion liegt auf oder dicht hinter der attischen Küste.
Vor einer Übernahme gegen die Karte prüfen.

## Lauf 3 — Deliverable C

Enthält wie gefordert **keine Distanzen**, nur Wegpunkte und Gefahrenstellen. Die
Gefahrenstellen sind übernahmefähig, sobald die zugehörigen Etappen existieren:
Riff Fleves, Untiefe Agios Dimitrios vor Kythnos-Nord, Portes-Riff westlich
Parikia, Untiefen und bis 2 kn Strömung im Paros-Naxos-Kanal, Flachwasser der
Delos-Passage, Kap Sideros zwischen Tinos und Mykonos, Kap Steno vor Andros-Süd,
Sandbank Vlychada.

## Düsenzonen aus Lauf 1 und 3

Beide Läufe bestätigen die Zonen aus Lauf 2 und ergänzen vier neue. Kandidaten für
`leg.windWarnings`, Verstärkungswerte ungeprüft:

| Zone | Lage | betroffene Etappen | Verstärkung | Richtung |
|---|---|---|---|---|
| Tselevinia / Kap Skyllaio | 37.42–37.46 N / 23.50–23.56 E | poros ↔ hydra | +6…+10 kn | NE |
| Methana-Kap / Ägina-Enge | 37.58–37.65 N / 23.35–23.45 E | aegina ↔ methana | +5…+8 kn Fallwind | NNE |
| Kap Sideros (Tinos–Mykonos) | 37.48–37.52 N / 25.20–25.30 E | mykonos ↔ tinos | +10 kn, Böen bis 40 kn | N |
| Santorin-Caldera-Düse | 36.38–36.46 N / 25.35–25.42 E | amorgos ↔ santorin | +10…+15 kn Fallböen | NNE–NE |

Die Zonen Kea-Kanal, Kap Sounion, Kafireas, Paros–Naxos, Paros–Antiparos,
Tinos–Mykonos und Sifnos-Kanal werden von mehreren Läufen unabhängig genannt —
bei ihnen weichen nur die Verstärkungswerte ab (z. B. Kea-Kanal +8…+12 kn in
Lauf 2, +5…+10 kn in Lauf 1). Der jeweils höhere Wert ist der konservative.

## Einpflege-Entscheidungen

### Lauf 1

1. **`attika-alimos` verworfen.** Der Bericht lieferte Marina Alimos als neuen
   Platz auf einer neuen Insel `attika`. Der Platz existiert als `athen-alimos`
   und wird von `routes.json` sowie `config.json` (`baseIslandId`, `basePlaceId`)
   referenziert. Die Liegeplatzdaten wurden auf `athen-alimos` übertragen.
2. **Zea, Sounion und Lavrion auf eine neue Insel `attika`** statt auf `athen`.
   Grund: Der Solver bildet Etappen zwischen Inseln; lägen sie auf `athen`, wären
   sie von der Basis aus nie als Tagesziel erreichbar.
3. **Sektoren als Schnittmenge** bei Ägina-Stadt (350–220), Poros-Stadt
   (Rundumschutz, Windgrenze 35 statt 38) und Hydra-Hafen (60–310).
4. **Dokos-Skintos von 38 auf 35 kn gekappt** — höchster Einzelwert aller drei
   Läufe, und die gelieferte Buchtkoordinate liegt praktisch auf dem
   Inselmittelpunkt, was auf eine grob gesetzte Position hindeutet.
5. **Crowd-Quellen-Regel eingeführt:** Plätze, deren einzige Quelle CruisersWiki,
   Navily oder ein Blog ist, erhalten höchstens `confidence: "mittel"`. Betrifft
   in Lauf 1: aegina-marathonas, poros-neorio, hydra-molos, spetses-dapia,
   ermioni-kapari, porto-heli-ververonda, angistri-alonia, salamina (beide).

### Lauf 3

6. **Vier Sektor-Selbstwidersprüche gekappt**, alle nach demselben Muster: der
   Sektor lässt Nord offen, während Beschreibung und Schwellnotiz derselben
   Quelle Meltemi-Schutz behaupten. Vermutlich hat die Recherche Schutz- und
   Öffnungsrichtung verwechselt.

   | Platz | Sektor | maxKn Quelle → eingetragen | Widerspruch |
   |---|---|---|---|
   | iraklia-alimia | 60–310 | 35 → **15** | „Südwestbucht, exzellenter Meltemi-Schutz", Sektor lässt N offen |
   | keros-konakia | 60–320 | 35 → **15** | „Westbucht, Schutz gegen Nordschwell", Sektor lässt N offen |
   | tinos-kolimvithra | 240–110 | 25 → **12** | „Nordküstenbucht, offen nach NE, bei Meltemi schwerer Seegang", Sektor behauptet Nordschutz |
   | koufonisia-pori | 120–30 | 30 → **18** | Sektor nach NE offen, Schwellnotiz nennt „ruhiges Wasser bei Meltemi" |

   **Das ist die wichtigste Restarbeit.** Wenn sich bei Alimia und Konakia der
   beschriebene Meltemi-Schutz bestätigt, sind das zwei wertvolle Ausweichplätze
   in den Kleinen Kykladen, und die Sektoren gehören auf etwa 300–200 korrigiert.
   Bis dahin sind sie planerisch praktisch ausgeschlossen — die sichere Seite.
7. **Katapola unabhängig bestätigt.** Lauf 3 leitet für Amorgos-Katapola exakt
   denselben Sektor (320–240) und dieselbe Windgrenze (35 kn) her wie das
   Brief-Addendum. Das ist die stärkste Sektor-Bestätigung aus allen drei Läufen.
8. **Vlychada-Tiefenwarnung verschärft.** Lauf 3 nennt eine durch Versandung auf
   **1,5–2,2 m** reduzierte Zufahrtsrinne bei 2,0 m Tiefgang. Der Bestand sprach
   von „~2,5 m Tiefe". `depthAtBerthM.min` steht jetzt auf 1,5. Santorin bleibt
   damit nur mit telefonisch bestätigter Rinnentiefe eine Option — die Quelle
   empfiehlt Rückfrage maximal 24 h vor Ansteuerung.
9. **Zitationsartefakte entfernt.** Die Mykonos-Einträge enthielten
   `[cite: 6]`-Marker im Freitext.
10. **Sektor-Notation korrigiert.** Lauf 1 lieferte Gradzahlen mit führenden
    Nullen (`030`), was ungültiges JSON ist. Amorgos-Aegiali kam als `0–260`,
    was im Schema nicht von einem Vollkreis unterscheidbar wäre — eingetragen als
    `1–260`, die Abweichung von einem Grad ist ohne Bedeutung.
    Amorgos-Kalotaritissa kam als `90–0` und steht jetzt als `90–360`.

## Schema-Erweiterungen

`src/domain/schema/berthing.ts` wurde für Lauf 1 zweimal erweitert: das
Haltegrund-Enum um `schlamm-fels`, `schlamm-sand` und `schlamm-seegras`, und
`wasteDisposal` nimmt jetzt auch eine Ortsangabe als Freitext („Behälter am Kai")
statt nur ja/nein — Lauf 1 lieferte durchgehend Text, Lauf 2 und 3 Booleans.

## Größenlimits und Tiefen, die dieses Schiff ausschließen oder gefährden

Bei 12–15 m Länge und 2,0 m Tiefgang sind laut den Recherchen ausgeschlossen oder
grenzwertig:

| Platz | maxLoaM | Tiefe min | Bemerkung |
|---|---|---|---|
| santorin-vlychada | 16 | **1,5** | Zufahrtsrinne versandet, Grundberührungsrisiko |
| naxos-moutsouna | 14 | 2,0 | zusätzlich bei Meltemi auflandig |
| sikinos-alopronia | 14 | 2,0 | Fels/Kies, schlechter Halt |
| angistri-skala | 14 | 1,8 | Kaitiefe unter Tiefgang |
| aegina-perdika | 15 | 1,8 | Kaitiefe unter Tiefgang |
| antiparos-town | 15 | 1,8 | Fahrrinne kritisch |
| naxos-kalandos | 15 | 2,0 | sonst guter Meltemi-Platz |
| spetses-dapia | 15 | 3,0 | Anlegen für Yachten meist verboten |
| milos-pollonia | 15 | 2,0 | bei Meltemi Legerwall |
| methana-vathy | 16 | 2,0 | sonst gutes Meltemi-Versteck |
| paros-piso-livadi | 16 | 2,0 | |
| tinos-panormos | 16 | 2,0 | sonst guter Rückweg-Hafen |
| iraklia-agios-georgios | 16 | 2,2 | |
| anafi-agios-nikolaos | 16 | 2,0 | |
| thirasia-riva | 16 | 2,0 | Pierzustand ungeklärt |

`maxLoaM` und `depthAtBerthM.min` liegen als Zahlen im Schema, damit der Solver
sie als hartes Ausschlusskriterium prüfen kann — **er tut es noch nicht.** Das ist
die zweitwichtigste offene Arbeit nach den vier gekappten Sektoren.

## Plätze, die vor der Freigabe zur Löschung anstehen

- **spetses-dapia** — Anlegen für Yachten laut Quelle tagsüber meist verboten,
  Platz für 5 Boote, Haltegrund schlecht. Als Nachtziel unbrauchbar.
- **sikinos-alopronia** — 14 m Limit, 2,0 m Zufahrt, Felsgrund, nicht
  meltemi-sicher.
- **santorin-amoudi**, **thirasia-kormoranos** — nur Bojen, deren Verfügbarkeit
  und Haltekraft ungeklärt ist. Ohne bestätigte Boje kein planbarer Nachtplatz.
