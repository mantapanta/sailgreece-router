/**
 * Firebase Authentication adapter — Google Sign-in only.
 *
 * The React layer never touches the Firebase SDK directly: it gets a narrow
 * `AppUser` and German error messages from here, so the SDK stays swappable and
 * out of the component tree. Firebase modules are imported lazily (see
 * `firebase.ts`) — the sign-in bundle is only fetched once auth is actually
 * used.
 */

import { getFirebaseAuth } from './firebase.ts';

/** Everything the app needs from a session — deliberately not the SDK user. */
export interface AppUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoUrl: string | null;
}

export class AuthError extends Error {
  readonly code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
  }
}

function toAppUser(user: {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}): AppUser {
  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    photoUrl: user.photoURL,
  };
}

/**
 * How long to wait for the SDK's FIRST session report before giving up.
 *
 * Measured, not guessed: if Authentication was never initialized in the
 * project, `onAuthStateChanged` calls neither its next nor its error callback,
 * and `auth.authStateReady()` never settles either — the SDK swallows the
 * `CONFIGURATION_NOT_FOUND` completely. Without this watchdog the app hangs on
 * "Anmeldung wird geprüft …" forever, which on the water means a blank screen
 * and no way forward.
 */
const AUTH_READY_TIMEOUT_MS = 8_000;

/**
 * Subscribe to session changes. Fires once with the restored session (or null)
 * after the SDK has checked persisted credentials — that first call is what
 * ends the app's "wird geprüft …" state.
 *
 * Returns an unsubscribe function; if the SDK cannot be loaded (missing
 * config) or never reports, `onError` is called instead.
 */
export function observeAuthState(
  onUser: (user: AppUser | null) => void,
  onError: (error: Error) => void,
): () => void {
  let unsubscribe: (() => void) | null = null;
  let cancelled = false;
  /** The watchdog guards the FIRST report only — later ones must stay live. */
  let reported = false;

  const watchdog = setTimeout(() => {
    if (cancelled || reported) return;
    reported = true;
    onError(
      new AuthError(
        'Firebase Authentication antwortet nicht. Häufigste Ursache: Authentication ist im Projekt nicht eingerichtet (Firebase Console → Authentication → Jetzt starten). Sonst: Verbindung prüfen und neu laden.',
        'auth/state-timeout',
      ),
    );
  }, AUTH_READY_TIMEOUT_MS);

  const settle = (report: () => void) => {
    if (cancelled) return;
    reported = true;
    clearTimeout(watchdog);
    report();
  };

  void (async () => {
    try {
      const auth = await getFirebaseAuth();
      const { onAuthStateChanged } = await import('firebase/auth');
      if (cancelled) return;
      unsubscribe = onAuthStateChanged(
        auth,
        (user) => settle(() => onUser(user ? toAppUser(user) : null)),
        (e) => settle(() => onError(new AuthError(describe(e), codeOf(e)))),
      );
    } catch (e) {
      settle(() => onError(e instanceof Error ? e : new Error(String(e))));
    }
  })();

  return () => {
    cancelled = true;
    clearTimeout(watchdog);
    unsubscribe?.();
  };
}

/**
 * Google Sign-in via popup, with a redirect fallback: popups are blocked in
 * some in-app browsers and on iOS home-screen web apps — exactly the setup a
 * skipper is likely to use on board. `signInWithRedirect` never resolves here;
 * the session arrives through `observeAuthState` after the reload.
 */
export async function signInWithGoogle(): Promise<void> {
  const auth = await getFirebaseAuth();
  const { GoogleAuthProvider, signInWithPopup, signInWithRedirect } = await import(
    'firebase/auth'
  );
  const provider = new GoogleAuthProvider();
  // Always show the account chooser instead of silently reusing the one
  // Google session the device happens to have.
  provider.setCustomParameters({ prompt: 'select_account' });

  try {
    await signInWithPopup(auth, provider);
  } catch (e) {
    const code = codeOf(e);
    if (
      code === 'auth/popup-blocked' ||
      code === 'auth/operation-not-supported-in-this-environment'
    ) {
      // The fallback needs the same mapping as the popup path — otherwise a
      // blocked popup turns every downstream failure into a raw SDK string.
      try {
        await signInWithRedirect(auth, provider);
      } catch (redirectError) {
        throw new AuthError(describe(redirectError), codeOf(redirectError));
      }
      return;
    }
    // A user who closes the popup did not fail — stay silent for those.
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
      return;
    }
    throw new AuthError(describe(e), code);
  }
}

export async function signOutUser(): Promise<void> {
  const auth = await getFirebaseAuth();
  const { signOut } = await import('firebase/auth');
  try {
    await signOut(auth);
  } catch (e) {
    throw new AuthError(describe(e), codeOf(e));
  }
}

// ---------------------------------------------------------------------------
// Error mapping — German, actionable, never a raw SDK code in the UI
// ---------------------------------------------------------------------------

function codeOf(e: unknown): string {
  const code = (e as { code?: unknown } | null)?.code;
  return typeof code === 'string' ? code : 'unknown';
}

function describe(e: unknown): string {
  switch (codeOf(e)) {
    case 'auth/network-request-failed':
      return 'Keine Verbindung zu Firebase — Anmeldung offline nicht möglich.';
    case 'auth/popup-blocked':
      return 'Der Browser hat das Anmeldefenster blockiert. Popups für diese Seite erlauben.';
    case 'auth/unauthorized-domain':
      return 'Diese Domain ist in Firebase Authentication nicht als autorisierte Domain eingetragen.';
    case 'auth/operation-not-allowed':
      return 'Google-Anmeldung ist im Firebase-Projekt nicht aktiviert (Authentication → Sign-in method).';
    case 'auth/configuration-not-found':
      // Kommt, solange Authentication im Projekt nie initialisiert wurde —
      // nicht zu verwechseln mit "Provider aus" (operation-not-allowed).
      return 'Firebase Authentication ist in diesem Projekt noch nicht eingerichtet (Firebase Console → Authentication → Jetzt starten, danach Google als Anmeldemethode aktivieren).';
    case 'auth/user-disabled':
      return 'Dieses Konto ist deaktiviert.';
    case 'auth/invalid-api-key':
    case 'auth/api-key-not-valid.-please-pass-a-valid-api-key.':
      return 'Firebase-API-Key ungültig — VITE_FIREBASE_API_KEY prüfen.';
    default:
      return e instanceof Error ? e.message : String(e);
  }
}
