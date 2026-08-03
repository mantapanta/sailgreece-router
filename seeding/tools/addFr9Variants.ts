/**
 * FR9 — add the two curated round-trip variants from the field-test addendum
 * (Westkykladen-Runde, Ostkykladen-Runde) plus the legs they need.
 *
 * Distance policy (AD-10 / NFR6 — nothing invented):
 *   - Legs that ALREADY exist keep their imported distance. Those values were
 *     tested before the Firestore import, so they win over the addendum note
 *     wherever the two disagree (the notable case: kythnos--serifos 17 sm here
 *     vs. 31 sm in the note, which does not match the real ~17 sm crossing).
 *   - New legs take the addendum's distance verbatim, recorded per leg in
 *     `sourceNote`-style provenance on the file.
 *   - ONE leg has no source at all: milos--polyaigos, the gap the field-test
 *     review flagged (variant 1 ends stage 6 at Milos and starts stage 7 at
 *     Polyaigos). Its distance is computed from the curated coordinates as a
 *     great-circle line and MARKED as such — a straight line underestimates a
 *     sea route, so it needs verification before the trip.
 *
 *   node --experimental-strip-types seeding/tools/addFr9Variants.ts
 */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DATA = 'seeding/data';

interface Coords { lat: number; lon: number }

const places = new Map<string, Coords>();
const islandOfPlace = new Map<string, string>();
for (const f of readdirSync(join(DATA, 'islands'))) {
  const j = JSON.parse(readFileSync(join(DATA, 'islands', f), 'utf8'));
  for (const p of j.places) {
    places.set(p.id, p.coordinates);
    islandOfPlace.set(p.id, j.island.id);
  }
}

/** Great-circle distance in nautical miles. */
function nm(a: Coords, b: Coords): number {
  const R = 3440.065;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** FR10 acceleration zones from the PRD, attached to the legs they apply to. */
const WARNINGS: Record<string, string[]> = {
  'athen--attika': ['Düse Kea-Kanal (Lavrion–Makronisos): Modellwerte glätten die Beschleunigung'],
  'attika--kea': ['Düse Kea-Kanal (Lavrion–Makronisos): Modellwerte glätten die Beschleunigung'],
  'kea--syros': ['Kafireas-/Andros-Sektor: Beschleunigung, Modellwerte zu niedrig'],
  'syros--mykonos': ['Andros/Tinos-Sektor: Düsenwirkung zwischen den Inseln'],
  'mykonos--paros': ['Düse Mykonos–Paros: deutlich mehr Wind als der Modellwert'],
  'kythnos--athen': ['Düse Kea-Kanal auf dem letzten Schlag; langer Törn (48 sm)'],
  'santorin--folegandros': ['Offener Schlag westwärts, kein Schutz unterwegs'],
  'folegandros--milos': ['Langer offener Schlag (34 sm), keine Zwischenoption'],
};

interface NewLeg {
  id: string; fromPlaceId: string; toPlaceId: string; distanceNm: number;
  waypoints?: Coords[]; note?: string;
}

// Distances verbatim from the addendum (field-test PDF 2026-08-02).
const NEW_LEGS: NewLeg[] = [
  { id: 'athen--attika', fromPlaceId: 'athen-alimos', toPlaceId: 'attika-sounion', distanceNm: 22 },
  { id: 'attika--kea', fromPlaceId: 'attika-sounion', toPlaceId: 'kea-vourkari', distanceNm: 15 },
  { id: 'sifnos--milos', fromPlaceId: 'sifnos-kamares', toPlaceId: 'milos-adamas', distanceNm: 24 },
  { id: 'polyaigos--paros', fromPlaceId: 'polyaigos-manolis', toPlaceId: 'paros-parikia', distanceNm: 33 },
  { id: 'paros--syros', fromPlaceId: 'paros-naoussa', toPlaceId: 'syros-ermoupoli', distanceNm: 24 },
  { id: 'syros--kythnos', fromPlaceId: 'syros-ermoupoli', toPlaceId: 'kythnos-loutra', distanceNm: 27 },
  { id: 'kythnos--athen', fromPlaceId: 'kythnos-loutra', toPlaceId: 'athen-alimos', distanceNm: 48 },
  { id: 'kea--syros', fromPlaceId: 'kea-vourkari', toPlaceId: 'syros-ermoupoli', distanceNm: 34 },
  // "Syros – Tinos – Mykonos" is ONE day in the original, with Tinos en route:
  // Tinos therefore becomes a waypoint rather than a separate leg.
  { id: 'syros--mykonos', fromPlaceId: 'syros-ermoupoli', toPlaceId: 'mykonos-ornos', distanceNm: 21,
    waypoints: [places.get('tinos-stadt')!] },
  { id: 'mykonos--paros', fromPlaceId: 'mykonos-ornos', toPlaceId: 'paros-naoussa', distanceNm: 20 },
  { id: 'paros--ios', fromPlaceId: 'paros-naoussa', toPlaceId: 'ios-ormos', distanceNm: 32 },
  { id: 'ios--santorin', fromPlaceId: 'ios-ormos', toPlaceId: 'santorin-vlychada', distanceNm: 21 },
  { id: 'santorin--folegandros', fromPlaceId: 'santorin-vlychada', toPlaceId: 'folegandros-karavostasi', distanceNm: 25 },
  { id: 'folegandros--milos', fromPlaceId: 'folegandros-karavostasi', toPlaceId: 'milos-adamas', distanceNm: 34 },
  { id: 'milos--sifnos', fromPlaceId: 'milos-adamas', toPlaceId: 'sifnos-kamares', distanceNm: 24 },
];

const file = JSON.parse(readFileSync(join(DATA, 'legs.json'), 'utf8'));
const existing = new Map<string, unknown>(file.legs.map((l: { id: string }) => [l.id, l]));

const added: string[] = [];
const kept: string[] = [];
for (const l of NEW_LEGS) {
  if (existing.has(l.id)) { kept.push(l.id); continue; }
  const from = places.get(l.fromPlaceId), to = places.get(l.toPlaceId);
  if (!from || !to) throw new Error(`Platz fehlt für ${l.id}`);
  file.legs.push({
    id: l.id,
    fromIslandId: islandOfPlace.get(l.fromPlaceId), toIslandId: islandOfPlace.get(l.toPlaceId),
    fromPlaceId: l.fromPlaceId, toPlaceId: l.toPlaceId,
    distanceNm: l.distanceNm,
    waypoints: l.waypoints ?? [],
    windWarnings: WARNINGS[l.id] ?? [],
  });
  added.push(l.id);
}

// The one leg without a documented distance — computed, and said so.
if (!existing.has('milos--polyaigos')) {
  const a = places.get('milos-adamas')!, b = places.get('polyaigos-manolis')!;
  const d = Math.round(nm(a, b) * 10) / 10;
  file.legs.push({
    id: 'milos--polyaigos',
    fromIslandId: 'milos', toIslandId: 'polyaigos',
    fromPlaceId: 'milos-adamas', toPlaceId: 'polyaigos-manolis',
    distanceNm: d, waypoints: [],
    windWarnings: [
      `Distanz ${d} sm GEOMETRISCH aus Koordinaten berechnet (keine Quellenangabe im Addendum) — Luftlinie unterschätzt den Seeweg, vor dem Törn verifizieren`,
    ],
  });
  added.push(`milos--polyaigos (berechnet: ${d} sm)`);
}

file.legs.sort((a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id));
file.sourceNote =
  file.sourceNote +
  ' | FR9-Rundrouten ergänzt (2026-08-03): neue Etappen-Distanzen aus dem Feldtest-Addendum 2026-08-02 übernommen; bereits importierte Etappen behalten ihre getesteten Werte (Konflikt kythnos--serifos: 17 sm importiert schlägt 31 sm Notiz); milos--polyaigos geometrisch berechnet und als solches markiert.';
writeFileSync(join(DATA, 'legs.json'), JSON.stringify(file, null, 2) + '\n');

// --- Variants ---------------------------------------------------------------
const vFile = JSON.parse(readFileSync(join(DATA, 'variants.json'), 'utf8'));
const WEST = [
  'athen--attika', 'attika--kea', 'kea--kythnos', 'kythnos--serifos', 'serifos--sifnos',
  'sifnos--milos', 'milos--polyaigos', 'polyaigos--paros', 'paros--syros',
  'syros--kythnos', 'kythnos--athen',
];
const EAST = [
  'athen--kea', 'kea--syros', 'syros--mykonos', 'mykonos--paros', 'paros--ios',
  'ios--santorin', 'santorin--folegandros', 'folegandros--milos', 'milos--sifnos',
  'sifnos--serifos', 'serifos--kythnos', 'kythnos--athen',
];
const NEW_VARIANTS = [
  { id: 'westkykladen-runde', name: 'Westkykladen-Runde',
    description: 'Sounion – Kea – Kythnos – Serifos – Sifnos – Milos/Polyaigos – Paros – Syros – Kythnos – Alimos.',
    escalationRank: 5, isReturnChain: false, color: '#4c8a6b', legIds: WEST },
  { id: 'ostkykladen-runde', name: 'Ostkykladen-Runde (Santorin-Schleife)',
    description: 'Kea – Syros – Tinos/Mykonos – Paros – Ios – Santorin – Folegandros – Milos – Sifnos – Serifos – Kythnos – Alimos.',
    escalationRank: 6, isReturnChain: false, color: '#8a5a83', legIds: EAST },
];
const vIds = new Set(vFile.variants.map((v: { id: string }) => v.id));
const legIds = new Set(file.legs.map((l: { id: string }) => l.id));
for (const v of NEW_VARIANTS) {
  const missing = v.legIds.filter((id) => !legIds.has(id));
  if (missing.length > 0) throw new Error(`${v.id}: fehlende Legs ${missing.join(', ')}`);
  // Chain continuity: each leg must start where the previous one ended.
  const byId = new Map(file.legs.map((l: { id: string }) => [l.id, l]));
  for (let i = 1; i < v.legIds.length; i++) {
    const prev = byId.get(v.legIds[i - 1]!) as { toIslandId: string };
    const cur = byId.get(v.legIds[i]!) as { fromIslandId: string };
    if (prev.toIslandId !== cur.fromIslandId) {
      throw new Error(`${v.id}: Kette bricht bei ${v.legIds[i]} (${prev.toIslandId} -> ${cur.fromIslandId})`);
    }
  }
  if (!vIds.has(v.id)) vFile.variants.push(v);
}
vFile.sourceNote = vFile.sourceNote + ' | FR9-Rundrouten (Westkykladen, Ostkykladen) ergänzt 2026-08-03.';
writeFileSync(join(DATA, 'variants.json'), JSON.stringify(vFile, null, 2) + '\n');

console.log(`Neue Legs (${added.length}): ${added.join(', ')}`);
if (kept.length) console.log(`Behalten (importierte Werte gewinnen): ${kept.join(', ')}`);
console.log(`legs.json: ${file.legs.length} Legs · variants.json: ${vFile.variants.length} Varianten`);
console.log(`Westkykladen: ${WEST.length} Etappen · Ostkykladen: ${EAST.length} Etappen · Ketten geprüft.`);
