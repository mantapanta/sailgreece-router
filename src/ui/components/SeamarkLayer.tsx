/**
 * OpenSeaMap-Seezeichen als transparentes Tile-Overlay über der Google-Karte.
 *
 * Rein visuell: Tonnen, Baken, Leuchtfeuer, Hafensymbole — das, was auf dem
 * Satellitenbild unsichtbar ist. Kein Modul im Domain-Core sieht diese Daten;
 * Scoring und Searoute rechnen unverändert. Tiefen zeigt die Ebene NICHT
 * verlässlich — Pilotage bleibt Sache des Revierführers, nicht der App.
 *
 * Die Tiles kommen vom Community-Server tiles.openseamap.org und sind
 * transparent: fällt der Server aus, fehlen schlimmstenfalls die Symbole,
 * die Karte darunter funktioniert normal weiter. Attribution (CC-BY-SA /
 * ODbL) zeigt die einbettende View neben der Karte an — ein ImageMapType
 * bringt keine eigene Attributionszeile mit.
 */

import { useEffect } from 'react';
import { useMap } from '@vis.gl/react-google-maps';

const TILE_URL = 'https://tiles.openseamap.org/seamark';

/**
 * Unterhalb dieses Zooms werden keine Tiles angefragt: der Renderer von
 * OpenSeaMap zeichnet dort ohnehin fast nichts, und der Community-Server
 * muss nicht für leere Antworten bezahlen.
 */
const MIN_ZOOM = 8;
const MAX_ZOOM = 18;

export function SeamarkLayer() {
  const map = useMap();

  useEffect(() => {
    if (!map) return;

    const layer = new google.maps.ImageMapType({
      name: 'OpenSeaMap',
      tileSize: new google.maps.Size(256, 256),
      maxZoom: MAX_ZOOM,
      getTileUrl: (coord, zoom) => {
        if (zoom < MIN_ZOOM || zoom > MAX_ZOOM) return null;
        const tiles = 1 << zoom;
        // y ausserhalb der Karte gibt es nicht; x wickelt um die Datumsgrenze.
        if (coord.y < 0 || coord.y >= tiles) return null;
        const x = ((coord.x % tiles) + tiles) % tiles;
        return `${TILE_URL}/${zoom}/${x}/${coord.y}.png`;
      },
    });

    map.overlayMapTypes.push(layer);
    return () => {
      const idx = map.overlayMapTypes.getArray().indexOf(layer);
      if (idx >= 0) map.overlayMapTypes.removeAt(idx);
    };
  }, [map]);

  return null;
}
