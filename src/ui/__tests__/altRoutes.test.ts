/**
 * Die EINE Identität einer Alternativ-Route (altRoutes.ts).
 *
 * Der Befund vom Skipper (2026-08-06): dieselbe Route hiess auf der Karte
 * „3. Wendepunkt Amorgos" und im Optionsraum „Verlängerung Amorgos" — und
 * damit war nicht mehr zu sehen, dass die Alternativen die Pläne der Optionen
 * SIND. Diese Tests halten fest, dass beide Ansichten denselben Namen, dieselbe
 * Farbe und eine benannte Herkunft bekommen.
 *
 * ZIELMODELL V3 (2026-08-07): der Name kommt nicht mehr aus der Option, sondern
 * aus dem PLAN. Der Grund war der nächste Befund desselben Skippers — "die
 * Verlängerung nach Santorin führt überhaupt nicht nach Santorin": ein
 * kuratierter Name war ein Etikett, das an einer beliebigen Kette hängen
 * konnte. Ein abgelesener Name kann das nicht.
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

/**
 * Nur die Felder, die die Ableitung liest — der Rest gehört der Domäne.
 * `ziele` ist die Insel-Folge der Etappentage: der Name wird daraus abgelesen,
 * also muss der Test sie setzen können.
 */
function makeAlt(turnIslandId: string, ziele: string[]): PlanAssessment {
  const stages = ziele.map(
    (id, i) => ({ day: i + 1, kind: 'stage', toIslandId: id }) as StageAssessment,
  );
  return {
    turnIslandId,
    turnDay: Math.ceil(ziele.length / 2),
    variantId: `runde-${turnIslandId}`,
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
  it('liest den Namen am PLAN ab: Himmelsrichtung, Inselzahl, Wende', () => {
    const views = altRouteViews(
      assessmentOf(
        [makeAlt('amorgos', ['ios', 'amorgos', 'santorin'])],
        [makeOption({ name: 'Amorgos', previewIndex: 0, konzeptId: 'ost' })],
      ),
      islandName,
    );

    expect(views).toHaveLength(1);
    expect(views[0]!.name).toBe('Ostrunde · 3 Inseln · Wende Amorgos');
    expect(views[0]!.turnName).toBe('Amorgos');
    // Hafentage zählen nicht als Etappen.
    expect(views[0]!.stageCount).toBe(3);
  });

  it('eine doppelt angelaufene Insel steht im Namen — der Unterschied soll sichtbar sein', () => {
    const views = altRouteViews(
      assessmentOf(
        [makeAlt('amorgos', ['ios', 'amorgos', 'ios'])],
        [makeOption({ name: 'Amorgos', previewIndex: 0, konzeptId: 'ost' })],
      ),
      islandName,
    );

    expect(views[0]!.name).toBe('Ostrunde · 2 Inseln (eine doppelt) · Wende Amorgos');
  });

  it('benennt die Herkunft: Optionsraum, Routen-Konzept, Zustand, Empfehlung', () => {
    const views = altRouteViews(
      assessmentOf(
        [makeAlt('santorin', ['ios', 'santorin'])],
        [
          makeOption({
            name: 'Santorin',
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
      'Ziel Santorin im Optionsraum · Route 2 · Ost · schließt · abgeraten · wählbar',
    );
    expect(views[0]!.abratenGruende).toEqual(['Route 2 trägt die Lage nicht']);
  });

  it('markiert den FR2-Zeugen als das, was er ist — keine Option des Optionsraums', () => {
    const views = altRouteViews(
      assessmentOf([makeAlt('ios', ['santorin', 'ios'])], []),
      islandName,
    );

    expect(views[0]!.option).toBeNull();
    // Ohne Option ist die Himmelsrichtung unbekannt — der Rest wird trotzdem
    // am Plan abgelesen, nie erfunden.
    expect(views[0]!.name).toBe('Runde · 2 Inseln · Wende Ios');
    expect(views[0]!.herkunft).toContain('keine Option des Optionsraums');
  });

  it('gibt jeder Alternative die Farbe ihres Listenplatzes — Karte und Tagesansicht zeigen dieselbe', () => {
    const views = altRouteViews(
      assessmentOf(
        [
          makeAlt('amorgos', ['amorgos']),
          makeAlt('santorin', ['santorin']),
          makeAlt('ios', ['ios']),
        ],
        [],
      ),
      islandName,
    );

    expect(views.map((v) => v.index)).toEqual([0, 1, 2]);
    expect(views.map((v) => v.color)).toEqual([...ALT_ROUTE_COLORS].slice(0, 3));
  });

  it('teilen sich zwei Optionen einen Plan, bleibt es EINE Route mit EINEM Namen', () => {
    const views = altRouteViews(
      assessmentOf(
        [makeAlt('amorgos', ['ios', 'amorgos'])],
        [
          makeOption({ name: 'Amorgos', previewIndex: 0, konzeptId: 'ost' }),
          makeOption({ name: 'Ios', previewIndex: 0, konzeptId: 'ost' }),
        ],
      ),
      islandName,
    );

    expect(views).toHaveLength(1);
    expect(views[0]!.name).toBe('Ostrunde · 2 Inseln · Wende Amorgos');
    // Die erste Option gewinnt weiterhin die HERKUNFT — ein Plan, eine Zeile.
    expect(views[0]!.herkunft).toContain('Ziel Amorgos');
  });

  it('ignoriert Optionen ohne eigenen Plan (previewIndex null = Hauptroute)', () => {
    const views = altRouteViews(
      assessmentOf(
        [makeAlt('ios', ['ios'])],
        [makeOption({ name: 'Klassik-Runde', previewIndex: null })],
      ),
      islandName,
    );

    expect(views[0]!.option).toBeNull();
  });
});

describe('altRouteAt', () => {
  const views = altRouteViews(
    assessmentOf([makeAlt('ios', ['ios']), makeAlt('amorgos', ['amorgos'])], []),
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
