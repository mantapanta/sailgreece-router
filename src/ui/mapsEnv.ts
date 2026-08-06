/**
 * Maps runtime config (Story 1.3, AC 9). Missing values are a NAMED error the
 * views render honestly — never a silent demo-map-id fallback with Google's
 * watermarked demo styling (EXPERIENCE State Patterns, Karte).
 */
export type MapsEnv =
  | { ok: true; env: { apiKey: string; mapId: string } }
  | { ok: false; missing: string[] };

export function resolveMapsEnv(
  apiKey: string | undefined,
  mapId: string | undefined,
): MapsEnv {
  const missing: string[] = [];
  if (!apiKey?.trim()) missing.push('VITE_GOOGLE_MAPS_API_KEY');
  if (!mapId?.trim()) missing.push('VITE_GOOGLE_MAPS_MAP_ID');
  if (missing.length > 0) return { ok: false, missing };
  return { ok: true, env: { apiKey: apiKey!.trim(), mapId: mapId!.trim() } };
}
