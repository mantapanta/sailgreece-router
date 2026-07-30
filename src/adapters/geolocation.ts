/**
 * FR27 — browser geolocation -> position with source 'gps'.
 * Manual override (picking a library place) lives in the TripContext (AD-11);
 * a 'manual' position is never overwritten by GPS updates.
 */

import type { TripPosition } from '../domain/schema/snapshot.ts';

export class GeolocationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GeolocationError';
  }
}

export function getCurrentGpsPosition(): Promise<TripPosition> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new GeolocationError('Browser stellt keine Standortabfrage bereit'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          source: 'gps',
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
        });
      },
      (err) => {
        reject(new GeolocationError(`Standort nicht verfügbar: ${err.message}`));
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  });
}
