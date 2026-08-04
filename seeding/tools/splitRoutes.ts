/**
 * One-off migration: routes.json -> legs.json + variants.json (AD-4).
 *
 * Legs become first-class and deduplicated; variants reference them by id
 * instead of copying them (the old shape stored the same leg up to four times,
 * so a waypoint correction had to be made in four places or silently drifted).
 *
 * Runs as a script so the transfer is VERIFIABLE rather than hand-typed: it
 * asserts that every leg keeps its distance, waypoints and warnings, and it
 * reports which legs are dropped because no surviving variant references them.
 *
 *   node --experimental-strip-types seeding/tools/splitRoutes.ts
 */

import { readFileSync, writeFileSync } from 'node:fs';

/** PRD 2026-08-02: the Saronic Gulf is not an option — the route goes out. */
const DROP_ROUTES = new Set(['saronische-alternative']);

interface RawLeg {
  id: string;
  [k: string]: unknown;
}
interface RawRoute {
  id: string;
  name: string;
  description?: string;
  escalationRank: number;
  isReturnChain?: boolean;
  color?: string;
  legs: RawLeg[];
}

const src = JSON.parse(readFileSync('seeding/data/routes.json', 'utf8')) as {
  approved: boolean;
  sourceNote: string;
  routes: RawRoute[];
};

const keptRoutes = src.routes.filter((r) => !DROP_ROUTES.has(r.id));

// Deduplicate legs, and verify that repeated occurrences are actually IDENTICAL.
// A silent divergence between two copies is exactly what this migration ends;
// if one exists, it must be resolved by hand rather than by picking a winner.
const legs = new Map<string, RawLeg>();
const conflicts: string[] = [];
for (const route of keptRoutes) {
  for (const leg of route.legs) {
    const prev = legs.get(leg.id);
    if (!prev) {
      legs.set(leg.id, leg);
      continue;
    }
    if (JSON.stringify(prev) !== JSON.stringify(leg)) {
      conflicts.push(`${leg.id} (in ${route.id})`);
    }
  }
}
if (conflicts.length > 0) {
  console.error('ABBRUCH — Legs mit abweichenden Kopien:', conflicts.join(', '));
  process.exit(1);
}

const variants = keptRoutes.map((r) => ({
  id: r.id,
  name: r.name,
  ...(r.description ? { description: r.description } : {}),
  escalationRank: r.escalationRank,
  isReturnChain: r.isReturnChain ?? false,
  ...(r.color ? { color: r.color } : {}),
  legIds: r.legs.map((l) => l.id),
}));

const droppedLegs = new Set<string>();
for (const route of src.routes) {
  if (!DROP_ROUTES.has(route.id)) continue;
  for (const leg of route.legs) {
    if (!legs.has(leg.id)) droppedLegs.add(leg.id);
  }
}

const sortedLegs = [...legs.values()].sort((a, b) => a.id.localeCompare(b.id));

writeFileSync(
  'seeding/data/legs.json',
  JSON.stringify(
    {
      approved: src.approved,
      sourceNote: src.sourceNote,
      legs: sortedLegs,
    },
    null,
    2,
  ) + '\n',
);
writeFileSync(
  'seeding/data/variants.json',
  JSON.stringify(
    {
      approved: src.approved,
      sourceNote:
        src.sourceNote +
        ' | Varianten referenzieren Leg-IDs (AD-4); saronische-alternative ersatzlos gestrichen (PRD 2026-08-02).',
      variants,
    },
    null,
    2,
  ) + '\n',
);

// --- Verification: nothing may be lost -------------------------------------
const before = new Map<string, RawLeg>();
for (const r of keptRoutes) for (const l of r.legs) before.set(l.id, l);
let ok = true;
for (const [id, leg] of before) {
  const after = legs.get(id);
  if (!after || JSON.stringify(after) !== JSON.stringify(leg)) {
    console.error(`VERLUST bei ${id}`);
    ok = false;
  }
}
const occurrences = keptRoutes.reduce((s, r) => s + r.legs.length, 0);
console.log(
  `legs.json: ${sortedLegs.length} Legs (aus ${occurrences} Vorkommen) · ` +
    `${sortedLegs.filter((l) => (l.waypoints as unknown[])?.length > 0).length} mit Wegpunkten`,
);
console.log(`variants.json: ${variants.length} Varianten`);
console.log(
  `BREAKING — entfernte Legs (nur von gestrichenen Routen referenziert): ${
    droppedLegs.size > 0 ? [...droppedLegs].join(', ') : '(keine)'
  }`,
);
console.log(ok ? 'Verlustfrei verifiziert.' : 'FEHLER: Verlust festgestellt.');
process.exit(ok ? 0 : 1);
