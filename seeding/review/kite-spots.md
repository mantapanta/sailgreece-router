# Review: Kite-Spots

Status: **NICHT freigegeben** (`approved: false`)

Quelle der Datei: Kite-Spots Kykladen + attische Küste (2026-08-06, Skipper-Wunsch 'Anzeige von Kite-Spots'). HERKUNFT UND IHRE GRENZE: die Spots stammen aus dem Törnkonzept des Skippers (Rhenia/Blue Lagoon, Pounda-Kanal, Despotiko-Lagune, Mikri Vigla, Kato Koufonisi, Polyaigos) und aus allgemein bekanntem Kite-Revierwissen der Kykladen (Ftelia, Kalafatis, Chrissi Akti/Golden Beach, Santa Maria, Kolymbithra, Anavyssos). Sie sind NICHT quellenbelegt kuratiert wie die Liegeplätze: keine Windstatistik, kein Revierführer, keine Ortsbegehung. Koordinaten sind aus der Lage der Bucht abgeleitet und auf ~0,5 sm genau; die Windsektoren geben die bekannte Arbeitsrichtung des Spots, nicht eine gemessene Verteilung. Behördliche Auflagen (Kite-Verbote an Badestränden, Naturschutz um Despotiko/Delos/Polyaigos, Sperrzonen der Hafenbehörde) sind NICHT recherchiert und können vor Ort anders sein. Deshalb steht die Datei auf approved: false, jeder Eintrag trägt confidence 'mittel' oder 'niedrig', und die Anzeige sagt das ungefragt dazu. Der Bezugsplatz (refPlaceId) ist kuratiert, nicht gerechnet — bei Mikri Vigla wäre der geometrisch nächste Liegeplatz Piso Livadi auf PAROS, jenseits des Kanals. Nichts hiervon bewertet etwas: weder Ampel noch Solver lesen ein Feld (src/domain/schema/kite.ts).

> Kite-Spots bewerten NICHTS: keine Ampel, kein Solver, kein Budget liest ein Feld. Sektorsemantik wie beim Liegeplatz, aber umgekehrt gemeint — „der Spot funktioniert mit Wind KOMMEND AUS fromDeg° im Uhrzeigersinn bis toDeg°". Zu prüfen sind vor allem: Windrichtung, `refPlaceId` (Forecast-Bezug UND Anzeigeort) und die Gefahren-Liste.

## Spots (14)

| Spot | Insel | Wind aus | Wasser | Start | Level | Bezugsplatz | Konfidenz |
|---|---|---|---|---|---|---|---|
| Anavyssos (Attische Küste) (`kite-attika-anavyssos`) | attika | 180°–260° | flachwasser | strand, dinghy | einsteiger | `attika-lavrion` | niedrig |
| Despotiko-Lagune (`kite-despotiko-lagune`) | despotiko | 330°–60° (Wrap über Nord) | flachwasser | dinghy, boot | fortgeschritten | `despotiko-ormos` | niedrig |
| Kato Koufonisi (Flachbuchten) (`kite-koufonisia-kato`) | koufonisia | 330°–60° (Wrap über Nord) | flachwasser | boot, dinghy | fortgeschritten | `koufonisia-chora` | niedrig |
| Kolona-Sandbank (Kythnos) (`kite-kythnos-kolona`) | kythnos | 340°–60° (Wrap über Nord) | flachwasser | strand, dinghy | fortgeschritten | `kythnos-kolona` | niedrig |
| Ftelia (Mykonos) (`kite-mykonos-ftelia`) | mykonos | 340°–60° (Wrap über Nord) | choppy | strand, dinghy | fortgeschritten | `mykonos-tourlos` | mittel |
| Kalafatis (Mykonos) (`kite-mykonos-kalafatis`) | mykonos | 350°–90° (Wrap über Nord) | choppy | strand, dinghy | fortgeschritten | `mykonos-kalafatis` | mittel |
| Agios Georgios (Naxos-Stadt) (`kite-naxos-agios-georgios`) | naxos | 280°–20° (Wrap über Nord) | flachwasser | strand | einsteiger | `naxos-stadt` | niedrig |
| Mikri Vigla (Laguna / Parthena) (`kite-naxos-mikri-vigla`) | naxos | 320°–70° (Wrap über Nord) | flachwasser | strand, dinghy | einsteiger | `naxos-stadt` | mittel |
| Chrissi Akti / Golden Beach (Paros) (`kite-paros-chrissi-akti`) | paros | 340°–70° (Wrap über Nord) | choppy | strand, dinghy | fortgeschritten | `paros-piso-livadi` | mittel |
| Pounda (Kanal Paros–Antiparos) (`kite-paros-pounda-kanal`) | paros | 340°–60° (Wrap über Nord) | flachwasser | strand, dinghy | fortgeschritten | `antiparos-town` | mittel |
| Santa Maria (Paros) (`kite-paros-santa-maria`) | paros | 330°–60° (Wrap über Nord) | choppy | strand, dinghy | fortgeschritten | `paros-naoussa` | niedrig |
| Polyaigos Süd-/Ostküste (`kite-polyaigos-sued`) | polyaigos | 340°–70° (Wrap über Nord) | tiefwasser | boot | experte | `polyaigos-mersini` | niedrig |
| Blue Lagoon (Rinia) (`kite-rinia-blue-lagoon`) | delos-rinia | 330°–60° (Wrap über Nord) | flachwasser | boot, dinghy | fortgeschritten | `delos-rinia-miskanti` | niedrig |
| Kolymbithra (Tinos) (`kite-tinos-kolymbithra`) | tinos | 340°–60° (Wrap über Nord) | welle | strand, dinghy | experte | `tinos-kolimvithra` | mittel |

### Anavyssos (Attische Küste) (`kite-attika-anavyssos`)

Koordinaten: 37.7270, 23.9330

Weg vom Bezugsplatz: Flache Sandbucht an der Westseite der Halbinsel, 6 sm von Lavrion — als Zwischenstopp am ersten oder letzten Törntag, nicht als Beiboot-Ausflug.

Gefahren: ⚠ Arbeitet mit dem SÜDwestlichen Seewind, nicht mit dem Meltemi — bei Nordlage ablandig und damit gefährlich · ⚠ Offene Bucht ohne Nachtschutz · ⚠ Badebetrieb und Strandbars im August

Vor Ort: Kite-Schulen an der Küste Anavyssos/Punta Zeza.

Quellen: Allgemeines Kite-Revierwissen attische Küste — nicht quellenbelegt, vor Ort prüfen

### Despotiko-Lagune (`kite-despotiko-lagune`)

Koordinaten: 36.9600, 25.0300

Weg vom Bezugsplatz: Flachwasser über den Sandbänken zwischen Despotiko und Antiparos — Start direkt vom Ankerplatz per Beiboot oder von der Badeplattform.

Gefahren: ⚠ Unbewohnt: keine Hilfe an Land, kein Verleih, kein Ersatzmaterial · ⚠ Wandernde Sandbänke und Untiefen — Tiefen wechseln mit dem Jahr · ⚠ Archäologische Zone / Naturschutz auf Despotiko: Auflagen nicht recherchiert

Quellen: Törnkonzept Kitesurfer 2026-08-06 (Skipper): 'Ankerstopp in der Lagune von Despotiko. Flachwasser-Sessions an unbewohnten Sandbänken'

### Kato Koufonisi (Flachbuchten) (`kite-koufonisia-kato`)

Koordinaten: 36.9236, 25.5875

Weg vom Bezugsplatz: 0,8 sm südlich von Chora über den Kanal — Start vom Boot oder per Beiboot an den flachen Sandbuchten der unbewohnten Insel.

Gefahren: ⚠ Unbewohnt, keine Instandhaltung an Land — vollständige Eigenversorgung · ⚠ Strömung im Kanal zwischen Ano und Kato Koufonisi · ⚠ Untiefen und Felsköpfe in den Buchten

Quellen: Törnkonzept Kitesurfer 2026-08-06 (Skipper): 'Unbewohnte Insel mit flachen Buchten. Keine Instandhaltung an Land'

### Kolona-Sandbank (Kythnos) (`kite-kythnos-kolona`)

Koordinaten: 37.4117, 24.3833

Weg vom Bezugsplatz: Die Sandzunge der Doppelbucht selbst: Start vom Strand der Leeseite, gefahren wird über der flachen Bank.

Gefahren: ⚠ KEIN etablierter Kite-Spot, sondern die beliebteste Ankerbucht der Insel — im August dicht belegt, Leinen und Ankerlieger im Fahrbereich · ⚠ Enge Zunge: Leinen können auf die Windward-Seite treiben · ⚠ Nur bei leerer Bucht und mit Rücksicht auf die Nachbarn

Quellen: Eigene Einschätzung aus der Bucht-Geometrie (Sandzunge, Flachwasser beidseitig) — kein Spot-Beleg, vor Ort entscheiden

### Ftelia (Mykonos) (`kite-mykonos-ftelia`)

Koordinaten: 37.4711, 25.3517

Weg vom Bezugsplatz: Nordbucht von Mykonos, 1,3 sm von Tourlos über Land oder mit dem Beiboot um die Nordspitze — bei Meltemi ist der Landweg der ruhigere.

Gefahren: ⚠ Die Bucht liegt voll im Meltemi: onshore, ablandige Bergung nicht möglich · ⚠ Kein geschützter Ankerplatz vor dem Strand

Vor Ort: Etablierte Kite-Station in der Bucht.

Quellen: Allgemeines Kite-Revierwissen Kykladen (Ftelia) — nicht quellenbelegt, vor Ort prüfen

### Kalafatis (Mykonos) (`kite-mykonos-kalafatis`)

Koordinaten: 37.4330, 25.4290

Weg vom Bezugsplatz: Direkt am Ankerplatz Kalafatis — Beiboot an den Strand, Startbereich am Ostende der Bucht.

Gefahren: ⚠ Ostküste: bei kräftigem Meltemi Welle bis in die Bucht · ⚠ Wassersportbetrieb (Boote, Bojen) im Startbereich

Vor Ort: Wassersportzentrum am Strand.

Quellen: Allgemeines Kite-Revierwissen Kykladen (Kalafatis) — nicht quellenbelegt, vor Ort prüfen

### Agios Georgios (Naxos-Stadt) (`kite-naxos-agios-georgios`)

Koordinaten: 37.0975, 25.3720

Weg vom Bezugsplatz: Die lange Strandbucht direkt südlich der Marina — 10 Minuten zu Fuss vom Liegeplatz, kein Beiboot nötig.

Gefahren: ⚠ Stadtstrand: dichter Badebetrieb, Kiten oft nur ausserhalb der Badezone erlaubt · ⚠ Auflagen der Hafenbehörde nicht recherchiert

Vor Ort: Windsurf- und Kite-Stationen am Strand; enger Startbereich.

Quellen: Allgemeines Kite-Revierwissen Kykladen — nicht quellenbelegt, vor Ort prüfen

### Mikri Vigla (Laguna / Parthena) (`kite-naxos-mikri-vigla`)

Koordinaten: 37.0186, 25.3617

Weg vom Bezugsplatz: Der Spot liegt an der SW-Küste, 5 sm südlich von Naxos-Stadt — als Tagesziel planen, nicht als Beiboot-Fahrt. Vor Anker geht es davor bei Kastraki/Glyfada (nicht in der Liegeplatz-Bibliothek, kein Nachtplatz bei Meltemi), Anlandung mit dem Beiboot am Sandstrand.

Gefahren: ⚠ Felsnase zwischen Laguna und Parthena — die nördliche Bucht ist der Flachwasserteil, die südliche steht in der Welle · ⚠ Ankern vor offener Küste: bei Meltemi Schwell, nachts nicht liegen bleiben · ⚠ Badebetrieb an der Lagune im August

Vor Ort: Kite-Schulen und Verleih am Strand (Saison Juni–September).

Quellen: Törnkonzept Kitesurfer 2026-08-06 (Skipper): 'Mikri Vigla bietet konstantesten Meltemi'; Allgemeines Kite-Revierwissen Kykladen — nicht quellenbelegt, vor Ort prüfen

### Chrissi Akti / Golden Beach (Paros) (`kite-paros-chrissi-akti`)

Koordinaten: 37.0286, 25.2411

Weg vom Bezugsplatz: 1,5 sm nördlich von Piso Livadi an der Ostküste — mit dem Beiboot erreichbar, Anlandung am Sandstrand.

Gefahren: ⚠ Ostküste offen gegen Meltemi-Welle — Beiboot nie unbeaufsichtigt am Strand lassen · ⚠ Wettkampf- und Schulbetrieb kann Startbereiche sperren

Vor Ort: Etablierte Windsurf-/Kite-Strände (Golden Beach, New Golden Beach) mit Stationen.

Quellen: Allgemeines Kite-Revierwissen Kykladen (Golden Beach, PWA-Revier) — nicht quellenbelegt, vor Ort prüfen

### Pounda (Kanal Paros–Antiparos) (`kite-paros-pounda-kanal`)

Koordinaten: 37.0175, 25.1050

Weg vom Bezugsplatz: Windverwöhnter Kanal zwischen Paros und Antiparos; vor Anker im Luv von Antiparos, 1,8 sm mit dem Beiboot zum Startbereich an der Paros-Seite.

Gefahren: ⚠ Düseneffekt im Kanal — hier steht regelmässig deutlich mehr Wind als der Forecast am Hafen zeigt (FR10-Zone paros--antiparos) · ⚠ Fähr- und Autofähren-Verkehr quer durch den Kanal, dichte Frequenz · ⚠ Strömung im engen Teil des Kanals

Vor Ort: Kite-Station an der Paros-Seite bei Pounda.

Quellen: Törnkonzept Kitesurfer 2026-08-06 (Skipper): 'Session im windverwöhnten Kanal zwischen Paros und Antiparos'; Allgemeines Kite-Revierwissen Kykladen — nicht quellenbelegt, vor Ort prüfen

### Santa Maria (Paros) (`kite-paros-santa-maria`)

Koordinaten: 37.1394, 25.2461

Weg vom Bezugsplatz: 1 sm östlich von Naoussa; mit dem Beiboot um die Landzunge, Anlandung in der Sandbucht.

Gefahren: ⚠ Riffe und Felsen an den Buchträndern · ⚠ Ankernde Yachten und Badebetrieb in der Bucht

Vor Ort: Kite-/Windsurf-Schule in der Bucht.

Quellen: Allgemeines Kite-Revierwissen Kykladen — nicht quellenbelegt, vor Ort prüfen

### Polyaigos Süd-/Ostküste (`kite-polyaigos-sued`)

Koordinaten: 36.7550, 24.6400

Weg vom Bezugsplatz: Tiefwasser-Launch von der Plattform in Lee der Insel; keine Anlandung, keine Stehtiefe — nur mit Beiboot als Sicherung.

Gefahren: ⚠ Kein Stehbereich und keine Anlandung: ein Materialschaden heisst Bergung durch das Beiboot · ⚠ Unbewohnt, kein Mobilfunk-Verlass, nächste Hilfe auf Kimolos/Milos · ⚠ Naturschutzgebiet (Natura 2000) — Auflagen nicht recherchiert

Quellen: Törnkonzept Kitesurfer 2026-08-06 (Skipper): 'Ideal für Hydrofoil-Kiter und Tiefwasser-Launches'

### Blue Lagoon (Rinia) (`kite-rinia-blue-lagoon`)

Koordinaten: 37.4067, 25.2300

Weg vom Bezugsplatz: Start von der Plattform des Katamarans in der geschützten Bucht; Wasser in Luv der Bucht spiegelglatt.

Gefahren: ⚠ Unbewohnt, keine Infrastruktur — Bergung nur durch das eigene Beiboot · ⚠ Delos/Rinia: Schutzgebiets- und Ankerauflagen nicht recherchiert · ⚠ Ausserhalb der Bucht steht der volle Kanal-Meltemi zwischen Mykonos und Tinos

Quellen: Törnkonzept Kitesurfer 2026-08-06 (Skipper): 'Spiegelglattes Wasser in den geschützten Buchten. Boat-Launches direkt von der Katamaran-Plattform'

### Kolymbithra (Tinos) (`kite-tinos-kolymbithra`)

Koordinaten: 37.6322, 25.1481

Weg vom Bezugsplatz: Direkt am Tagesankerplatz der Nordküste — Beiboot an den Sandstrand der kleinen Bucht.

Gefahren: ⚠ Nordküste voll im Meltemi und im Swell: kein Nachtplatz, bei aufziehendem Wind früh abbrechen · ⚠ Brandung am Strand erschwert Start und Landung · ⚠ Ablandige Bergung nicht möglich

Vor Ort: Surf-/Kite-Betrieb in der Saison.

Quellen: Allgemeines Kite-/Surf-Revierwissen Kykladen (Kolymbithra) — nicht quellenbelegt, vor Ort prüfen

---
Freigabe: in `seeding/data/kitespots.json` das Feld `approved` auf `true` setzen, dann `npm run seed:import`.
