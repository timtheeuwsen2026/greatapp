import type { Express } from "express";

/**
 * Universal links (iOS) and App Links (Android): with these two files served,
 * a greatexperiences.ai link tapped in Mail, Messages, WhatsApp or a push
 * opens the Great app instead of the browser (when the app is installed).
 *
 * They have to be explicit routes: express.static skips dot-folders such as
 * /.well-known, so without these the SPA fallback would answer with index.html
 * and both platforms would reject it. Apple doesn't follow redirects either,
 * so this must answer on greatexperiences.ai and www.greatexperiences.ai.
 *
 * Values can be overridden on Railway without a code change:
 *   APPLE_TEAM_ID                 10-character Apple Team ID
 *   ANDROID_CERT_SHA256           comma-separated SHA-256 fingerprints
 *                                 (Play App Signing key + upload key)
 */
const APP_ID = "ai.greatexperiences.app";
// Great Amstel BV's Apple Developer team.
const APPLE_TEAM_ID = process.env.APPLE_TEAM_ID || "T7ZU7KYG7W";
// The Android upload key. Add the Play App Signing key's SHA-256 (Play Console →
// App integrity) once the app exists in Play, comma-separated.
const ANDROID_CERT_SHA256 = (
  process.env.ANDROID_CERT_SHA256 ||
  "DA:54:6B:D2:67:11:8A:4F:7C:0D:A6:10:60:21:A6:53:4F:58:81:5D:D2:2B:54:69:17:FF:68:DD:02:4B:F2:7C"
)
  .split(",")
  .map((value) => value.trim().toUpperCase())
  .filter(Boolean);

// Pages that stay on the web even when the app is installed: the API, and the
// creator, venue, partner and admin tools, which aren't part of the app.
const WEB_ONLY_PATHS = [
  "/api/*",
  "/admin*",
  "/creator*",
  "/create-experience*",
  "/venue*",
  "/partner*",
  "/promoter/*",
  "/service*",
  "/event-builder*",
  "/journey-builder*",
  "/deal-rooms*",
  "/email-preferences*",
  "/unsubscribe*",
];

export function registerAppLinkRoutes(app: Express) {
  app.get("/.well-known/apple-app-site-association", (_req, res) => {
    if (!APPLE_TEAM_ID) return res.status(404).type("text/plain").send("Not configured");
    const appId = `${APPLE_TEAM_ID}.${APP_ID}`;
    res.set("Cache-Control", "public, max-age=3600");
    res.type("application/json").send(
      JSON.stringify({
        applinks: {
          details: [
            {
              appIDs: [appId],
              components: [
                ...WEB_ONLY_PATHS.map((path) => ({ "/": path, exclude: true })),
                { "/": "/*" },
              ],
            },
          ],
        },
        webcredentials: { apps: [appId] },
      }),
    );
  });

  app.get("/.well-known/assetlinks.json", (_req, res) => {
    if (!ANDROID_CERT_SHA256.length) return res.status(404).type("text/plain").send("Not configured");
    res.set("Cache-Control", "public, max-age=3600");
    res.type("application/json").send(
      JSON.stringify([
        {
          relation: ["delegate_permission/common.handle_all_urls"],
          target: { namespace: "android_app", package_name: APP_ID, sha256_cert_fingerprints: ANDROID_CERT_SHA256 },
        },
      ]),
    );
  });
}
