// FIRST import, deliberately. ES modules are evaluated in source order, so this
// strips stray newlines/quotes from every secret before any module below reads
// one. A key pasted into the hosting dashboard with a trailing line break is
// otherwise rejected by Node as an invalid header character, and every Stripe
// call in the process fails as a misleading "connection error".
import "./env";

import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { startMVGDeadlineScheduler } from "./mvg-scheduler";
import { startPayoutScheduler } from "./payout-scheduler";
import { startPaymentReconciler } from "./payment-reconciler";
import { startEventReminderScheduler } from "./event-reminder-scheduler";
import { startEmailJobScheduler } from "./emailJobScheduler";
import { startIcalSyncScheduler } from "./ical-scheduler";
import { assertEmailConfiguration } from "./notifications";
import { validateStripeConfig } from "./payments";

const app = express();
// Trust Replit's reverse proxy so req.protocol and X-Forwarded-* headers are correct
app.set("trust proxy", 1);

// IMPORTANT: Stripe webhook signature verification needs the *raw* request body.
// If the global express.json() parser runs first it consumes the stream and
// req.body becomes a parsed object, so stripe.webhooks.constructEvent() can never
// match the signature — every webhook (payment_intent.succeeded, charge.refunded,
// deposit capture, auto-refund, …) silently fails. Skip the body parsers for the
// webhook path so the route's own express.raw() sees the untouched Buffer.
const STRIPE_WEBHOOK_PATH = '/api/webhooks/stripe';
const jsonParser = express.json({ limit: '10mb' });
const urlencodedParser = express.urlencoded({ extended: false, limit: '10mb' });
app.use((req, res, next) => {
  if (req.path === STRIPE_WEBHOOK_PATH) return next();
  return jsonParser(req, res, next);
});
app.use((req, res, next) => {
  if (req.path === STRIPE_WEBHOOK_PATH) return next();
  return urlencodedParser(req, res, next);
});

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  assertEmailConfiguration();
  // Fail loud on Stripe misconfiguration (mismatched keys, missing webhook secret)
  // rather than letting buyers hit a cryptic error at checkout.
  await validateStripeConfig();
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    console.error("[Express Error]", err);
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 80 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '80', 10);
  server.listen(port, "0.0.0.0", () => {
    log(`serving on port ${port}`);
    
    // Start MVG deadline scheduler
    startMVGDeadlineScheduler();
    // Start 7-day post-event payout scheduler
    startPayoutScheduler();
    // Start 24-hour pre-event reminder scheduler
    startEventReminderScheduler();
    // Start durable delayed community-email worker
    startEmailJobScheduler();
    // Rebuild bookings for payments Stripe captured but nothing recorded
    startPaymentReconciler();
    // Pull venue calendars in so dates sold elsewhere are blocked here
    startIcalSyncScheduler();
  });
})();
