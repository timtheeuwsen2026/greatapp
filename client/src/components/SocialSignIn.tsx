import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import { isSignInCancel, nativeApp } from "@/lib/nativeApp";

type Provider = "google" | "apple";

/**
 * "Continue with Google" and "Continue with Apple".
 *
 * - In the iOS/Android app: the native Google or Apple sheet returns an ID
 *   token, and `signInWithIdToken` turns it into the normal Supabase session.
 *   Google blocks its sign-in page inside app web views, so this is the only
 *   way Google login works in the app.
 * - In a browser: the regular Supabase OAuth redirect, back to /login.
 *
 * Either way AuthContext sees SIGNED_IN and sends the person to their
 * dashboard (or `returnTo`), and /api/auth/user creates a participant account
 * on the first sign-in, exactly as it does for email signups.
 */
export default function SocialSignIn({ returnTo, mode }: { returnTo: string | null; mode: "login" | "signup" }) {
  const [busy, setBusy] = useState<Provider | null>(null);
  const { toast } = useToast();
  const app = nativeApp();
  // Sign in with Apple: native on iOS, the web flow in browsers. The Android
  // app shows Google only.
  const showApple = !app || app.platform === "ios";

  async function signIn(provider: Provider) {
    setBusy(provider);
    try {
      if (app) {
        if (provider === "google") {
          const result = await app.auth.google();
          if (!result.idToken) throw new Error("Google didn't return a sign-in token.");
          const { error } = await supabase.auth.signInWithIdToken({ provider: "google", token: result.idToken });
          if (error) throw error;
        } else {
          // Apple puts the nonce we pass into the token; Supabase hashes the
          // raw value and compares. So the sheet gets the SHA-256, Supabase
          // gets the raw value.
          const rawNonce = randomNonce();
          const result = await app.auth.apple({ nonce: await sha256Hex(rawNonce) });
          if (!result.idToken) throw new Error("Apple didn't return a sign-in token.");
          const { error } = await supabase.auth.signInWithIdToken({ provider: "apple", token: result.idToken, nonce: rawNonce });
          if (error) throw error;
          // Apple shares the name only the first time someone signs in.
          const givenName = result.profile?.givenName?.trim();
          if (givenName) {
            void supabase.auth.updateUser({
              data: { first_name: givenName, last_name: result.profile?.familyName?.trim() || undefined },
            });
          }
        }
        return; // AuthContext redirects on SIGNED_IN.
      }

      const redirectTo = `${window.location.origin}/login${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ""}`;
      const { error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo } });
      if (error) throw error;
      // The browser is leaving for Google/Apple; keep the button busy.
      return;
    } catch (error) {
      if (!isSignInCancel(error)) {
        console.error(`[auth] ${provider} sign-in failed`, error);
        toast({
          title: `${provider === "google" ? "Google" : "Apple"} sign-in didn't work`,
          description: String((error as any)?.message ?? "Please try again, or use your email and password."),
          variant: "destructive",
        });
      }
    }
    setBusy(null);
  }

  return (
    <div className="mb-6 space-y-3" data-testid="social-sign-in">
      {showApple && (
        <button
          type="button"
          onClick={() => signIn("apple")}
          disabled={busy !== null}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-black px-4 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
          data-testid="button-continue-apple"
        >
          <AppleLogo />
          {busy === "apple" ? "Connecting…" : "Continue with Apple"}
        </button>
      )}
      <button
        type="button"
        onClick={() => signIn("google")}
        disabled={busy !== null}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm font-semibold text-gray-800 transition-colors hover:bg-gray-50 disabled:opacity-60"
        data-testid="button-continue-google"
      >
        <GoogleLogo />
        {busy === "google" ? "Connecting…" : "Continue with Google"}
      </button>
      {mode === "signup" && (
        <p className="text-center text-xs text-muted-foreground">
          By continuing with Apple or Google you agree to our{" "}
          <a href="/terms" className="underline">Terms and Conditions</a> and{" "}
          <a href="/privacy" className="underline">Privacy Policy</a>.
        </p>
      )}
      <div className="flex items-center gap-3 pt-1 text-xs uppercase text-muted-foreground">
        <span className="h-px flex-1 bg-gray-200" />
        or with email
        <span className="h-px flex-1 bg-gray-200" />
      </div>
    </div>
  );
}

function randomNonce(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

function AppleLogo() {
  return (
    <svg width="16" height="16" viewBox="0 0 384 512" aria-hidden="true" fill="currentColor">
      <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
    </svg>
  );
}

function GoogleLogo() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}
