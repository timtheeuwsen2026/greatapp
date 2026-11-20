// The iOS and Android apps load this site in a native shell. The shell injects
// `window.AppForge` before any of our code runs and adds "GreatApp" to the
// user agent. Everything here is a no-op in a normal browser.

export type NativePlatform = "ios" | "android";

export interface NativeSignInResult {
  provider: "google" | "apple";
  idToken?: string;
  profile?: { givenName?: string | null; familyName?: string | null; email?: string | null } | null;
}

export interface CalendarEventInput {
  title: string;
  /** ISO 8601 start, e.g. 2026-12-01T18:00:00Z */
  start: string;
  /** ISO 8601 end. Defaults to two hours after the start. */
  end?: string;
  location?: string;
  notes?: string;
  url?: string;
}

interface NativeShellApi {
  native: true;
  platform: NativePlatform;
  auth: {
    google(): Promise<NativeSignInResult>;
    apple(options?: { nonce?: string }): Promise<NativeSignInResult>;
  };
  share(options: { title?: string; text?: string; url?: string }): Promise<unknown>;
  calendar?: { add(event: CalendarEventInput): Promise<unknown> };
  openExternal(url: string): Promise<unknown>;
}

declare global {
  interface Window {
    AppForge?: NativeShellApi;
  }
}

/** The native shell's API when running inside the iOS or Android app, else null. */
export function nativeApp(): NativeShellApi | null {
  if (typeof window === "undefined") return null;
  return window.AppForge?.native ? window.AppForge : null;
}

/** True inside the iOS or Android app. */
export function isNativeApp(): boolean {
  if (typeof window === "undefined") return false;
  return !!window.AppForge?.native || /\bGreatApp\b/.test(navigator.userAgent);
}

export function nativePlatform(): NativePlatform | null {
  return nativeApp()?.platform ?? null;
}

/**
 * Opens a page of this site in the phone's browser (Safari or Chrome) rather
 * than inside the app. Used for the hosting tools, which stay on the website.
 * In a normal browser it opens a new tab.
 */
export function openInBrowser(path: string): void {
  const url = new URL(path, window.location.origin).toString();
  const app = nativeApp();
  if (app) {
    void app.openExternal(url);
    return;
  }
  window.open(url, "_blank", "noopener");
}

/** A user closing the Google or Apple sheet is not an error worth a toast. */
export function isSignInCancel(error: unknown): boolean {
  const message = String((error as any)?.message ?? error ?? "").toLowerCase();
  const code = String((error as any)?.code ?? "");
  return /cancel/.test(message) || code === "1001" || /12501/.test(message);
}
