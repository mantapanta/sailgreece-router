/**
 * Die EINE Identität einer Alternativ-Route (altRoutes.ts).
 *
 * Der Befund vom Skipper (2026-08-06): dieselbe Route hiess auf der Karte
 * „3. Wendepunkt Amorgos" und im Optionsraum „Verlängerung Amorgos" — und
 * damit war nicht mehr zu sehen, dass die Alternativen die Pläne der Optionen
 * SIND. Diese Tests halten fest, dass beide Ansichten denselben Namen, dieselbe
 * Farbe und eine benannte Herkunft bekommen.
 */

import { describe, expect, it } from 'vitest';
import type {
  Assessment,
  PlanAssessment,
  RouteOptionAssessment,
  StageAssessment,
} from '../../domain/schema/snapshot.ts';
import { altRouteAt, altRouteViews } from '../altRoutes.ts';
import { ALT_ROUTE_COLORS } from '../altRouteColors.ts';

const ISLAND_NAMES: Record<string, string> = {
  amorgos: 'Amorgos',
  santorin: 'Santorin',
  ios: 'Ios',
};
const islandName = (id: string) => ISLAND_NAMES[id] ?? id;

/** Nur die Felder, die die Ableitung liest — der Rest gehört der Domäne. */
function makeAlt(turnIslandId: string, stageDays: number[]): PlanAssessment {
  const stages = stageDays.map(
    (day) => ({ day, kind: 'stage', toIslandId: turnIslandId }) as StageAssessment,
  );
  return {
    turnIslandId,
    turnDay: stageDays[Math.floor(stageDays.length / 2)] ?? null,
    variantId: `variante-${turnIslandId}`,
    stages: [...stages, { day: 99, kind: 'harbour' } as StageAssessment],
  } as PlanAssessment;
}

function makeOption(
  over: Partial<RouteOptionAssessment> & { name: string; previewIndex: number | null },
): RouteOptionAssessment {
  return {
    routeId: over.name,
    konzeptId: 'klassik',
    state: 'offen',
    empfehlung: 'empfohlen',
    abratenGruende: [],
    ...over,
  } as RouteOptionAssessment;
}

function assessmentOf(
  alternatives: PlanAssessment[],
  routeOptions: RouteOptionAssessment[],
): Pick<Assessment, 'alternatives' | 'routeOptions'> {
  return { alternatives, routeOptions };
}

describe('altRouteViews', () => {
  it('nennt eine Alternative nach IHRER Option — derselbe Name wie im Optionsraum', () => {
    const views = altRouteViews(
      assessmentOf(
        [makeAlt('amorgos', [3, 4, 5])],
        [makeOption({ name: 'Verlängerung Amorgos', previewIndex: 0 })],
      ),
      islandName,
    );

    expect(views).toHaveLength(1);
    expect(views[0]!.name).toBe('Verlängerung Amorgos');
    expect(views[0]!.turnName).toBe('Amorgos');
    // Hafentage zählen nicht als Etappen.
    expect(views[0]!.stageCount).toBe(3);
  });

  it('benennt die Herkunft: Optionsraum, Routen-Konzept, Zustand, Empfehlung', () => {
    const views = altRouteViews(
      assessmentOf(
        [makeAlt('santorin', [4, 5])],
        [
          makeOption({
            name: 'Ost-Runde Santorin',
            previewIndex: 0,
            konzeptId: 'ost',
            state: 'schliesst',
            empfehlung: 'abgeraten',
            abratenGruende: ['Route 2 trägt die Lage nicht'],
          }),
        ],
      ),
      islandName,
    );

    expect(views[0]!.herkunft).toBe(
      'Aus dem Optionsraum · Route 2 · Ost · schliesst · abgeraten · wählbar',
    );
    expect(views[0]!.abratenGruende).toEqual(['Route 2 trägt die Lage nicht']);
  });

  it('markiert den FR2-Zeugen als das, was er ist — keine Option des Optionsraums', () => {
    const views = altRouteViews(
      assessmentOf([makeAlt('ios', [2, 3])], []),
      islandName,
    );

    expect(views[0]!.option).toBeNull();
    expect(views[0]!.name).toBe('Tragfähiger Round-Trip über Ios');
    expect(views[0]!.herkunft).toContain('keine Option des Optionsraums');
  });

  it('gibt jeder Alternative die Farbe ihres Listenplatzes — Karte und Tagesansicht zeigen dieselbe', () => {
    const views = altRouteViews(
      assessmentOf(
        [makeAlt('amorgos', [3]), makeAlt('santorin', [4]), makeAlt('ios', [2])],
        [],
      ),
      islandName,
    );

    expect(views.map((v) => v.index)).toEqual([0, 1, 2]);
    expect(views.map((v) => v.color)).toEqual([...ALT_ROUTE_COLORS].slice(0, 3));
  });

  it('teilen sich zwei Optionen einen Plan, gewinnt die erste den Namen — EINE Route, EIN Name', () => {
    const views = altRouteViews(
      assessmentOf(
        [makeAlt('amorgos', [3, 4])],
        [
          makeOption({ name: 'Verlängerung Amorgos', previewIndex: 0 }),
          makeOption({ name: 'Grosse Ostrunde', previewIndex: 0 }),
        ],
      ),
      islandName,
    );

    expect(views).toHaveLength(1);
    expect(views[0]!.name).toBe('Verlängerung Amorgos');
  });

  it('ignoriert Optionen ohne eigenen Plan (previewIndex null = Hauptroute)', () => {
    const views = altRouteViews(
      assessmentOf(
        [makeAlt('ios', [2])],
        [makeOption({ name: 'Klassik-Runde', previewIndex: null })],
      ),
      islandName,
    );

    expect(views[0]!.option).toBeNull();
  });
});

describe('altRouteAt', () => {
  const views = altRouteViews(
    assessmentOf([makeAlt('ios', [2]), makeAlt('amorgos', [3])], []),
    islandName,
  );

  it('liefert null für die Hauptroute', () => {
    expect(altRouteAt(views, null)).toBeNull();
  });

  it('fällt auf die Hauptroute zurück, wenn die Alternative verschwunden ist', () => {
    // Genau der Fall nach einer Neubewertung mit weniger Alternativen: der
    // gespeicherte Index zeigt ins Leere und darf keine leere Ansicht ergeben.
    expect(altRouteAt(views, 7)).toBeNull();
  });

  it('liefert die Alternative an ihrem Listenplatz', () => {
    expect(altRouteAt(views, 1)?.turnName).toBe('Amorgos');
  });
});
