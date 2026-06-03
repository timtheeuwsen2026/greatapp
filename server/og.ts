import { createCanvas, loadImage, type SKRSContext2D } from "@napi-rs/canvas";
import type { Express, Request, Response } from "express";
import { storage } from "./storage";

// ─── Social bot user-agent detection ─────────────────────────────────────────
const BOT_PATTERNS = [
  "facebookexternalhit",
  "Facebot",
  "Twitterbot",
  "WhatsApp",
  "Slackbot",
  "TelegramBot",
  "LinkedInBot",
  "Discordbot",
  "Pinterest",
  "iframely",
  "Embedly",
  "vkShare",
  "Googlebot",
  "bingbot",
  "SkypeUriPreview",
  "quora link preview",
  "W3C_Validator",
  "rogerbot",
  "Applebot",
  "Viber",
  "Signal",
];

export function isSocialBot(userAgent: string): boolean {
  if (!userAgent) return false;
  const ua = userAgent.toLowerCase();
  return BOT_PATTERNS.some((p) => ua.includes(p.toLowerCase()));
}

// ─── Lifecycle helpers ────────────────────────────────────────────────────────
type LifecycleState = "FORMING" | "CONFIRMED" | "CANCELLED";

interface MVGData {
  current: number;
  minimum: number;
  met: boolean;
}

function resolveLifecycle(experience: any, mvg: MVGData): LifecycleState {
  if (experience.status === "cancelled") return "CANCELLED";
  if (mvg.met || experience.status === "confirmed") return "CONFIRMED";
  return "FORMING";
}

function buildOGTitle(experience: any, mvg: MVGData): string {
  const state = resolveLifecycle(experience, mvg);
  const name = experience.title || "Unnamed Trip";
  const spotsLeft = Math.max(0, mvg.minimum - mvg.current);

  if (state === "FORMING") {
    return mvg.minimum > 0
      ? `🔥 ${name} — Only ${spotsLeft} more needed to confirm!`
      : `🔥 ${name} — Reserve your spot!`;
  }
  if (state === "CONFIRMED") return `✅ ${name} — This trip is happening!`;
  return `${name} — This experience was cancelled`;
}

function buildOGDescription(experience: any, mvg: MVGData): string {
  const state = resolveLifecycle(experience, mvg);
  const spotsLeft = Math.max(0, mvg.minimum - mvg.current);

  if (state === "FORMING") {
    return mvg.minimum > 0
      ? `I just reserved my spot! If we get ${spotsLeft} more traveler${spotsLeft === 1 ? "" : "s"} this trip is officially ON. Join me — fully refundable if the group doesn't form.`
      : `I just reserved my spot! Join me on this incredible experience.`;
  }
  if (state === "CONFIRMED") {
    return `This trip is confirmed and happening! Grab your spot before it sells out.`;
  }
  return `This experience did not reach its minimum group size.`;
}

// ─── OG image generation (1200 × 630) ────────────────────────────────────────
async function generateOGImage(experience: any, mvg: MVGData): Promise<Buffer> {
  const W = 1200;
  const H = 630;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d") as SKRSContext2D;

  // 1. Brand gradient fallback background
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#1e1b4b");
  bg.addColorStop(0.55, "#312e81");
  bg.addColorStop(1, "#0f0f23");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // 2. Cover image — full-bleed cover-fit
  const imgUrl = experience.coverImageUrl;
  if (imgUrl) {
    try {
      const normalised = imgUrl.startsWith("http") ? imgUrl : `https:${imgUrl}`;
      const img = await loadImage(normalised);
      const scale = Math.max(W / img.width, H / img.height);
      const dw = img.width * scale;
      const dh = img.height * scale;
      ctx.drawImage(img as any, (W - dw) / 2, (H - dh) / 2, dw, dh);
    } catch {
      // stay on gradient
    }
  }

  // 3. Dark gradient scrim (bottom-heavy)
  const scrim = ctx.createLinearGradient(0, H * 0.1, 0, H);
  scrim.addColorStop(0, "rgba(0,0,0,0)");
  scrim.addColorStop(0.4, "rgba(0,0,0,0.45)");
  scrim.addColorStop(0.75, "rgba(0,0,0,0.82)");
  scrim.addColorStop(1, "rgba(0,0,0,0.97)");
  ctx.fillStyle = scrim;
  ctx.fillRect(0, 0, W, H);

  // Top scrim (logo readability)
  const topScrim = ctx.createLinearGradient(0, 0, 0, 130);
  topScrim.addColorStop(0, "rgba(0,0,0,0.52)");
  topScrim.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = topScrim;
  ctx.fillRect(0, 0, W, 130);

  // 4. "Great." wordmark — top left
  ctx.textBaseline = "top";
  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.font = "bold 42px sans-serif";
  ctx.fillText("Great.", 56, 44);

  // 5. Lifecycle badge pill
  const state = resolveLifecycle(experience, mvg);
  const badgeColors: Record<LifecycleState, string> = {
    FORMING: "#fbbf24",
    CONFIRMED: "#34d399",
    CANCELLED: "#f87171",
  };
  const badgeLabels: Record<LifecycleState, string> = {
    FORMING: "FORMING",
    CONFIRMED: "CONFIRMED",
    CANCELLED: "CANCELLED",
  };

  ctx.font = "bold 20px sans-serif";
  const badgeLabel = badgeLabels[state];
  const badgeTW = ctx.measureText(badgeLabel).width;
  const badgePadX = 22;
  const badgeH = 38;
  const badgeY = H - 170;
  const badgeX = 56;
  ctx.fillStyle = badgeColors[state];
  ctx.beginPath();
  ctx.roundRect(badgeX, badgeY, badgeTW + badgePadX * 2, badgeH, 8);
  ctx.fill();
  ctx.fillStyle = "#000000";
  ctx.textBaseline = "middle";
  ctx.fillText(badgeLabel, badgeX + badgePadX, badgeY + badgeH / 2);

  // 6. Trip name (word-wrapped, max 2 lines)
  const titleFontSize = experience.title && experience.title.length > 40 ? 52 : 62;
  ctx.font = `bold ${titleFontSize}px sans-serif`;
  ctx.fillStyle = "#ffffff";
  ctx.textBaseline = "top";

  const maxTitleW = W - 120;
  const titleWords = (experience.title || "Untitled Trip").split(" ");
  let titleLine = "";
  const titleLines: string[] = [];
  for (const word of titleWords) {
    const test = titleLine + (titleLine ? " " : "") + word;
    if (ctx.measureText(test).width > maxTitleW && titleLine) {
      titleLines.push(titleLine);
      titleLine = word;
      if (titleLines.length >= 2) break;
    } else {
      titleLine = test;
    }
  }
  titleLines.push(titleLine);

  const titleStartY = H - 145;
  titleLines.slice(0, 2).forEach((line, i) => {
    ctx.fillText(line, 56, titleStartY + i * (titleFontSize + 8));
  });

  // 7. Spot count / confirmed line
  const spotsLeft = Math.max(0, mvg.minimum - mvg.current);
  const infoY = titleStartY + titleLines.slice(0, 2).length * (titleFontSize + 8) + 14;

  ctx.font = "500 28px sans-serif";
  if (state === "FORMING" && mvg.minimum > 0) {
    ctx.fillStyle = "#fbbf24";
    ctx.fillText(
      `Only ${spotsLeft} more needed to confirm — join me!`,
      56,
      infoY
    );
  } else if (state === "CONFIRMED") {
    ctx.fillStyle = "#34d399";
    ctx.fillText("Trip confirmed — grab your spot!", 56, infoY);
  }

  // 8. Right side: subtle Great. logo watermark (large, transparent)
  ctx.font = "bold 180px sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.04)";
  ctx.textBaseline = "middle";
  ctx.fillText("Great.", W - 520, H / 2);

  // 9. Bottom brand strip
  ctx.fillStyle = "rgba(255,255,255,0.06)";
  ctx.fillRect(0, H - 44, W, 44);
  ctx.font = "400 15px sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.4)";
  ctx.textBaseline = "middle";
  ctx.fillText("Great.  ·  transformative travel  ·  greatapp.ai", 56, H - 22);

  return canvas.toBuffer("image/png");
}

// ─── Register routes ──────────────────────────────────────────────────────────
export function registerOGRoutes(app: Express) {
  // ── OG Image endpoint ── GET /api/og/experience/:id
  app.get("/api/og/experience/:id", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const experience = await storage.getExperience(id);

      if (!experience) {
        return res.status(404).send("Experience not found");
      }

      const mvgRaw = await storage.getMVGProgress(id);
      const mvg: MVGData = {
        current: mvgRaw.current_participants ?? 0,
        minimum: mvgRaw.minimum_participants ?? 0,
        met: mvgRaw.mvg_met ?? false,
      };

      const buf = await generateOGImage(experience, mvg);

      res.setHeader("Content-Type", "image/png");
      res.setHeader("Cache-Control", "public, max-age=300, stale-while-revalidate=60");
      res.setHeader("X-Content-Type-Options", "nosniff");
      return res.send(buf);
    } catch (err: any) {
      console.error("[OG Image]", err);
      return res.status(500).send("Image generation failed");
    }
  });

  // ── Social bot middleware ── GET /experience/:id
  // Must be registered before Vite catches all routes.
  // Regular browsers fall through; bots get a prerendered HTML shell.
  app.get("/experience/:id", async (req: Request, res: Response, next) => {
    const ua = req.headers["user-agent"] || "";
    if (!isSocialBot(ua)) return next();

    try {
      const { id } = req.params;
      const experience = await storage.getExperience(id);

      if (!experience) return next();

      const mvgRaw = await storage.getMVGProgress(id);
      const mvg: MVGData = {
        current: mvgRaw.current_participants ?? 0,
        minimum: mvgRaw.minimum_participants ?? 0,
        met: mvgRaw.mvg_met ?? false,
      };

      // Derive public-facing base URL.
      // Priority: REPLIT_DOMAINS env var → X-Forwarded-Host header → Host header.
      // REPLIT_DOMAINS is always set in both dev and deployed Replit environments,
      // ensuring the og:image URL is publicly reachable by WhatsApp / Facebook crawlers.
      const replitDomain = process.env.REPLIT_DOMAINS?.split(",")[0]?.trim();
      const forwardedProto = (req.headers["x-forwarded-proto"] as string)?.split(",")[0]?.trim() || "https";
      const forwardedHost = (req.headers["x-forwarded-host"] as string)?.split(",")[0]?.trim();
      const origin = replitDomain
        ? `https://${replitDomain}`
        : forwardedHost
          ? `${forwardedProto}://${forwardedHost}`
          : `${req.protocol}://${req.get("host")}`;

      const refParam = req.query.ref ? `?ref=${req.query.ref}` : "";
      const appBaseUrl = process.env.VITE_APP_BASE_URL || process.env.APP_BASE_URL || origin;
      const ogUrl = `${appBaseUrl}/experience/${id}${refParam}`;
      const ogImageUrl = `${origin}/api/og/experience/${id}`;
      const ogTitle = buildOGTitle(experience, mvg);
      const ogDesc = buildOGDescription(experience, mvg);

      const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(ogTitle)}</title>

  <!-- Primary meta -->
  <meta name="description" content="${escapeHtml(ogDesc)}" />

  <!-- OpenGraph -->
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="Great." />
  <meta property="og:url" content="${escapeHtml(ogUrl)}" />
  <meta property="og:title" content="${escapeHtml(ogTitle)}" />
  <meta property="og:description" content="${escapeHtml(ogDesc)}" />
  <meta property="og:image" content="${escapeHtml(ogImageUrl)}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:type" content="image/png" />

  <!-- Twitter / X card -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:site" content="@greatapp" />
  <meta name="twitter:title" content="${escapeHtml(ogTitle)}" />
  <meta name="twitter:description" content="${escapeHtml(ogDesc)}" />
  <meta name="twitter:image" content="${escapeHtml(ogImageUrl)}" />
</head>
<body>
  <script>window.location.replace("${escapeHtml(ogUrl)}")</script>
  <noscript>
    <p><a href="${escapeHtml(ogUrl)}">View this experience on Great.</a></p>
  </noscript>
</body>
</html>`;

      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=30");
      return res.send(html);
    } catch (err: any) {
      console.error("[OG Bot Middleware]", err);
      return next();
    }
  });
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
