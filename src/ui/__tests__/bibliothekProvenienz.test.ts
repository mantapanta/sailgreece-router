import { describe, expect, it } from 'vitest';
import { bibliothekZeile, nachgeladenSatz } from '../bibliothekProvenienz.ts';
import type { Library } from '../../domain/schema/snapshot.ts';

function bibliothek(over: Partial<Library> = {}): Library {
  return {
    islands: [],
    places: [],
    invalidPlaces: [],
    legs: [],
    variants: [],
    ...over,
  } as Library;
}

const platzMitTavernen = (id: string, n: number) =>
  ({
    id,
    restaurants: Array.from({ length: n }, (_, i) => ({ id: `${id}-${i}` })),
  }) as never;

describe('bibliothekZeile', () => {
  it('zählt jede Ebene, auch die leeren — 0 ist die Auskunft, um die es geht', () => {
    expect(bibliothekZeile(bibliothek())).toBe(
      'Bibliothek: 0 Inseln · 0 Plätze · 0 Etappen · 0 Tavernen · 0 Kite-Spots',
    );
  });

  it('summiert die Tavernen über die Plätze — sie haben kein eigenes Dokument', () => {
    const lib = bibliothek({
      islands: [{ id: 'paros' }] as never,
      places: [platzMitTavernen('paros-naoussa', 3), platzMitTavernen('paros-parikia', 1)],
      kiteSpots: [{ id: 'kite-paros-pounda' }] as never,
    });
    expect(bibliothekZeile(lib)).toBe(
      'Bibliothek: 1 Insel · 2 Plätze · 0 Etappen · 4 Tavernen · 1 Kite-Spot',
    );
  });
});

describe('nachgeladenSatz', () => {
  it('schweigt, wenn alles aus der konfigurierten Quelle kam', () => {
    expect(nachgeladenSatz(bibliothek())).toBeNull();
  });

  it('nennt die Ebene UND den ausstehenden Import', () => {
    const satz = nachgeladenSatz(bibliothek({ nachgeladen: ['kiteSpots'] }));
    expect(satz).toContain('Kite-Spots');
    expect(satz).toContain('nicht aus Firestore');
    expect(satz).toContain('seed:import');
  });

  it('verbindet zwei Ebenen zu einem Satz', () => {
    const satz = nachgeladenSatz(bibliothek({ nachgeladen: ['kiteSpots', 'restaurants'] }));
    expect(satz).toContain('Kite-Spots und Tavernen');
  });
});
