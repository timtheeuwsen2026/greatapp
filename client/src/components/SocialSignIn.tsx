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
          // The access token lets Supabase check the ID token's at_hash
          // (it warns without it, and plans to require it).
          const { error } = await supabase.auth.signInWithIdToken({
            provider: "google",
            token: result.idToken,
            ...(result.accessToken ? { access_token: result.accessToken } : {}),
          });
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
  const bytes = new TextEncoder().encode(value);
  // crypto.subtle only exists on secure pages (https, localhost). Fall back to
  // a plain implementation anywhere else, e.g. a test build over the LAN.
  const digest = globalThis.crypto?.subtle
    ? new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", bytes))
    : sha256(bytes);
  return Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** SHA-256 (FIPS 180-4), used only when crypto.subtle is missing. */
function sha256(message: Uint8Array): Uint8Array {
  const K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ]);
  const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const length = ((message.length + 9 + 63) >> 6) << 6;
  const data = new Uint8Array(length);
  data.set(message);
  data[message.length] = 0x80;
  const view = new DataView(data.buffer);
  view.setUint32(length - 8, Math.floor((message.length * 8) / 0x100000000));
  view.setUint32(length - 4, (message.length * 8) >>> 0);
  const w = new Uint32Array(64);
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));
  for (let offset = 0; offset < length; offset += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(offset + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], k = h[7];
    for (let i = 0; i < 64; i++) {
      const t1 = (k + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) >>> 0;
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      k = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h[0] += a; h[1] += b; h[2] += c; h[3] += d; h[4] += e; h[5] += f; h[6] += g; h[7] += k;
  }
  const out = new Uint8Array(32);
  const outView = new DataView(out.buffer);
  h.forEach((value, i) => outView.setUint32(i * 4, value));
  return out;
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
