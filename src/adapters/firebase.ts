/**
 * Single place where the Firebase JS SDK is initialized.
 *
 * Every consumer (auth, firestore) goes through here so the app never ends up
 * with two `FirebaseApp` instances — `initializeApp` is called exactly once and
 * the SDK modules are imported lazily, keeping Firebase out of the initial
 * bundle for the parts of the app that do not need it.
 *
 * Configuration comes from Vite env vars (`.env`, see `.env.example`). A
 * missing config is a NAMED state (`isFirebaseConfigured() === false`), never a
 * silent fallback: the shell shows an explicit hint instead of pretending an
 * unauthenticated session is fine.
 */

import type { FirebaseApp, FirebaseOptions } from 'firebase/app';
import type { Auth } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';

export class FirebaseConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FirebaseConfigError';
  }
}

function env(key: string): string {
  const value = (import.meta.env as Record<string, string | undefined>)[key];
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * The three keys the Web SDK cannot work without. `authDomain` is derived from
 * the project id when it is not set explicitly, which is what the console
 * hands out for every default project.
 */
export function firebaseConfig(): FirebaseOptions | null {
  const apiKey = env('VITE_FIREBASE_API_KEY');
  const projectId = env('VITE_FIREBASE_PROJECT_ID');
  const appId = env('VITE_FIREBASE_APP_ID');
  if (!apiKey || !projectId || !appId) return null;

  return {
    apiKey,
    projectId,
    appId,
    authDomain: env('VITE_FIREBASE_AUTH_DOMAIN') || `${projectId}.firebaseapp.com`,
    storageBucket: env('VITE_FIREBASE_STORAGE_BUCKET') || undefined,
    messagingSenderId: env('VITE_FIREBASE_MESSAGING_SENDER_ID') || undefined,
  };
}

export function isFirebaseConfigured(): boolean {
  return firebaseConfig() !== null;
}

let appPromise: Promise<FirebaseApp> | null = null;

export async function getFirebaseApp(): Promise<FirebaseApp> {
  if (!appPromise) {
    appPromise = (async () => {
      const config = firebaseConfig();
      if (!config) {
        throw new FirebaseConfigError(
          'Firebase ist nicht konfiguriert — VITE_FIREBASE_API_KEY, VITE_FIREBASE_PROJECT_ID und VITE_FIREBASE_APP_ID fehlen (siehe .env.example).',
        );
      }
      const { initializeApp, getApps } = await import('firebase/app');
      return getApps()[0] ?? initializeApp(config);
    })().catch((e) => {
      // Do not cache a failed init: a later call should retry rather than
      // replay a stale rejection forever.
      appPromise = null;
      throw e;
    });
  }
  return appPromise;
}

export async function getFirebaseAuth(): Promise<Auth> {
  const app = await getFirebaseApp();
  const { getAuth } = await import('firebase/auth');
  return getAuth(app);
}

export async function getFirestoreDb(): Promise<Firestore> {
  const app = await getFirebaseApp();
  const { getFirestore } = await import('firebase/firestore');
  return getFirestore(app);
}
