# Review: Etappen- und Variantenbibliothek

Status Etappen: **FREIGEGEBEN** · Varianten: **FREIGEGEBEN**

Quelle: Brief-Addendum 2026-07-30 (Quelle 1: Etappenplan Plan A/B, Rückfallhäfen-Kette, Distanzen; Quelle 2: Düsenzonen). Distanzen ab Basis auf Alimos rebasiert (Quell-Etappenplan war Lavrion-basiert). Vor Freigabe prüfen. | FR9-Rundrouten ergänzt (2026-08-03): neue Etappen-Distanzen aus dem Feldtest-Addendum 2026-08-02 übernommen; bereits importierte Etappen behalten ihre getesteten Werte (Konflikt kythnos--serifos: 17 sm importiert schlägt 31 sm Notiz); milos--polyaigos geometrisch berechnet und als solches markiert. | Kurse landfrei gelegt (2026-08-05, seeding/tools/seaRouteLegs.ts gegen src/domain/data/landmass.ts): 25 Etappen bekamen Umfahrungspunkte, 9 Wegpunkte lagen AUF LAND (u.a. zwei mitten auf Naxos, einer auf Kythnos) und wurden verworfen. distanceNm blieb unverändert — die recherchierten Distanzen sind weiter maßgeblich, die Wegpunkte beschreiben nur den fahrbaren Weg dorthin.

## Etappen (30)

| Etappe | Distanz | Wegpunkte | Warnungen | Rebasing |
|---|---|---|---|---|
| `athen--attika` | 22 sm | 3 | Düse Kea-Kanal (Lavrion–Makronisos): Modellwerte glätten die Beschleunigung | — |
| `athen--kea` | 36 sm | 4 | Düse Kea-Kanal (Lavrion–Makronisos): Modellwerte glätten die Beschleunigung | ursprünglich lavrion-basiert |
| `attika--kea` | 15 sm | 1 | Düse Kea-Kanal (Lavrion–Makronisos): Modellwerte glätten die Beschleunigung | — |
| `folegandros--milos` | 34 sm | 4 | Langer offener Schlag (34 sm), keine Zwischenoption | — |
| `ios--santorin` | 21 sm | 2 | — | — |
| `kea--athen` | 36 sm | 4 | Düse Kea-Kanal (Lavrion–Makronisos): Modellwerte glätten die Beschleunigung | ursprünglich lavrion-basiert |
| `kea--kythnos` | 18 sm | 4 | — | — |
| `kea--syros` | 34 sm | 3 | Kafireas-/Andros-Sektor: Beschleunigung, Modellwerte zu niedrig | — |
| `kythnos--athen` | 48 sm | 4 | Düse Kea-Kanal auf dem letzten Schlag; langer Törn (48 sm) | — |
| `kythnos--kea` | 18 sm | 4 | — | — |
| `kythnos--serifos` | 17 sm | 4 | — | — |
| `milos--polyaigos` | 8.1 sm | 2 | Distanz 8.1 sm GEOMETRISCH aus Koordinaten berechnet (keine Quellenangabe im Addendum) — Luftlinie unterschätzt den Seeweg, vor dem Törn verifizieren | — |
| `milos--sifnos` | 24 sm | 1 | — | — |
| `mykonos--paros` | 20 sm | 0 | Düse Mykonos–Paros: deutlich mehr Wind als der Modellwert | — |
| `naxos--amorgos` | 31 sm | 5 | Nur mit vorgedachtem Fähr-Exit über Naxos (Eskalationsleiter Quelle 1) | — |
| `naxos--paros` | 12 sm | 4 | Düse Paros–Naxos: deutlich mehr Wind als der Modellwert | — |
| `naxos--santorin` | 51 sm | 6 | Langer Schlag, nur bei stabilem Fenster (Quelle 1: 8h30 / 6h50) | — |
| `paros--ios` | 32 sm | 5 | — | — |
| `paros--naxos` | 12 sm | 4 | Düse Paros–Naxos: deutlich mehr Wind als der Modellwert | — |
| `paros--sifnos` | 26 sm | 4 | Insel-Beschleunigungszonen zwischen Sifnos und Paros | — |
| `paros--syros` | 24 sm | 0 | — | — |
| `polyaigos--paros` | 33 sm | 2 | — | — |
| `santorin--folegandros` | 25 sm | 2 | Offener Schlag westwärts, kein Schutz unterwegs | — |
| `serifos--kythnos` | 17 sm | 4 | — | — |
| `serifos--sifnos` | 13 sm | 2 | — | — |
| `sifnos--milos` | 24 sm | 1 | — | — |
| `sifnos--paros` | 26 sm | 4 | Insel-Beschleunigungszonen zwischen Sifnos und Paros | — |
| `sifnos--serifos` | 13 sm | 2 | — | — |
| `syros--kythnos` | 27 sm | 3 | — | — |
| `syros--mykonos` | 21 sm | 1 | Andros/Tinos-Sektor: Düsenwirkung zwischen den Inseln | — |

## Varianten

### Rückfallhäfen-Kette westwärts (`rueckfallkette-west`, Eskalationsstufe 0, Rückfallkette)

6 Etappen, 122 sm gesamt

`naxos--paros` → `paros--sifnos` → `sifnos--serifos` → `serifos--kythnos` → `kythnos--kea` → `kea--athen`

### Gedeckelte Variante bis Paros/Antiparos (`gedeckelt-paros`, Eskalationsstufe 1)

5 Etappen, 110 sm gesamt

`athen--kea` → `kea--kythnos` → `kythnos--serifos` → `serifos--sifnos` → `sifnos--paros`

### Süd-Route bis Naxos (`sued-route-naxos`, Eskalationsstufe 2)

6 Etappen, 122 sm gesamt

`athen--kea` → `kea--kythnos` → `kythnos--serifos` → `serifos--sifnos` → `sifnos--paros` → `paros--naxos`

### Verlängerung Amorgos (`verlaengerung-amorgos`, Eskalationsstufe 3)

7 Etappen, 153 sm gesamt

`athen--kea` → `kea--kythnos` → `kythnos--serifos` → `serifos--sifnos` → `sifnos--paros` → `paros--naxos` → `naxos--amorgos`

### Verlängerung Santorin (`verlaengerung-santorin`, Eskalationsstufe 4)

7 Etappen, 173 sm gesamt

`athen--kea` → `kea--kythnos` → `kythnos--serifos` → `serifos--sifnos` → `sifnos--paros` → `paros--naxos` → `naxos--santorin`

### Westkykladen-Runde (`westkykladen-runde`, Eskalationsstufe 5)

11 Etappen, 249.1 sm gesamt

`athen--attika` → `attika--kea` → `kea--kythnos` → `kythnos--serifos` → `serifos--sifnos` → `sifnos--milos` → `milos--polyaigos` → `polyaigos--paros` → `paros--syros` → `syros--kythnos` → `kythnos--athen`

### Ostkykladen-Runde (Santorin-Schleife) (`ostkykladen-runde`, Eskalationsstufe 6)

12 Etappen, 325 sm gesamt

`athen--kea` → `kea--syros` → `syros--mykonos` → `mykonos--paros` → `paros--ios` → `ios--santorin` → `santorin--folegandros` → `folegandros--milos` → `milos--sifnos` → `sifnos--serifos` → `serifos--kythnos` → `kythnos--athen`
