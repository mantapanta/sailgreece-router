/**
 * Design tokens — TypeScript mirror of the CSS custom properties in styles.css.
 *
 * Google Maps polylines/markers and SVG defaults cannot consume CSS variables,
 * so every TS color constant lives HERE and nowhere else. MUST stay in sync
 * with the :root block in src/ui/styles.css — values change first in DESIGN.md
 * (_bmad-output/planning-artifacts/ux-designs/, 2026-08-05 UX spine), then in
 * both files together.
 */
import type { Ampel } from '../domain/schema/common.ts';

export const COLORS = {
  surfacePage: '#faf9f7',
  surfaceCard: '#ffffff',
  surfaceInset: '#faf9f7',
  surfaceTrack: '#f0eeea',
  inkPrimary: '#23211e',
  inkSecondary: '#6f6a62',
  inkTertiary: '#98928a',
  borderHairline: '#ecebe7',
  accent: '#f2604d',
  accentDeep: '#d94c3a',
  accentText: '#c23a28',
  accentTint: '#fdeeec',
  accentGradientEnd: '#e5893c',
  onAccent: '#ffffff',
  focusRing: '#f2604d',
  ampelGruen: '#1a9d5c',
  ampelGruenTint: '#e4f5ec',
  ampelGruenText: '#147a47',
  ampelGelb: '#e09112',
  ampelGelbGraphic: '#b8770c',
  ampelGelbTint: '#fcf3e0',
  ampelGelbText: '#7a5306',
  ampelRot: '#d93636',
  ampelRotTint: '#fbe9e9',
  ampelRotText: '#a72020',
  ampelUnbewertet: '#b6b1a9',
  ampelUnbewertetTint: '#f0eeea',
  ampelUnbewertetText: '#6f6a62',
  altRoute1: '#6f4a9c',
  altRoute2: '#1f7a8c',
  altRoute3: '#b05f2c',
  mapLineSailed: '#1a9d5c',
  mapLineCasing: '#ffffff',
} as const;

/** Ampel hues — badges-on-tint context (raw hue). */
export const AMPEL_HEX: Record<Ampel, string> = {
  gruen: COLORS.ampelGruen,
  gelb: COLORS.ampelGelb,
  rot: COLORS.ampelRot,
  unbewertet: COLORS.ampelUnbewertet,
};

/**
 * Graphic variant: standalone dots and lines on light ground / map imagery.
 * Gelb #e09112 is ≈2.6:1 on white — too weak as a bare graphic; #b8770c is ≥3:1.
 */
export const AMPEL_GRAPHIC_HEX: Record<Ampel, string> = {
  gruen: COLORS.ampelGruen,
  gelb: COLORS.ampelGelbGraphic,
  rot: COLORS.ampelRot,
  unbewertet: COLORS.ampelUnbewertet,
};

export const ALT_ROUTE_COLORS = [
  COLORS.altRoute1,
  COLORS.altRoute2,
  COLORS.altRoute3,
] as const;

export const MAP_LINE_SAILED = COLORS.mapLineSailed;
export const MAP_LINE_CASING = COLORS.mapLineCasing;
export const INK_PRIMARY = COLORS.inkPrimary;

/**
 * Round-trip direction colors (MapView): outbound vs. return leg. Deliberately
 * outside the Ampel hues and the alt-route palette — a direction that looks
 * like a verdict or an alternative would stop reading as a direction. Lines
 * additionally carry direction arrows for color-blind safety (Polyline.tsx).
 */
export const HIN_LINE_COLOR = '#2f6fd0';
export const RUECK_LINE_COLOR = '#c2418f';
