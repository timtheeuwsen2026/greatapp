import type { Express } from "express";
import express from "express";
import { createServer, type Server } from "http";
import fs from "fs";
import path from "path";
import Stripe from "stripe";
import multer from "multer";
import { fileTypeFromBuffer } from "file-type";
import { storage } from "./storage";
import { db } from "./db";
import { bookings, platformSettings } from "@shared/schema";
import { eq } from "drizzle-orm";
import { paymentService } from "./payments";
import { initializeWebSocket, broadcastMVGUpdate } from "./websocket";
import { isAuthenticated } from "./supabaseAuth";
import { notificationService } from "./notifications";
import { registerOGRoutes } from "./og";
import { 
  insertCommunityApplicationSchema, 
  insertParticipantProfileSchema, 
  insertCreatorProfileSchema, 
  insertPromoterProfileSchema,
  insertVenueAvailabilitySchema,
  insertExperienceDraftSchema,
  validateExperienceDraftForPublish,
  roomSchema,
  itinerarySchema,
  roleSchema,
  extendedInsertVenueSchema
} from "@shared/schema";
import { ObjectStorageService, ObjectNotFoundError } from "./objectStorage";
import { uploadImageToSupabase, uploadDocumentToSupabase } from "./supabaseStorage";
import { generateItinerary } from "./openai";
import { calculateBookingCommission, lockCommissionsForExperience, voidCommissionsForExperience } from "./commissionService";

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('Missing required Stripe secret: STRIPE_SECRET_KEY');
}

// ─── Base URL Helper ─────────────────────────────────────────────────────────
// Returns the canonical public URL for the app.
// Priority:
//   1. VITE_APP_BASE_URL env var  (same var used by the Vite client — one source of truth)
//   2. APP_BASE_URL env var       (legacy alias kept for backward compat)
//   3. Derived from the incoming request (works out of the box in dev)
function getAppBaseUrl(req: any): string {
  const env = process.env.VITE_APP_BASE_URL || process.env.APP_BASE_URL;
  if (env && env.trim() !== "") return env.replace(/\/$/, "");
  return `${req.protocol}://${req.get("host")}`;
}

// ─── Lifecycle Status Helper ────────────────────────────────────────────────
// Single source of truth: FORMING → CONFIRMED → CANCELLED
// Uses DB fields only so it works without extra queries.
function computeLifecycleStatus(exp: {
  status: string;
  mvgStatus?: string | null;
  requireMinimumParticipants?: boolean | null;
  mvgMet?: boolean; // optional live-count override
}): 'forming' | 'confirmed' | 'cancelled' {
  const mvgStatus = exp.mvgMet ? 'met' : (exp.mvgStatus || 'pending');
  // Cancelled wins over everything
  if (exp.status === 'cancelled' || mvgStatus === 'failed') return 'cancelled';
  // Confirmed if MVG met or no minimum group required
  if (mvgStatus === 'met' || !exp.requireMinimumParticipants) return 'confirmed';
  // Still forming (MVG enabled, threshold not yet reached)
  return 'forming';
}

// Configure multer for image uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Only allow image MIME types
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, and WebP images are allowed.'));
    }
  }
});

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2025-07-30.basil",
});

// Safe helper function to convert values to ISO strings
function safeToISOString(value: any): string | null {
  if (!value && value !== 0) return null;
  // If already a Date
  if (value instanceof Date && !isNaN(value.getTime())) return value.toISOString();
  // If ISO string or other string/number, try to convert:
  const d = new Date(value);
  if (!isNaN(d.getTime())) return d.toISOString();
  return null; // fallback - not a valid date
}

// Generate URL-friendly slug from venue name and city
function generateVenueSlug(name: string, city: string): string {
  // Combine name and city
  const combined = `${name} ${city}`;
  
  // Convert to lowercase and replace spaces/special chars with hyphens
  const slug = combined
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')  // Replace non-alphanumeric with hyphens
    .replace(/^-+|-+$/g, '')       // Remove leading/trailing hyphens
    .replace(/-+/g, '-');          // Replace multiple hyphens with single
  
  return slug;
}

// Revenue calculation utility
function calculateRoleBasedRevenueBreakdown(
  grossAmount: number, 
  creatorRole: string, 
  options: {
    supportLevel?: string;
    facilitatorServices?: string[];
    influencerRevShare?: number;
    facilitatorBaseCommission?: number;
  } = {}
) {
  const stripeFeeAmount = Math.round(grossAmount * 0.029 + 30); // 2.9% + 30¢
  
  let platformFeePercentage: number;
  let roleDescription: string;
  let supportDescription: string;
  
  if (creatorRole === 'facilitator') {
    // Creator runs the entire experience - pays platform fee + additive services
    // Use additive model to match client-side calculation
    const { facilitatorServices = [], facilitatorBaseCommission = 20 } = options;
    
    let commission = facilitatorBaseCommission;
    const serviceDescriptions: string[] = ['Basic platform (booking, community, payments)'];
    
    // Additive commission calculation (matches client logic)
    if (facilitatorServices.includes('enhanced_support')) {
      commission += 6;
      serviceDescriptions.push('Enhanced support (+6%)');
    }
    if (facilitatorServices.includes('full_service')) {
      commission += 8;
      serviceDescriptions.push('Full service (+8%)');
    }
    if (facilitatorServices.includes('marketing')) {
      commission += 5;
      serviceDescriptions.push('Marketing (+5%)');
    }
    if (facilitatorServices.includes('logistics')) {
      commission += 3;
      serviceDescriptions.push('Logistics (+3%)');
    }
    
    // Cap at 34% to match client
    platformFeePercentage = Math.min(commission, 34);
    roleDescription = 'Experience Facilitator - you run the experience';
    supportDescription = serviceDescriptions.join(', ');
  } else {
    // Creator is network influencer - configurable revenue share
    const { influencerRevShare = 25 } = options;
    platformFeePercentage = 100 - influencerRevShare; // Platform takes remainder
    roleDescription = 'Network Influencer - Great provides facilitator';
    supportDescription = `Great manages all operations, you get ${influencerRevShare}% revenue share`;
  }
  
  // Deduct Stripe fees first (consistent across both models)
  const netAmountAfterStripe = grossAmount - stripeFeeAmount;
  const platformFeeAmount = Math.round(netAmountAfterStripe * (platformFeePercentage / 100));
  const netAmount = netAmountAfterStripe - platformFeeAmount;
  
  return {
    grossAmount,
    platformFeeAmount,
    platformFeePercentage,
    stripeFeeAmount,
    netAmount: Math.max(0, netAmount),
    currency: 'usd',
    creatorRole,
    supportLevel: options.supportLevel || 'custom',
    facilitatorServices: options.facilitatorServices || [],
    influencerRevShare: options.influencerRevShare || 25,
    roleDescription,
    supportDescription,
    feeDescription: `${creatorRole === 'facilitator' ? 'Platform Fee' : 'Revenue Share'} (${platformFeePercentage}%)`
  };
}

// Venue-aware revenue calculation utility for venue partnership scenarios
function calculateVenueSplitRevenueBreakdown(grossAmount: number, venuePercentage: number, creatorPercentage: number, platformPercentage: number) {
  // Validate percentages add up to 100%
  if (Math.abs((venuePercentage + creatorPercentage + platformPercentage) - 100) > 0.01) {
    throw new Error('Venue, creator, and platform percentages must add up to 100%');
  }
  
  // Validate individual percentages
  if (venuePercentage < 0 || venuePercentage > 100 || 
      creatorPercentage < 0 || creatorPercentage > 100 || 
      platformPercentage < 0 || platformPercentage > 100) {
    throw new Error('All percentages must be between 0 and 100');
  }

  // Calculate Stripe fee (2.9% + 30¢) - deducted from gross before splits
  const stripeFeeAmount = Math.round(grossAmount * 0.029 + 30);
  const netAmountAfterStripe = grossAmount - stripeFeeAmount;
  
  // Calculate venue split amounts from the net amount after Stripe fees
  const venueShareAmount = Math.round(netAmountAfterStripe * (venuePercentage / 100));
  const creatorShareAmount = Math.round(netAmountAfterStripe * (creatorPercentage / 100));
  const platformShareAmount = netAmountAfterStripe - venueShareAmount - creatorShareAmount; // Remainder to platform
  
  return {
    grossAmount,
    stripeFeeAmount,
    netAmountAfterStripe,
    venueShareAmount,
    venuePercentage,
    creatorShareAmount,
    creatorPercentage,
    platformShareAmount,
    platformPercentage,
    currency: 'usd',
    breakdown: {
      venue: {
        amount: venueShareAmount,
        percentage: venuePercentage,
        description: `Venue revenue share (${venuePercentage}%)`
      },
      creator: {
        amount: creatorShareAmount,
        percentage: creatorPercentage,
        description: `Creator revenue share (${creatorPercentage}%)`
      },
      platform: {
        amount: platformShareAmount,
        percentage: platformPercentage,
        description: `Platform revenue share (${platformPercentage}%)`
      },
      stripe: {
        amount: stripeFeeAmount,
        description: 'Stripe payment processing fee (2.9% + $0.30)'
      }
    },
    summary: {
      grossRevenue: grossAmount,
      stripeFees: stripeFeeAmount,
      netRevenueAfterStripe: netAmountAfterStripe,
      venueShare: venueShareAmount,
      creatorShare: creatorShareAmount,
      platformShare: platformShareAmount
    }
  };
}

// ─── Admin Auth Helper ────────────────────────────────────────────────────────
// Returns true if the request comes from a user with admin role in the DB.
// Falls back to the bootstrap email so the initial admin never gets locked out.
const BOOTSTRAP_ADMIN_EMAIL = "timtheeuwsen@gmail.com";

async function checkIsAdmin(req: any): Promise<boolean> {
  const email: string | undefined = req.user?.claims?.email;
  const userId: string | undefined = req.user?.claims?.sub;
  if (!userId && !email) return false;
  if (email === BOOTSTRAP_ADMIN_EMAIL) return true;
  if (userId) {
    const dbUser = await storage.getUser(userId);
    if (!dbUser) return false;
    return dbUser.role === 'admin' || (dbUser.userRoles || []).includes('admin');
  }
  return false;
}

export async function registerRoutes(app: Express): Promise<Server> {
  const resolveCurrentUserId = (req: any): string | undefined => {
    return req.user?.claims?.sub || req.user?.id || (process.env.NODE_ENV === 'development' ? "45788955" : undefined);
  };

  const requireParticipantProfileForCommunity = async (req: any, res: any): Promise<string | null> => {
    const userId = resolveCurrentUserId(req);
    if (!userId) {
      res.status(401).json({ message: "Unauthorized" });
      return null;
    }

    const profile = await storage.getProfile(userId);
    if (!profile) {
      res.status(403).json({
        code: "PARTICIPANT_PROFILE_REQUIRED",
        message: "Complete your profile to unlock the Community Hub and join the Tribe Chat.",
      });
      return null;
    }

    return userId;
  };
  // Auth — Supabase JWT-based (stateless, no sessions)
  app.get("/api/login", (_req, res) => {
    res.redirect("/login");
  });
  app.get("/api/logout", (_req, res) => {
    res.redirect("/");
  });

  // Register OG image + social bot prerender routes (must come before Vite catch-all)
  registerOGRoutes(app);

  // Serve hero video with explicit range-request support so browsers can stream it
  app.get('/assets/hero-video.mp4', (req, res) => {
    const videoPath = path.resolve(process.cwd(), 'client/public/assets/hero-video.mp4');
    try {
      const stat = fs.statSync(videoPath);
      const fileSize = stat.size;
      const range = req.headers.range;
      if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunksize = end - start + 1;
        res.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunksize,
          'Content-Type': 'video/mp4',
        });
        fs.createReadStream(videoPath, { start, end }).pipe(res);
      } else {
        res.writeHead(200, {
          'Content-Length': fileSize,
          'Accept-Ranges': 'bytes',
          'Content-Type': 'video/mp4',
        });
        fs.createReadStream(videoPath).pipe(res);
      }
    } catch {
      res.status(404).send('Video not found');
    }
  });

  // Stripe webhook endpoint - must use raw body for signature verification
  app.post('/api/webhooks/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!sig) {
      console.error('No Stripe signature in webhook');
      return res.status(400).send('No signature');
    }

    if (!webhookSecret) {
      console.error('STRIPE_WEBHOOK_SECRET not configured');
      return res.status(500).send('Webhook secret not configured');
    }

    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err: any) {
      console.error('Webhook signature verification failed:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle the event
    try {
      switch (event.type) {
        case 'payment_intent.succeeded': {
          const paymentIntent = event.data.object as Stripe.PaymentIntent;
          console.log(`PaymentIntent ${paymentIntent.id} succeeded`);
          
          // Find booking by payment intent ID
          const booking = await storage.getBookingByPaymentIntent(paymentIntent.id);
          if (booking) {
            // Check if this is a deposit payment or balance payment
            const isBalancePayment = paymentIntent.metadata?.isBalancePayment === 'true';
            
            if (isBalancePayment) {
              // Balance payment succeeded - mark balance as paid
              await storage.updateBookingBalancePaid(booking.id, true);
              console.log(`Balance payment succeeded for booking ${booking.id}`);
            } else {
              // Initial deposit/full payment succeeded - already handled in checkout flow
              console.log(`Deposit/full payment succeeded for booking ${booking.id}`);
            }
          }
          break;
        }

        case 'payment_intent.payment_failed': {
          const paymentIntent = event.data.object as Stripe.PaymentIntent;
          console.log(`PaymentIntent ${paymentIntent.id} failed`);
          
          // Find booking and mark as failed
          const booking = await storage.getBookingByPaymentIntent(paymentIntent.id);
          if (booking) {
            await storage.updateBookingStatus(booking.id, 'failed');
            console.log(`Marked booking ${booking.id} as failed due to payment failure`);
          }
          break;
        }

        case 'charge.refunded': {
          const charge = event.data.object as Stripe.Charge;
          console.log(`Charge ${charge.id} refunded`);
          
          // Find booking by payment intent and mark as refunded
          if (charge.payment_intent) {
            const paymentIntentId = typeof charge.payment_intent === 'string' 
              ? charge.payment_intent 
              : charge.payment_intent.id;
            const booking = await storage.getBookingByPaymentIntent(paymentIntentId);
            if (booking && booking.status !== 'refunded') {
              await storage.updateBookingStatus(booking.id, 'refunded');
              console.log(`Marked booking ${booking.id} as refunded`);
            }
          }
          break;
        }

        default:
          console.log(`Unhandled event type: ${event.type}`);
      }

      res.json({ received: true });
    } catch (error: any) {
      console.error(`Error handling webhook event ${event.type}:`, error);
      res.status(500).json({ error: 'Webhook handler failed' });
    }
  });

  // Check whether a Supabase-authenticated user already has a DB row.
  // Returns { exists: true, user } or { exists: false } — never auto-creates.
  // Used by the signup flow to decide between "new user" and "existing user" paths.
  app.get('/api/auth/user/exists', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const email = req.user.email || req.user.claims.email;
      const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : undefined;
      const user = await storage.getUser(userId) || (normalizedEmail ? await storage.getUserByEmail(normalizedEmail) : undefined);
      res.json({ exists: !!user, user: user ?? null });
    } catch (error) {
      console.error("Error checking user existence:", error);
      res.status(500).json({ message: "Failed to check user" });
    }
  });

  // Auth routes - get (or auto-create) user from database
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const email = req.user.email;
      const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : undefined;
      const metadataRole = typeof req.user.signupRole === 'string' ? req.user.signupRole : undefined;
      const initialRole = metadataRole && metadataRole !== 'admin' && VALID_ROLES.includes(metadataRole)
        ? metadataRole
        : 'participant';

      let user = await storage.getUser(userId);

      if (!user) {
        const existingByEmail = normalizedEmail ? await storage.getUserByEmail(normalizedEmail) : undefined;
        if (existingByEmail) {
          return res.json(existingByEmail);
        }

        // First Supabase login — auto-create DB row with defaults
        user = await storage.upsertUser({
          id: userId,
          email: normalizedEmail,
          firstName: null,
          lastName: null,
          profileImageUrl: null,
          role: initialRole as any,
          userRoles: [initialRole],
        });
      }

      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // ─── Guest Checkout ────────────────────────────────────────────────────────
  // Creates (or finds) a lightweight participant account so unauthenticated
  // visitors can complete a purchase without hitting a hard login wall.
  // The returned { guestUserId, isNew } is used by the checkout flow to
  // associate the booking with the account that was just created/found.
  app.post('/api/auth/guest-checkout', async (req, res) => {
    try {
      const { email, firstName, lastName } = req.body;
      if (!email || typeof email !== 'string') {
        return res.status(400).json({ message: 'Email is required' });
      }
      const normalizedEmail = email.trim().toLowerCase();

      // Look for an existing user with that email
      const existing = await storage.getUserByEmail(normalizedEmail);
      if (existing) {
        // Return the existing account — they can upgrade to a full login later
        return res.json({ guestUserId: existing.id, isNew: false });
      }

      // Programmatically create a guest participant account (no password / Supabase session)
      const guestId = `guest_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      const newUser = await storage.upsertUser({
        id: guestId,
        email: normalizedEmail,
        firstName: firstName?.trim() || null,
        lastName: lastName?.trim() || null,
        profileImageUrl: null,
        role: 'participant',
      });

      return res.json({ guestUserId: newUser.id, isNew: true });
    } catch (error) {
      console.error('Error creating guest account:', error);
      res.status(500).json({ message: 'Failed to create guest account' });
    }
  });

  // Valid roles list including promoter
  const VALID_ROLES = ['participant', 'creator', 'venue_provider', 'service_provider', 'admin', 'promoter'];

  // Role assignment endpoint — users can switch their own role.
  // The 'admin' role can only be assigned by an existing admin.
  app.post('/api/auth/assign-role', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const email = req.user.email || req.user.claims.email;
      const { role } = req.body;
      const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : undefined;

      if (!VALID_ROLES.includes(role)) {
        return res.status(400).json({ message: "Invalid role" });
      }

      // Only admins may assign the admin role
      if (role === 'admin' && !await checkIsAdmin(req)) {
        return res.status(403).json({ message: "Only admins can assign the admin role" });
      }

      // Ensure the DB row exists — on first signup the row hasn't been created yet,
      // so updateUserRole would hit zero rows and silently return undefined.
      const existingByEmail = normalizedEmail ? await storage.getUserByEmail(normalizedEmail) : undefined;
      if (existingByEmail && existingByEmail.id !== userId) {
        return res.status(409).json({ message: "This email already exists" });
      }

      const existing = await storage.getUser(userId);
      if (!existing) {
        await storage.upsertUser({
          id: userId,
          email: normalizedEmail,
          firstName: null,
          lastName: null,
          profileImageUrl: null,
          role: role as any,
          userRoles: [role],
        });
      }

      // Update active role and ensure it's in the userRoles array
      const updatedUser = await storage.updateUserRole(userId, role);

      // Add selected role to userRoles if not already present (multi-role support)
      const currentRoles = updatedUser.userRoles || [];
      if (!currentRoles.includes(role)) {
        await storage.addUserRole(userId, role);
      }

      // Participants automatically get the promoter role so they can
      // share referral links and earn commission from day one.
      if (role === 'participant') {
        await storage.ensureUserReferralCode(userId);
      }

      res.json({ message: "Role updated successfully", user: updatedUser });
    } catch (error) {
      console.error("Error updating user role:", error);
      res.status(500).json({ message: "Failed to update role" });
    }
  });

  // Add a role to the user's userRoles array WITHOUT changing their active role.
  // Used when a user signs up a second time with the same email but a different role —
  // their current active role is preserved; the new role is simply added to their
  // collection so they can switch to it via the role switcher in the nav menu.
  app.post('/api/auth/add-role', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const email = req.user.email || req.user.claims.email;
      const { role } = req.body;
      const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : undefined;

      if (!VALID_ROLES.includes(role)) {
        return res.status(400).json({ message: 'Invalid role' });
      }
      if (role === 'admin' && !await checkIsAdmin(req)) {
        return res.status(403).json({ message: 'Only admins can assign the admin role' });
      }

      return res.status(409).json({ message: 'This email already exists' });

      const user = await storage.getUser(userId) || (normalizedEmail ? await storage.getUserByEmail(normalizedEmail) : undefined);
      const currentRoles: string[] = (user?.userRoles as unknown as string[]) || [];

      if (!user) {
        const newUser = await storage.upsertUser({
          id: userId,
          email: normalizedEmail,
          firstName: null,
          lastName: null,
          profileImageUrl: null,
          role,
          userRoles: [role],
        });
        return res.json({ message: 'Role added successfully', user: newUser });
      }

      if (user.role === role || currentRoles.includes(role)) {
        // Already has this role — nothing to do
        return res.status(409).json({ message: 'User with that role already exists', user });
      }

      // Only add to userRoles — do NOT touch the active role field
      await storage.addUserRole(user.id, role);

      // Auto-generate a referral code when promoter role is added
      if (role === 'promoter' || role === 'participant') {
        await storage.ensureUserReferralCode(user.id);
      }

      const updatedUser = await storage.getUser(user.id);
      res.json({ message: 'Role added successfully', user: updatedUser });
    } catch (error) {
      console.error('Error adding role:', error);
      res.status(500).json({ message: 'Failed to add role' });
    }
  });

  // Admin-only: promote another user to admin (or any role)
  app.post('/api/admin/users/:userId/assign-role', isAuthenticated, async (req: any, res) => {
    try {
      if (!await checkIsAdmin(req)) {
        return res.status(403).json({ message: "Admin access required" });
      }
      const { userId } = req.params;
      const { role } = req.body;
      if (!VALID_ROLES.includes(role)) {
        return res.status(400).json({ message: "Invalid role" });
      }
      const updatedUser = await storage.updateUserRole(userId, role);
      const currentRoles = updatedUser.userRoles || [];
      if (!currentRoles.includes(role)) {
        await storage.addUserRole(userId, role);
      }
      res.json({ message: "Role assigned successfully", user: updatedUser });
    } catch (error) {
      console.error("Error assigning role:", error);
      res.status(500).json({ message: "Failed to assign role" });
    }
  });

  // Get user's available roles (for role switcher)
  app.get('/api/auth/user-roles', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Return both active role and all available roles
      res.json({
        activeRole: user.role,
        userRoles: user.userRoles || [],
        // All users can switch to participant; other roles depend on what they've enabled
        availableRoles: ['participant', ...(user.userRoles || []).filter((r: string) => r !== 'participant')]
      });
    } catch (error) {
      console.error("Error fetching user roles:", error);
      res.status(500).json({ message: "Failed to fetch user roles" });
    }
  });

  // ========== PROMOTER ATTRIBUTION ENDPOINTS ==========
  
  // Look up promoter by referral code (public - rate limit recommended in production)
  app.get('/api/promoters/by-code/:code', async (req, res) => {
    try {
      const { code } = req.params;
      if (!code || code.length < 3) {
        return res.status(400).json({ message: "Invalid referral code" });
      }
      
      const promoter = await storage.getUserByPromoterCode(code);
      if (!promoter) {
        return res.status(404).json({ message: "Referral code not found" });
      }
      
      // Return only minimal info - no PII
      res.json({
        promoterId: promoter.id,
        valid: true
      });
    } catch (error) {
      console.error("Error looking up promoter:", error);
      res.status(500).json({ message: "Failed to look up promoter" });
    }
  });

  // Store promoter attribution in cookie (called when user visits with ?ref=)
  app.post('/api/promoter-attribution', async (req: any, res) => {
    try {
      const { referralCode, experienceId } = req.body;
      if (!referralCode || referralCode.length < 3) {
        return res.status(400).json({ message: "Invalid referral code" });
      }

      // Validate the referral code exists
      const promoter = await storage.getUserByPromoterCode(referralCode);
      if (!promoter) {
        return res.status(404).json({ message: "Referral code not found" });
      }

      // ── Record the referral click ─────────────────────────────────────────
      const visitorUserId = req.user?.claims?.sub ?? null;
      // Hash the IP so we can deduplicate without storing PII
      const rawIp = req.headers['x-forwarded-for']?.toString().split(',')[0] || req.socket.remoteAddress || '';
      const crypto = await import('crypto');
      const ipHash = crypto.createHash('sha256').update(rawIp).digest('hex').slice(0, 16);

      await storage.recordReferralClick({
        promoterCode: referralCode,
        promoterId: promoter.id,
        experienceId: experienceId ?? null,
        visitorUserId,
        ipHash,
        userAgent: req.headers['user-agent'] ?? null,
      });

      // Set HttpOnly cookie with promoter info (survives auth redirect)
      const cookieValue = JSON.stringify({
        promoterId: promoter.id,
        referralCode,
        timestamp: Date.now()
      });

      res.cookie('promoter_ref', cookieValue, {
        httpOnly: true,
        secure: process.env.NODE_ENV !== 'development',
        sameSite: 'lax',
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
        signed: false
      });

      res.json({ success: true, promoterId: promoter.id });
    } catch (error) {
      console.error("Error storing promoter attribution:", error);
      res.status(500).json({ message: "Failed to store attribution" });
    }
  });

  // Persist promoter referrer to user record (called after login)
  app.post('/api/auth/set-referrer', isAuthenticated, async (req: any, res) => {
    try {
      const userId = process.env.NODE_ENV === 'development' ? "45788955" : req.user?.claims?.sub;
      const { promoterId, referralCode } = req.body;
      
      // Check if user already has a referrer (don't override)
      const user = await storage.getUser(userId);
      if (user?.referredByPromoterId) {
        return res.json({ 
          message: "Referrer already set",
          referredByPromoterId: user.referredByPromoterId
        });
      }
      
      // Validate promoter exists
      let validPromoterId = promoterId;
      if (!validPromoterId && referralCode) {
        const promoter = await storage.getUserByPromoterCode(referralCode);
        validPromoterId = promoter?.id;
      }
      
      if (!validPromoterId) {
        return res.status(400).json({ message: "Invalid promoter" });
      }
      
      // Persist referrer to user record
      const updatedUser = await storage.setUserReferrer(userId, validPromoterId);
      
      // Clear the cookie now that we've persisted
      res.clearCookie('promoter_ref');
      
      res.json({
        success: true,
        referredByPromoterId: updatedUser.referredByPromoterId
      });
    } catch (error) {
      console.error("Error setting referrer:", error);
      res.status(500).json({ message: "Failed to set referrer" });
    }
  });

  // Ensure the logged-in user has a referral code (auto-generates one if needed).
  // Also auto-registers the experience in promoterExperiences so "My Trips" is populated
  // for participants who share from the experience page (not just the experience pool).
  app.post('/api/me/ensure-referral-code', isAuthenticated, async (req: any, res) => {
    try {
      const userId = process.env.NODE_ENV === 'development' ? "45788955" : req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });

      const { experienceId } = req.body;

      const referralCode = await storage.ensureUserReferralCode(userId);

      // Use the actual request host so the link works in dev AND production
      const baseUrl = getAppBaseUrl(req);
      let referralLink: string;
      if (experienceId) {
        referralLink = `${baseUrl}/experience/${experienceId}?ref=${referralCode}`;

        // Auto-register this experience in the user's promoter list so their
        // "My Trips" section shows it even if they found it via the experience page
        // (not the experience pool). Idempotent — onConflictDoNothing inside.
        try {
          const experience = await storage.getExperience(experienceId);
          if (experience && (experience.status === 'approved' || experience.status === 'published')) {
            await storage.promoteExperience(userId, experienceId);
          }
        } catch (_) { /* non-fatal */ }
      } else {
        referralLink = `${baseUrl}/?ref=${referralCode}`;
      }

      res.json({ referralCode, referralLink });
    } catch (error) {
      console.error("Error ensuring referral code:", error);
      res.status(500).json({ message: "Failed to generate referral code" });
    }
  });

  // Get impact stats for any authenticated user (no promoter role required)
  // Powers the My Impact page recruitment stats + gamification
  app.get('/api/me/impact-stats', isAuthenticated, async (req: any, res) => {
    try {
      const userId = process.env.NODE_ENV === 'development' ? "45788955" : req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });

      // Ensure user has a referral code (auto-generates if missing)
      const referralCode = await storage.ensureUserReferralCode(userId);

      // Count all bookings attributed to this user as promoter
      const promoterBookings = await db
        .select()
        .from(bookings)
        .where(eq(bookings.promoterId, userId));

      const friendsJoined = promoterBookings.length;

      // Sum commissions (estimated + locked — not voided)
      let tripCreditsEarned = 0;
      for (const b of promoterBookings) {
        const status = b.commissionStatus;
        if (status === 'estimated' || status === 'locked') {
          tripCreditsEarned += parseFloat(b.commissionAmount || '0');
        }
      }

      // Most recent experience for share CTA (from latest booking or promoted experiences)
      let shareExperience: any = null;
      if (promoterBookings.length > 0) {
        const sorted = [...promoterBookings].sort((a, b) =>
          new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
        );
        const recentExpId = sorted[0].experienceId;
        const exp = await storage.getExperience(recentExpId);
        if (exp) {
          shareExperience = {
            id: exp.id,
            title: exp.title,
            location: exp.location,
            coverImageUrl: exp.coverImageUrl,
            lifecycleStatus: exp.status,
            currency: exp.currency,
          };
        }
      }

      // Use real click data from referralClicks table
      const clickStats = await storage.getReferralClickStats(userId);

      res.json({
        referralCode,
        friendsJoined,
        peopleInvited: clickStats.totalClicks,   // real: every click on their referral link
        uniqueVisitors: clickStats.uniqueClicks,
        conversionRate: clickStats.conversionRate,
        tripCreditsEarned,
        shareExperience,
      });
    } catch (error) {
      console.error("Error fetching impact stats:", error);
      res.status(500).json({ message: "Failed to fetch impact stats" });
    }
  });

  // ===== PROMOTER DASHBOARD ROUTES (Read-Only) =====
  // Helper: resolve userId with dev bypass + verify promoter access
  const resolvePromoterUserId = async (req: any, res: any): Promise<string | null> => {
    const userId = process.env.NODE_ENV === 'development' ? '45788955' : req.user?.claims?.sub;
    if (!userId) { res.status(401).json({ message: 'Not authenticated' }); return null; }
    const user = await storage.getUser(userId);
    // All participants automatically have promoter in userRoles — accept both
    const ok = user?.role === 'promoter' || user?.role === 'participant' ||
                (user?.userRoles || []).includes('promoter') ||
                (user?.userRoles || []).includes('participant');
    if (!ok) { res.status(403).json({ message: 'Access denied' }); return null; }
    return userId;
  };

  // Get promoter earnings summary
  app.get('/api/promoter/earnings', isAuthenticated, async (req: any, res) => {
    try {
      const userId = await resolvePromoterUserId(req, res);
      if (!userId) return;
      const summary = await storage.getPromoterEarningsSummary(userId);
      res.json(summary);
    } catch (error) {
      console.error("Error fetching promoter earnings:", error);
      res.status(500).json({ message: "Failed to fetch earnings" });
    }
  });

  // Get experiences promoted by this promoter
  app.get('/api/promoter/experiences', isAuthenticated, async (req: any, res) => {
    try {
      const userId = await resolvePromoterUserId(req, res);
      if (!userId) return;
      
      const experiences = await storage.getPromoterExperiences(userId);
      // Add lifecycleStatus to each promoted experience
      const enriched = (experiences || []).map((item: any) => {
        if (item.experience) {
          return {
            ...item,
            experience: {
              ...item.experience,
              lifecycleStatus: computeLifecycleStatus({
                status: item.experience.status || '',
                mvgStatus: item.experience.mvgStatus,
                requireMinimumParticipants: item.experience.requireMinimumParticipants,
              }),
            },
          };
        }
        return {
          ...item,
          lifecycleStatus: computeLifecycleStatus({
            status: item.status || '',
            mvgStatus: item.mvgStatus,
            requireMinimumParticipants: item.requireMinimumParticipants,
          }),
        };
      });
      res.json(enriched);
    } catch (error) {
      console.error("Error fetching promoted experiences:", error);
      res.status(500).json({ message: "Failed to fetch promoted experiences" });
    }
  });

  // Get detailed bookings for promoter
  app.get('/api/promoter/bookings', isAuthenticated, async (req: any, res) => {
    try {
      const userId = await resolvePromoterUserId(req, res);
      if (!userId) return;
      
      const bookings = await storage.getPromoterBookings(userId);
      
      // Enrich with experience info
      const enrichedBookings = await Promise.all(
        bookings.map(async (booking) => {
          const experience = await storage.getExperience(booking.experienceId);
          return {
            ...booking,
            experienceName: experience?.title || 'Unknown Experience',
            experienceSlug: experience?.slug,
          };
        })
      );
      
      res.json(enrichedBookings);
    } catch (error) {
      console.error("Error fetching promoter bookings:", error);
      res.status(500).json({ message: "Failed to fetch bookings" });
    }
  });

  // Get promoter's referral code and info
  app.get('/api/promoter/info', isAuthenticated, async (req: any, res) => {
    try {
      const userId = process.env.NODE_ENV === 'development' ? '45788955' : req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      // Auto-ensure referral code exists
      const referralCode = user?.promoterCode || await storage.ensureUserReferralCode(userId);
      res.json({
        promoterCode: referralCode,
        firstName: user?.firstName,
        lastName: user?.lastName,
      });
    } catch (error) {
      console.error("Error fetching promoter info:", error);
      res.status(500).json({ message: "Failed to fetch promoter info" });
    }
  });

  app.get('/api/promoter-profile', isAuthenticated, async (req: any, res) => {
    try {
      const userId = resolveCurrentUserId(req);
      if (!userId) return res.status(401).json({ message: "Not authenticated" });

      const profile = await storage.getPromoterProfile(userId);
      if (!profile) {
        return res.status(404).json({ message: "Promoter profile not found" });
      }

      res.json(profile);
    } catch (error) {
      console.error("Error fetching promoter profile:", error);
      res.status(500).json({ message: "Failed to fetch promoter profile" });
    }
  });

  app.post('/api/promoter-profile', isAuthenticated, async (req: any, res) => {
    try {
      const userId = resolveCurrentUserId(req);
      if (!userId) return res.status(401).json({ message: "Not authenticated" });

      const validation = insertPromoterProfileSchema.safeParse({
        ...req.body,
        completed: true,
      });
      if (!validation.success) {
        return res.status(400).json({
          message: "Invalid promoter profile data",
          errors: validation.error.issues,
        });
      }

      const profile = await storage.createOrUpdatePromoterProfile(userId, validation.data);
      res.json(profile);
    } catch (error) {
      console.error("Error saving promoter profile:", error);
      res.status(500).json({ message: "Failed to save promoter profile" });
    }
  });

  app.get('/api/promoter-profile/by-code/:code', async (req, res) => {
    try {
      const { code } = req.params;
      if (!code || code.length < 3) {
        return res.status(400).json({ message: "Invalid referral code" });
      }

      const promoter = await storage.getUserByPromoterCode(code);
      if (!promoter) {
        return res.status(404).json({ message: "Referral code not found" });
      }

      const profile = await storage.getPromoterProfileByUserId(promoter.id);
      const fallbackName = `${promoter.firstName || ""} ${promoter.lastName || ""}`.trim();

      res.json({
        promoterId: promoter.id,
        referralCode: promoter.promoterCode,
        displayName: profile?.displayName || fallbackName || "Great promoter",
        profilePhoto: profile?.profilePhoto || promoter.profileImageUrl || null,
        bio: profile?.bio || null,
        completed: !!profile?.completed,
      });
    } catch (error) {
      console.error("Error fetching public promoter profile:", error);
      res.status(500).json({ message: "Failed to fetch promoter profile" });
    }
  });

  // Promoter click-through stats (clicks, unique visitors, conversions, rate)
  app.get('/api/promoter/click-stats', isAuthenticated, async (req: any, res) => {
    try {
      const userId = process.env.NODE_ENV === 'development' ? '45788955' : req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const stats = await storage.getReferralClickStats(userId);
      res.json(stats);
    } catch (error) {
      console.error("Error fetching click stats:", error);
      res.status(500).json({ message: "Failed to fetch click stats" });
    }
  });

  // Get experience pool - promotable experiences (open to all authenticated users)
  app.get('/api/promoter/experience-pool', isAuthenticated, async (req: any, res) => {
    try {
      const userId = process.env.NODE_ENV === 'development' ? '45788955' : req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      
      // Get all promotable experiences
      const experiences = await storage.getPromotableExperiences();
      
      // Get which ones this promoter is already promoting
      const promotedIds = await storage.getPromoterPromotedExperienceIds(userId);
      
      // Enrich with promotion status and lifecycle state (single source of truth)
      const enrichedExperiences = experiences.map(exp => ({
        ...exp,
        isPromoting: promotedIds.includes(exp.id),
        lifecycleStatus: computeLifecycleStatus({
          status: exp.status || '',
          mvgStatus: exp.mvgStatus,
          requireMinimumParticipants: exp.requireMinimumParticipants,
        }),
      }));
      
      res.json(enrichedExperiences);
    } catch (error) {
      console.error("Error fetching experience pool:", error);
      res.status(500).json({ message: "Failed to fetch experience pool" });
    }
  });

  // Promote an experience - generate referral link
  app.post('/api/promoter/promote/:experienceId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      
      const { experienceId } = req.params;
      
      // Verify the experience exists and is promotable (approved/published status only)
      const experience = await storage.getExperience(experienceId);
      if (!experience) {
        return res.status(404).json({ message: "Experience not found" });
      }
      
      // Any approved or published experience can be promoted (matches homepage visibility)
      if (experience.status !== 'approved' && experience.status !== 'published') {
        return res.status(400).json({ message: "Only approved or published experiences can be promoted" });
      }
      
      // Load promoter's DB record to get (or generate) their referral code
      let dbUser = await storage.getUser(userId);
      if (!dbUser) {
        return res.status(404).json({ message: "User not found" });
      }

      // Ensure the user has a referral code — generate one if missing
      if (!dbUser.promoterCode) {
        await storage.ensureUserReferralCode(userId);
        dbUser = await storage.getUser(userId);
      }

      // Register promotion (idempotent — onConflictDoNothing inside)
      await storage.promoteExperience(userId, experienceId);

      // Build a fully-qualified, trackable referral link
      const baseUrl = getAppBaseUrl(req);
      const slug = experience.slug || experience.id;
      const promoterCode = dbUser?.promoterCode ?? '';
      const referralLink = `${baseUrl}/experience/${slug}?ref=${promoterCode}`;

      res.json({
        success: true,
        experienceId,
        experienceSlug: slug,
        promoterCode,
        referralLink,
        message: "Experience added to your promotions!",
      });
    } catch (error) {
      console.error("Error promoting experience:", error);
      res.status(500).json({ message: "Failed to promote experience" });
    }
  });

  // Experience draft routes
  app.get('/api/experience-drafts', async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const drafts = await storage.getExperienceDraftsByCreator(userId);
      res.json(drafts);
    } catch (error) {
      console.error("Error fetching experience drafts:", error);
      res.status(500).json({ message: "Failed to fetch drafts" });
    }
  });

  app.post('/api/experience-drafts', async (req: any, res) => {
    try {
      const userId = process.env.NODE_ENV === 'development' ? "45788955" : req.user.claims.sub;
      
      // Normalize date fields before saving (defense in depth)
      const parsedBody = { ...req.body };
      
      // Convert date strings to valid Date objects or null if invalid
      if (parsedBody.startDate) {
        const date = new Date(parsedBody.startDate);
        parsedBody.startDate = !isNaN(date.getTime()) ? date : null;
      }
      if (parsedBody.endDate) {
        const date = new Date(parsedBody.endDate);
        parsedBody.endDate = !isNaN(date.getTime()) ? date : null;
      }
      if (parsedBody.mvgDeadline) {
        const date = new Date(parsedBody.mvgDeadline);
        parsedBody.mvgDeadline = !isNaN(date.getTime()) ? date : null;
      }
      
      const draftData = { ...parsedBody, creatorId: userId };
      const draft = await storage.createExperienceDraft(draftData);
      res.json(draft);
    } catch (error) {
      console.error("Error creating experience draft:", error);
      res.status(500).json({ message: "Failed to create draft" });
    }
  });

  app.put('/api/experience-drafts/:id', async (req: any, res) => {
    try {
      const userId = process.env.NODE_ENV === 'development' ? "45788955" : req.user.claims.sub;
      const { id } = req.params;
      console.log("Updating draft:", id, "for user:", userId);
      
      // Remove fields that should not be updated by client
      const { id: _id, creatorId: _creatorId, createdAt: _createdAt, updatedAt: _updatedAt, ...cleanBody } = req.body;
      
      // Normalize date fields before saving (defense in depth)
      const updateData = { ...cleanBody };
      
      // Convert date strings to valid Date objects or null if invalid
      if (updateData.startDate !== undefined) {
        if (updateData.startDate === null || updateData.startDate === '') {
          updateData.startDate = null;
        } else {
          const date = new Date(updateData.startDate);
          updateData.startDate = !isNaN(date.getTime()) ? date : null;
        }
      }
      if (updateData.endDate !== undefined) {
        if (updateData.endDate === null || updateData.endDate === '') {
          updateData.endDate = null;
        } else {
          const date = new Date(updateData.endDate);
          updateData.endDate = !isNaN(date.getTime()) ? date : null;
        }
      }
      if (updateData.mvgDeadline !== undefined) {
        if (updateData.mvgDeadline === null || updateData.mvgDeadline === '') {
          updateData.mvgDeadline = null;
        } else {
          const date = new Date(updateData.mvgDeadline);
          updateData.mvgDeadline = !isNaN(date.getTime()) ? date : null;
        }
      }
      
      const draft = await storage.updateExperienceDraft(id, userId, updateData);
      res.json(draft);
    } catch (error) {
      console.error("Error updating experience draft:", error);
      res.status(500).json({ message: "Failed to update draft" });
    }
  });

  app.delete('/api/experience-drafts/:id', async (req: any, res) => {
    try {
      const userId = process.env.NODE_ENV === 'development' ? "45788955" : req.user.claims.sub;
      const { id } = req.params;
      await storage.deleteExperienceDraft(id, userId);
      res.json({ message: "Draft deleted" });
    } catch (error) {
      console.error("Error deleting experience draft:", error);
      res.status(500).json({ message: "Failed to delete draft" });
    }
  });

  // Get latest draft for user
  app.get('/api/experience-drafts/latest', async (req: any, res) => {
    try {
      const userId = process.env.NODE_ENV === 'development' ? "45788955" : req.user.claims.sub;
      const drafts = await storage.getExperienceDraftsByCreator(userId);
      const latest = drafts.sort((a, b) => {
        const bDate = b.updatedAt || b.createdAt;
        const aDate = a.updatedAt || a.createdAt;
        if (!bDate || !aDate) return 0;
        return new Date(bDate).getTime() - new Date(aDate).getTime();
      })[0];
      res.json(latest || null);
    } catch (error) {
      console.error("Error fetching latest draft:", error);
      res.status(500).json({ message: "Failed to get latest draft" });
    }
  });

  // Get specific draft by ID
  app.get('/api/experience-drafts/:id', async (req: any, res) => {
    try {
      const userId = process.env.NODE_ENV === 'development' ? "45788955" : req.user.claims.sub;
      const { id } = req.params;
      const draft = await storage.getExperienceDraftById(id);
      
      if (!draft) {
        return res.status(404).json({ message: "Draft not found" });
      }
      
      // Verify ownership
      if (draft.creatorId !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      res.json(draft);
    } catch (error) {
      console.error("Error fetching draft:", error);
      res.status(500).json({ message: "Failed to fetch draft" });
    }
  });

  // Delete all user drafts
  app.delete('/api/experience-drafts', async (req: any, res) => {
    try {
      const userId = process.env.NODE_ENV === 'development' ? "45788955" : req.user.claims.sub;
      const drafts = await storage.getExperienceDraftsByCreator(userId);
      for (const draft of drafts) {
        await storage.deleteExperienceDraft(draft.id, userId);
      }
      res.json({ message: "All drafts deleted" });
    } catch (error) {
      console.error("Error deleting drafts:", error);
      res.status(500).json({ message: "Failed to delete drafts" });
    }
  });

  // Field name mapping: frontend → backend database columns
  const mapFrontendFieldsToDB = (data: any) => {
    const mapped = { ...data };
    // Map frontend field names to database column names
    if ('type' in mapped) {
      mapped.type = data.type; // Keep as 'type' for drafts, will be mapped to 'experienceType' on publish
    }
    if ('selectedVenueId' in mapped) {
      mapped.selectedVenueId = data.selectedVenueId; // Keep as 'selectedVenueId' for drafts, will be mapped to 'linkedVenueId' on publish
    }
    return mapped;
  };

  // Save Draft API endpoint - Creates new draft with incomplete data
  app.post('/api/events/saveDraft', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      console.log("Creating new draft for user:", userId);
      console.log("Draft data received:", req.body);
      
      // Normalize date fields before validation
      const parsedBody = { ...req.body };
      
      // Convert date strings to valid Date objects or null if invalid
      if (parsedBody.startDate) {
        const date = new Date(parsedBody.startDate);
        parsedBody.startDate = !isNaN(date.getTime()) ? date : null;
      }
      if (parsedBody.endDate) {
        const date = new Date(parsedBody.endDate);
        parsedBody.endDate = !isNaN(date.getTime()) ? date : null;
      }
      if (parsedBody.mvgDeadline) {
        const date = new Date(parsedBody.mvgDeadline);
        parsedBody.mvgDeadline = !isNaN(date.getTime()) ? date : null;
      }

      // Map frontend field names to backend
      const mappedBody = mapFrontendFieldsToDB(parsedBody);

      // Validate draft data using Zod schema
      const validationResult = insertExperienceDraftSchema.safeParse(mappedBody);
      
      if (!validationResult.success) {
        const errors = validationResult.error.errors.map(err => `${err.path.join('.')}: ${err.message}`);
        console.error("Draft validation failed:", errors);
        return res.status(400).json({ 
          success: false,
          message: "Validation failed",
          errors,
          details: validationResult.error.issues
        });
      }

      const draftData: any = { 
        ...validationResult.data,
        // Convert types to match database schema
        price: validationResult.data.price?.toString(),
        creatorId: userId,
        status: 'draft' as const,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      // Always create new draft - don't update existing ones here
      const result = await storage.createExperienceDraft(draftData);
      
      res.json({ 
        success: true, 
        message: "Draft saved successfully",
        draft: result 
      });
    } catch (error: any) {
      console.error("Error saving draft:", error);
      res.status(500).json({ 
        success: false,
        message: "Failed to save draft", 
        error: error?.message || "Unknown error" 
      });
    }
  });

  // Update Draft API endpoint - Updates existing draft until published
  app.put('/api/events/updateDraft/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const draftId = req.params.id;
      console.log("Updating draft:", draftId, "for user:", userId);
      console.log("Update data received:", req.body);
      
      // Only allow updates if status is still 'draft'
      const existingDraft = await storage.getExperienceDraft(draftId, userId);
      if (!existingDraft) {
        return res.status(404).json({ 
          success: false,
          message: "Draft not found" 
        });
      }
      
      if (existingDraft.status !== 'draft') {
        return res.status(400).json({ 
          success: false,
          message: "Cannot update draft - already published or pending review" 
        });
      }
      
      // Normalize date fields before validation
      const parsedBody = { ...req.body };
      
      // Convert date strings to valid Date objects or null if invalid
      if (parsedBody.startDate) {
        const date = new Date(parsedBody.startDate);
        parsedBody.startDate = !isNaN(date.getTime()) ? date : null;
      }
      if (parsedBody.endDate) {
        const date = new Date(parsedBody.endDate);
        parsedBody.endDate = !isNaN(date.getTime()) ? date : null;
      }
      if (parsedBody.mvgDeadline) {
        const date = new Date(parsedBody.mvgDeadline);
        parsedBody.mvgDeadline = !isNaN(date.getTime()) ? date : null;
      }

      // Map frontend field names to backend
      const mappedBody = mapFrontendFieldsToDB(parsedBody);

      // Validate update data using Zod schema (partial validation for updates)
      const validationResult = insertExperienceDraftSchema.partial().safeParse(mappedBody);
      
      if (!validationResult.success) {
        const errors = validationResult.error.errors.map(err => `${err.path.join('.')}: ${err.message}`);
        console.error("Draft update validation failed:", errors);
        return res.status(400).json({ 
          success: false,
          message: "Validation failed",
          errors,
          details: validationResult.error.issues
        });
      }

      const updateData: any = { 
        ...validationResult.data,
        // Convert types to match database schema
        price: validationResult.data.price?.toString(),
        creatorId: userId,
        status: 'draft' as const,
        updatedAt: new Date()
      };
      
      const result = await storage.updateExperienceDraft(draftId, userId, updateData);
      
      res.json({ 
        success: true, 
        message: "Draft updated successfully",
        draft: result 
      });
    } catch (error: any) {
      console.error("Error updating draft:", error);
      res.status(500).json({ 
        success: false,
        message: "Failed to update draft", 
        error: error?.message || "Unknown error" 
      });
    }
  });

  // Publish Event API endpoint - Finalizes draft and sets to pending
  app.post('/api/events/publishEvent/:id', async (req: any, res) => {
    try {
      const userId = process.env.NODE_ENV === 'development' ? "45788955" : req.user.claims.sub;
      const draftId = req.params.id;
      console.log("Publishing event:", draftId, "for user:", userId);
      console.log("Event data received:", req.body);
      
      // Verify draft exists and belongs to user
      const existingDraft = await storage.getExperienceDraft(draftId, userId);
      if (!existingDraft) {
        return res.status(404).json({ 
          success: false,
          message: "Draft not found" 
        });
      }
      
      // Validate required fields for publishing
      const errors: string[] = [];
      
      // Check if this is a demo event (bypass validation for demos)
      const isDemoEvent = req.body.title?.toLowerCase().includes('mystic') && 
                         req.body.title?.toLowerCase().includes('marrakesh');
      
      // Required: Cover photo
      if (!isDemoEvent) {
        if (!req.body.coverImageUrl || req.body.coverImageUrl.trim() === '') {
          errors.push("Cover photo is required and must be uploaded");
        } else {
          // Validate URL format
          try {
            const url = new URL(req.body.coverImageUrl);
            const allowedProtocols = ['https:', 'http:', 'blob:', 'data:'];
            if (!allowedProtocols.includes(url.protocol)) {
              errors.push("Cover photo must use a valid URL");
            }
          } catch {
            errors.push("Cover photo must be a valid URL");
          }
        }
      }
      
      // Required: Title
      if (!req.body.title || req.body.title.trim() === '') {
        errors.push("Title is required");
      }
      
      // Required: Description
      if (!req.body.description || req.body.description.trim() === '') {
        errors.push("Description is required");
      }
      
      // Required: Start date
      if (!req.body.startDate) {
        errors.push("Start date is required");
      } else {
        // Validate date format
        try {
          const startDate = new Date(req.body.startDate);
          if (isNaN(startDate.getTime())) {
            errors.push("Invalid start date format");
          } else if (startDate < new Date()) {
            errors.push("Start date must be in the future");
          }
        } catch {
          errors.push("Invalid start date");
        }
      }
      
      // Required: Location
      if (!req.body.location || req.body.location.trim() === '') {
        errors.push("Location is required");
      }
      
      // Venue validation
      const venueType = req.body.venueType || 'catalog';
      if (venueType === 'catalog') {
        if (!req.body.selectedVenueId || req.body.selectedVenueId.trim() === '') {
          errors.push("Please select a venue from the catalog");
        }
      } else if (venueType === 'manual') {
        if (!req.body.manualVenueName || req.body.manualVenueName.trim() === '') {
          errors.push("Manual venue name is required");
        }
        if (!req.body.manualVenueAddress || req.body.manualVenueAddress.trim() === '') {
          errors.push("Manual venue address is required");
        }
      } else if (venueType === 'virtual') {
        if (!req.body.virtualPlatform || req.body.virtualPlatform.trim() === '') {
          errors.push("Virtual platform is required");
        }
      }
      
      // Pricing validation - conditional logic based on rooms
      const rooms = req.body.rooms || [];
      const hasRooms = rooms.length > 0;
      
      if (hasRooms) {
        // If rooms exist, validate all rooms have valid pricing
        const invalidRooms = rooms.filter((room: any) => !room.pricePerPerson || parseFloat(room.pricePerPerson) <= 0);
        if (invalidRooms.length > 0) {
          errors.push("All rooms must have a price per person greater than 0");
        }
      } else {
        // If no rooms, require base price
        if (!req.body.price || req.body.price === '' || parseFloat(req.body.price) <= 0) {
          errors.push("Base price is required and must be greater than 0");
        }
      }
      
      // Required: Terms acceptance
      if (!req.body.termsAccepted) {
        errors.push("Terms and conditions must be accepted");
      }
      
      // If there are validation errors, return them
      if (errors.length > 0) {
        return res.status(400).json({ 
          success: false,
          message: "Validation failed", 
          errors: errors
        });
      }
      
      // Normalize date fields before saving (defense in depth)
      const parsedBody = { ...req.body };
      
      // Convert date strings to valid Date objects or null if invalid
      if (parsedBody.startDate) {
        const date = new Date(parsedBody.startDate);
        parsedBody.startDate = !isNaN(date.getTime()) ? date : null;
      }
      if (parsedBody.endDate) {
        const date = new Date(parsedBody.endDate);
        parsedBody.endDate = !isNaN(date.getTime()) ? date : null;
      }
      if (parsedBody.mvgDeadline) {
        const date = new Date(parsedBody.mvgDeadline);
        parsedBody.mvgDeadline = !isNaN(date.getTime()) ? date : null;
      }

      // ── Self-Hosted / Manual Address logic ──────────────────────────────────
      // When no platform Space is linked (venueType = 'manual' or selectedVenueId is blank),
      // the creator is bringing their own venue.
      // Force venueRevenuePercentage → 0 and give that % back to the creator.
      const isLinkedVenue = !!(parsedBody.selectedVenueId && parsedBody.selectedVenueId.trim() !== '');
      const platformPctRaw = parseFloat(String(parsedBody.platformPct ?? parsedBody.platformRevenuePercentage ?? 15));
      const venuePctRaw    = isLinkedVenue ? parseFloat(String(parsedBody.venueRevenuePercentage ?? 0)) : 0;
      const creatorPctRaw  = Math.max(0, 100 - platformPctRaw - venuePctRaw);

      // Prepare final event data - lock required fields
      const eventData = {
        ...parsedBody,
        creatorId: userId,
        status: 'pending_approval',
        publishedAt: new Date(),
        updatedAt: new Date(),
        locked: true, // Indicate this is locked for changes
        // Apply resolved revenue split (self-hosted gets 0% venue, rest to creator)
        venueRevenuePercentage: isLinkedVenue ? String(venuePctRaw) : '0.00',
        creatorPct: creatorPctRaw,
        creatorRevenuePercentage: creatorPctRaw,
        platformPct: platformPctRaw,
        platformRevenuePercentage: platformPctRaw,
      };
      
      // Update draft to pending status (finalizes it)
      const result = await storage.updateExperienceDraft(draftId, userId, eventData);
      
      res.json({ 
        success: true, 
        message: "Event published successfully - pending review",
        event: result 
      });
    } catch (error: any) {
      console.error("Error publishing event:", error);
      res.status(500).json({ 
        success: false,
        message: "Failed to publish event", 
        error: error?.message || "Unknown error" 
      });
    }
  });

  // Removed mock signed URL endpoint - use /api/objects/upload instead
  // Mock venues and services endpoints removed - now using real database endpoints below

  // Profile routes
  app.get('/api/participant-profile', isAuthenticated, async (req: any, res) => {
    try {
      const userId = resolveCurrentUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "User not authenticated" });
      }
      const profile = await storage.getParticipantProfileByUserId(userId);
      if (!profile) {
        return res.status(404).json({ message: "Profile not found" });
      }
      res.json(profile);
    } catch (error) {
      console.error("Error fetching participant profile:", error);
      res.status(500).json({ message: "Failed to fetch profile" });
    }
  });

  app.get('/api/creator-profile', isAuthenticated, async (req: any, res) => {
    try {
      const userId = resolveCurrentUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "User not authenticated" });
      }
      const profile = await storage.getCreatorProfileByUserId(userId);
      if (!profile) {
        return res.status(404).json({ message: "Profile not found" });
      }
      res.json(profile);
    } catch (error) {
      console.error("Error fetching creator profile:", error);
      res.status(500).json({ message: "Failed to fetch profile" });
    }
  });

  app.post('/api/creator-profile', isAuthenticated, async (req: any, res) => {
    try {
      const userId = resolveCurrentUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "User not authenticated" });
      }
      console.log("Creating creator profile for user:", userId);
      console.log("Profile data received:", req.body);
      
      // Handle both location and baseLocation field names
      const location = req.body.location || req.body.baseLocation;
      
      // Validate required fields
      if (!req.body.displayName || !req.body.bio || !location || !req.body.experienceLevel || !req.body.payoutEmail) {
        return res.status(400).json({ 
          message: "Missing required fields", 
          required: ["displayName", "bio", "location/baseLocation", "experienceLevel", "payoutEmail"] 
        });
      }

      // Transform the data to match database schema
      const profileData = {
        displayName: req.body.displayName,
        bio: req.body.bio,
        location: location,
        experienceLevel: req.body.experienceLevel,
        payoutEmail: req.body.payoutEmail,
        termsAccepted: req.body.termsAccepted || false,
        tagline: req.body.tagline || null,
        profilePhoto: req.body.profilePhoto || null,
        expertiseTags: req.body.expertiseTags || req.body.expertise || [],
        gallery: req.body.gallery || req.body.portfolioImages || [],
        socialLinks: req.body.socialLinks || req.body.socialMediaLinks || {},
        stripeVerificationStatus: "pending",
        approved: false,
        completed: true // Mark profile as completed when successfully created
      };
      
      const profile = await storage.createOrUpdateCreatorProfile(userId, profileData);
      
      console.log("Creator profile created successfully:", profile.id);
      res.status(201).json(profile);
    } catch (error) {
      console.error("Error creating creator profile:", error);
      res.status(500).json({ 
        message: "Failed to create creator profile", 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  });

  app.put('/api/creator-profile', async (req: any, res) => {
    try {
      const userId = process.env.NODE_ENV === 'development' ? "45788955" : req.user.claims.sub;
      console.log("Updating creator profile for user:", userId);
      console.log("Profile updates received:", req.body);
      
      // Transform the data to match database schema
      const profileData = {
        displayName: req.body.displayName,
        bio: req.body.bio,
        location: req.body.location,
        experienceLevel: req.body.experienceLevel,
        payoutEmail: req.body.payoutEmail,
        termsAccepted: req.body.termsAccepted,
        tagline: req.body.tagline || null,
        profilePhoto: req.body.profilePhoto || null,
        expertiseTags: req.body.expertiseTags || [],
        gallery: req.body.gallery || [],
        socialLinks: req.body.socialLinks || {},
        completed: true // Mark profile as completed when successfully updated
      };
      
      const profile = await storage.createOrUpdateCreatorProfile(userId, profileData);
      
      console.log("Creator profile updated successfully:", profile.id);
      res.json(profile);
    } catch (error) {
      console.error("Error updating creator profile:", error);
      res.status(500).json({ 
        message: "Failed to update creator profile", 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  });

  // Experience routes - List public experiences (approved and published by default)
  app.get("/api/experiences", async (req, res) => {
    try {
      const { category, status, limit, includeParticipants } = req.query;
      
      // If no status specified, fetch both approved and published experiences
      // Otherwise use the specified status filter
      const statusFilter = status as string || undefined;
      
      // Titles containing these strings are internal test/QA experiences — never show publicly
      const TEST_TITLE_PATTERNS = ['test', 'qa', 'acceptance', '8rivyi'];
      const isTestExperience = (title: string) =>
        TEST_TITLE_PATTERNS.some(p => title.toLowerCase().includes(p));

      // Helper: enrich a list of experiences with live MVG progress (single source of truth)
      const enrichWithLiveLifecycle = async (exps: any[]) => {
        return Promise.all(exps.map(async (exp) => {
          if (exp.requireMinimumParticipants) {
            const mvgProgress = await storage.getMVGProgress(exp.id);
            const mvgMet = mvgProgress.mvg_met;
            const resolvedMvgStatus = mvgMet ? 'met' : (exp.mvgStatus || 'pending');
            const curr = mvgProgress.current_participants;
            const min = mvgProgress.minimum_participants || exp.minimumParticipants || 0;
            const fundingPercentage = min > 0 ? Math.round((curr / min) * 100) : 0;
            const participantsNeeded = Math.max(0, min - curr);
            return {
              ...exp,
              currentParticipants: curr,
              minimumParticipants: min,
              fundingPercentage,
              participantsNeeded,
              mvgMet,
              lifecycleStatus: computeLifecycleStatus({ ...exp, mvgStatus: resolvedMvgStatus, mvgMet }),
            };
          }
          return { ...exp, lifecycleStatus: computeLifecycleStatus(exp) };
        }));
      };

      // Use enriched method when participant previews are requested
      if (includeParticipants === "true") {
        let experiences = await storage.getExperiencesWithParticipantPreview({
          category: category as string,
          status: statusFilter,
          limit: limit ? parseInt(limit as string) : undefined,
        });
        
        // If no status filter, combine approved and published; enforce strict data hygiene
        if (!statusFilter) {
          experiences = experiences.filter(exp => 
            (exp.status === "approved" || exp.status === "published") &&
            !isTestExperience(exp.title || '') &&
            exp.status !== 'cancelled' &&
            parseFloat(exp.price as string || '0') > 0
          );
        }
        
        res.json(await enrichWithLiveLifecycle(experiences));
      } else {
        let experiences = await storage.getExperiences({
          category: category as string,
          status: statusFilter,
          limit: limit ? parseInt(limit as string) : undefined,
        });
        
        // If no status filter, combine approved and published; enforce strict data hygiene
        if (!statusFilter) {
          experiences = experiences.filter(exp => 
            (exp.status === "approved" || exp.status === "published") &&
            !isTestExperience(exp.title || '') &&
            exp.status !== 'cancelled' &&
            parseFloat(exp.price as string || '0') > 0
          );
        }
        
        res.json(await enrichWithLiveLifecycle(experiences));
      }
    } catch (error) {
      console.error("Error fetching experiences:", error);
      res.status(500).json({ message: "Failed to fetch experiences" });
    }
  });

  app.get("/api/experiences/:id", async (req: any, res) => {
    try {
      // Support both ID and slug lookup
      let experience = await storage.getExperience(req.params.id);
      if (!experience) {
        // Try slug lookup if ID lookup fails
        experience = await storage.getExperienceBySlug(req.params.id);
      }
      if (!experience) {
        return res.status(404).json({ message: "Experience not found" });
      }
      
      // ACCESS CONTROL IMPLEMENTATION
      // In development, use hardcoded user ID for testing; in production, use authenticated session
      const userId = process.env.NODE_ENV === 'development' ? '45788955' : req.user?.claims?.sub;
      const isAdmin = await checkIsAdmin(req);
      const isCreator = userId && experience.creatorId === userId;
      
      console.log(`[Experience ${req.params.id}] Status: ${experience.status}, User: ${req.user?.claims?.email ?? 'anonymous'}, IsAdmin: ${isAdmin}, IsCreator: ${isCreator}`);
      
      // Check for valid preview token (ONLY for pending status)
      const previewToken = req.query.preview as string;
      const isPendingStatus = experience.status === "pending" || experience.status === "pending_approval";
      const hasValidPreviewToken = 
        isPendingStatus && 
        previewToken && 
        experience.previewToken && 
        previewToken === experience.previewToken;
      
      // ACCESS CONTROL RULES:
      // 1. APPROVED/PUBLISHED: Visible to everyone (public)
      // 2. CANCELLED: Visible to everyone (participants need to see their cancellation)
      // 3. PENDING: Visible ONLY with valid preview token OR to creator/admin
      // 4. DRAFT: Visible ONLY to creator/admin (preview tokens do NOT work for drafts)
      const isApproved = experience.status === "approved" || experience.status === "published";
      const isCancelled = experience.status === "cancelled";
      const isDraft = experience.status === "draft";
      
      // Check access
      if (!isApproved && !isCancelled) {
        // Not approved or cancelled - check if user has permission
        if (isDraft) {
          // Draft: ONLY creator/admin (no preview tokens)
          if (!isCreator && !isAdmin) {
            console.log(`[Experience ${req.params.id}] Access denied - Draft only visible to creator/admin`);
            return res.status(404).json({ message: "Experience not found" });
          }
        } else if (isPendingStatus) {
          // Pending: requires valid preview token OR creator/admin
          if (!hasValidPreviewToken && !isCreator && !isAdmin) {
            console.log(`[Experience ${req.params.id}] Access denied - Pending requires preview token or creator/admin`);
            return res.status(404).json({ message: "Experience not found" });
          }
        } else {
          // Any other status: not accessible
          console.log(`[Experience ${req.params.id}] Access denied - Invalid status: ${experience.status}`);
          return res.status(404).json({ message: "Experience not found" });
        }
      }
      
      // Get stats and bookings
      const stats = await storage.getExperienceStats(req.params.id);
      const bookings = await storage.getBookingsByExperience(req.params.id);
      const reviews = await storage.getReviewsByExperience(req.params.id);
      // Enrich with live MVG count for accurate lifecycle status
      const mvgProgress = await storage.getMVGProgress(req.params.id);
      const mvgMet = mvgProgress.mvg_met;
      const resolvedMvgStatus = mvgMet ? 'met' : (experience.mvgStatus || 'pending');

      res.json({
        ...experience,
        // Override stale DB column with live booking count — single source of truth
        currentParticipants: mvgProgress.current_participants,
        stats,
        bookings: bookings.filter(b => b.status === "confirmed"),
        reviews,
        // Lifecycle status - single source of truth for FORMING/CONFIRMED/CANCELLED
        mvgStatus: resolvedMvgStatus,
        lifecycleStatus: computeLifecycleStatus({ ...experience, mvgStatus: resolvedMvgStatus, mvgMet }),
        // Include full MVG data for client-side accuracy
        mvgProgressData: {
          currentBookings: mvgProgress.current_participants,
          mvgMin: mvgProgress.minimum_participants,
          mvgMet: mvgProgress.mvg_met,
        },
      });
    } catch (error) {
      console.error("Error fetching experience:", error);
      res.status(500).json({ message: "Failed to fetch experience" });
    }
  });

  // Generate shareable link for experience
  app.get("/api/experiences/:id/share-link", async (req, res) => {
    try {
      const { id } = req.params;
      const experience = await storage.getExperience(id);
      
      if (!experience) {
        return res.status(404).json({ message: "Experience not found" });
      }

      const baseUrl = getAppBaseUrl(req);
      const shareUrl = `${baseUrl}/experience/${id}`;
      const referralCode = `ref_${id.slice(0, 8)}_${Date.now().toString(36)}`;

      res.json({
        shareUrl,
        referralCode,
        experience: {
          id: experience.id,
          title: experience.title,
          description: experience.shortDescription || experience.description.slice(0, 120) + '...',
          coverImageUrl: experience.coverImageUrl,
          price: experience.price,
          location: experience.location
        }
      });
    } catch (error) {
      console.error("Error generating share link:", error);
      res.status(500).json({ message: "Failed to generate share link" });
    }
  });

  // Generate preview token for pending experiences (creator/admin only)
  app.post("/api/experiences/:id/generate-preview-token", async (req: any, res) => {
    try {
      const { id } = req.params;
      // In development, use hardcoded user ID for testing; in production, use authenticated session
      const userId = process.env.NODE_ENV === 'development' ? '45788955' : req.user?.claims?.sub;
      const isAdmin = await checkIsAdmin(req);
      
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const experience = await storage.getExperience(id);
      if (!experience) {
        return res.status(404).json({ message: "Experience not found" });
      }

      // Only creator or admin can generate preview tokens
      const isCreator = experience.creatorId === userId;
      if (!isCreator && !isAdmin) {
        return res.status(403).json({ message: "Only the creator or admin can generate preview links" });
      }

      // Preview tokens are only for pending/pending_approval experiences (not drafts)
      const isPendingStatus = experience.status === "pending" || experience.status === "pending_approval";
      if (!isPendingStatus) {
        return res.status(400).json({ 
          message: "Preview tokens can only be generated for pending experiences. Please submit your experience for review first." 
        });
      }

      // Generate a secure random preview token
      const crypto = await import('crypto');
      const previewToken = crypto.randomBytes(32).toString('hex');
      
      // Update experience with preview token
      await storage.updateExperience(id, { previewToken });

      const baseUrl = getAppBaseUrl(req);
      const previewUrl = `${baseUrl}/experience/${id}?preview=${previewToken}`;

      res.json({
        previewToken,
        previewUrl,
        message: "Preview link generated successfully. Share this link to allow others to view your pending experience."
      });
    } catch (error) {
      console.error("Error generating preview token:", error);
      res.status(500).json({ message: "Failed to generate preview token" });
    }
  });

  // Fetch experience by slug or ID with status-based visibility
  app.get("/api/e/:slugOrId", async (req: any, res) => {
    try {
      const { slugOrId } = req.params;
      
      // Try to fetch by slug first, then by ID if not found
      let experience = await storage.getExperienceBySlug(slugOrId);
      if (!experience) {
        experience = await storage.getExperience(slugOrId);
      }
      
      if (!experience) {
        return res.status(404).json({ message: "Not Found" });
      }
      
      // ACCESS CONTROL IMPLEMENTATION
      // In development, use hardcoded user ID for testing; in production, use authenticated session
      const userId = process.env.NODE_ENV === 'development' ? '45788955' : req.user?.claims?.sub;
      const isAdmin = await checkIsAdmin(req);
      const isCreator = userId && experience.creatorId === userId;
      
      // Check for valid preview token (for pending experiences)
      const previewToken = req.query.preview as string;
      const isPendingStatus = experience.status === "pending" || experience.status === "pending_approval";
      const hasValidPreviewToken = 
        isPendingStatus && 
        previewToken && 
        experience.previewToken && 
        previewToken === experience.previewToken;
      
      // ACCESS CONTROL RULES:
      // 1. APPROVED: Visible to everyone (public)
      // 2. PENDING: Visible ONLY with valid preview token OR to creator/admin
      // 3. DRAFT: Visible ONLY to creator/admin (preview tokens do NOT work for drafts)
      const isApproved = experience.status === "approved" || experience.status === "published";
      const isDraft = experience.status === "draft";
      
      // Check access
      if (!isApproved) {
        // Not approved - check if user has permission
        if (isDraft) {
          // Draft: ONLY creator/admin (no preview tokens)
          if (!isCreator && !isAdmin) {
            return res.status(404).json({ message: "Not Found" });
          }
        } else if (isPendingStatus) {
          // Pending: requires valid preview token OR creator/admin
          if (!hasValidPreviewToken && !isCreator && !isAdmin) {
            return res.status(404).json({ message: "Not Found" });
          }
        } else {
          // Any other status: not accessible
          return res.status(404).json({ message: "Not Found" });
        }
      }
      
      // Get related data: venue, creator, creator profile, stats, bookings, reviews, gallery, mvgProgress (parallel fetch)
      const [venue, creator, creatorProfile, stats, bookings, reviews, galleryImages, mvgProgress] = await Promise.all([
        experience.linkedVenueId ? storage.getVenue(experience.linkedVenueId) : Promise.resolve(null),
        storage.getUser(experience.creatorId),
        storage.getCreatorProfileByUserId(experience.creatorId),
        storage.getExperienceStats(experience.id),
        storage.getBookingsByExperience(experience.id),
        storage.getReviewsByExperience(experience.id),
        storage.getExperienceGallery(experience.id),
        storage.getMVGProgress(experience.id),
      ]);
      
      // Fetch amenities and services with fallback (tables may not exist yet)
      let experienceAmenities: any[] = [];
      let experienceServices: any[] = [];
      try {
        experienceAmenities = await storage.getExperienceAmenities(experience.id);
      } catch (error) {
        // Table doesn't exist yet, continue without amenities
      }
      try {
        experienceServices = await storage.getExperienceServices(experience.id);
      } catch (error) {
        // Table doesn't exist yet, continue without services
      }

      // Calculate duration in days (with validation)
      let durationDays = null;
      if (experience.startDate && experience.endDate) {
        const startDate = new Date(experience.startDate);
        const endDate = new Date(experience.endDate);
        if (!isNaN(startDate.getTime()) && !isNaN(endDate.getTime())) {
          durationDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        }
      }

      res.json({
        // Include all original experience fields
        ...experience,
        
        // Add enhanced display fields
        short_description: experience.shortDescription,
        full_description: experience.description,
        start_date: experience.startDate,
        end_date: experience.endDate,
        duration: durationDays,
        
        // Media fields
        cover_image: experience.coverImageUrl,
        gallery: galleryImages.map(img => ({
          id: img.id,
          imageUrl: img.imageUrl,
          caption: img.caption,
          order: img.order,
        })),
        
        // Itinerary data (days, activities, time blocks)
        itinerary: experience.itinerary || [],
        
        // Amenities - structured objects with id, name, description, custom, approvedByAdmin
        amenities: Array.isArray((experience as any).amenities) 
          ? (experience as any).amenities
          : [],
        
        // Services - structured objects with id, name, description, custom, approvedByAdmin
        services: Array.isArray((experience as any).services) 
          ? (experience as any).services
          : [],
        
        // Roles - structured objects with name, required, headcount, rate, notes
        roles: Array.isArray((experience as any).roles) 
          ? (experience as any).roles
          : [],
        
        // Lifecycle status - single source of truth for FORMING/CONFIRMED/CANCELLED
        lifecycleStatus: computeLifecycleStatus({
          status: experience.status || '',
          mvgStatus: mvgProgress.mvg_met ? 'met' : (experience.mvgStatus || 'pending'),
          requireMinimumParticipants: experience.requireMinimumParticipants,
          mvgMet: mvgProgress.mvg_met,
        }),
        
        // MVG (Minimum Viable Group) data - using single source of truth
        mvg: {
          enabled: experience.requireMinimumParticipants || false,
          minimum_required: mvgProgress.minimum_participants,
          current_signups: mvgProgress.current_participants,
          soft_hold_deadline: experience.mvgDeadline,
          status: mvgProgress.mvg_met ? 'met' : (experience.mvgStatus || 'pending'),
          escrow_enabled: experience.escrowEnabled || false,
          mvg_met: mvgProgress.mvg_met,
        },
        
        // Pricing data (rooms/SKUs with price, discount, available spots)
        pricing: {
          currency: (experience as any).currency || 'usd',
          basePrice: experience.price ? parseFloat(experience.price) : 0,
          depositEnabled: experience.depositEnabled || false,
          depositPercentage: experience.depositPercentage ? parseFloat(experience.depositPercentage) : 0,
          rooms: ((experience as any).rooms as any[] || []).map((room: any) => {
            // Find discount for this room/SKU
            const roomDiscount = (experience.discounts as any[] || []).find(
              (d: any) => d.active && d.skuId === room.id && 
              (!d.validUntil || new Date(d.validUntil) > new Date())
            );
            
            // Calculate available spots
            const bookedCount = bookings.filter((b: any) => 
              b.status === 'confirmed' && b.roomId === room.id
            ).length;
            const availableSpots = (room.quantity || 0) - bookedCount;
            
            return {
              id: room.id,
              name: room.name,
              price: room.pricePerPerson || 0,
              quantity: room.quantity || 0,
              availableSpots: Math.max(0, availableSpots),
              discount: roomDiscount ? {
                title: roomDiscount.title,
                type: roomDiscount.type,
                value: roomDiscount.value,
                validUntil: roomDiscount.validUntil,
              } : null,
              gallery: room.gallery || [],
              notes: room.notes,
            };
          }),
          discounts: (experience.discounts as any[] || []).filter((d: any) => 
            d.active && (!d.validUntil || new Date(d.validUntil) > new Date())
          ),
        },
        
        // Linked records
        venue: venue ? {
          id: venue.id,
          name: venue.name,
          slug: venue.slug,
          city: venue.city,
          location: venue.location,
          capacity: venue.capacity,
          description: venue.description,
          coverImageUrl: venue.coverImageUrl,
          amenities: venue.amenities,
          website: venue.website,
          instagram: venue.instagram,
          // Photos array: cover image + gallery images
          photos: [
            ...(venue.coverImageUrl ? [venue.coverImageUrl] : []),
            ...(venue.galleryImages || []),
          ],
        } : null,
        
        creator: creator ? {
          id: creator.id,
          displayName: creatorProfile?.displayName || null,
          bio: creatorProfile?.bio || null,
          avatarUrl: creatorProfile?.profilePhoto || creator.profileImageUrl || null,
          baseLocation: creatorProfile?.location || null,
          expertise: creatorProfile?.expertiseTags || [],
          experienceLevel: creatorProfile?.experienceLevel || null,
          isVerified: false,
          averageRating: stats?.averageRating || null,
          totalExperiences: null,
          socialLink: creatorProfile?.socialLinks?.website ||
            creatorProfile?.socialLinks?.instagram ||
            creatorProfile?.socialLinks?.linkedin ||
            creatorProfile?.socialLinks?.youtube ||
            null,
          // Legacy fields for backward compatibility
          photo: creatorProfile?.profilePhoto || creator.profileImageUrl || null,
          name: creatorProfile?.displayName || `${creator.firstName} ${creator.lastName}`.trim(),
          tagline: creatorProfile?.tagline || null,
        } : null,
        
        // Additional data
        stats,
        bookings: bookings.filter(b => b.status === "confirmed"),
        reviews,
      });
    } catch (error) {
      console.error("Error fetching experience:", error);
      res.status(500).json({ message: "Not Found" });
    }
  });

  // Validation function for required fields - strict HTTPS validation
  const validateDraftForPublication = (data: any) => {
    const errors: string[] = [];
    
    // Check if this is a demo event (bypass validation for demos)
    const isDemoEvent = data.title?.toLowerCase().includes('mystic') && 
                       data.title?.toLowerCase().includes('marrakesh');
    
    // Required: cover photo with HTTPS URL - Skip for demo events
    if (!isDemoEvent) {
      if (!data.coverImageUrl || data.coverImageUrl.trim() === '') {
        errors.push("Please add a cover photo to showcase your experience");
      } else if (!data.coverImageUrl.startsWith('https://')) {
        errors.push("Cover photo must be uploaded through our secure image uploader (unsupported URL format)");
      }
    }
    
    // Validate gallery images are all HTTPS URLs - Skip for demo events
    if (!isDemoEvent && data.gallery && data.gallery.length > 0) {
      const invalidGalleryUrls = data.gallery.filter((url: string) => !url || !url.startsWith('https://'));
      if (invalidGalleryUrls.length > 0) {
        errors.push("Some gallery images have invalid formats. Please use our image uploader for all photos");
      }
    }
    
    // Required: title
    if (!data.title || data.title.trim() === '') {
      errors.push("Please add a compelling title for your experience");
    } else if (data.title.length < 10) {
      errors.push("Experience title should be at least 10 characters to help participants understand what to expect");
    }
    
    // Required: description
    if (!data.description || data.description.trim() === '') {
      errors.push("Please add a detailed description to help participants understand your experience");
    } else if (data.description.length < 50) {
      errors.push("Description should be at least 50 characters to provide enough detail for participants");
    }
    
    // Required: at least one date
    if (!data.startDate) {
      errors.push("Please select when your experience will take place");
    } else {
      const startDate = new Date(data.startDate);
      const now = new Date();
      if (startDate < now) {
        errors.push("Experience start date must be in the future");
      }
    }

    const experienceType = data.type || "one-day";
    if (experienceType === "one-day") {
      if (!data.startTime || data.startTime.trim() === "") {
        errors.push("Please add a start time for your single-day event");
      }
      if (!data.endTime || data.endTime.trim() === "") {
        errors.push("Please add an end time for your single-day event");
      }
      if (!data.standingCapacity && !data.maxParticipants) {
        errors.push("Please add standing capacity for your single-day event");
      }
    }
    if (experienceType === "multi-day") {
      if (!data.endDate) {
        errors.push("Please select an end date for your multi-day trip");
      }
      if (!Array.isArray(data.rooms) || data.rooms.length === 0) {
        errors.push("Please add at least one room or sleeping option for your multi-day trip");
      }
    }
    
    // Required: venue or online location
    if (!data.location || data.location.trim() === '') {
      errors.push("Please specify where your experience will take place (venue address or online platform)");
    }
    
    // Required: pricing - check for direct price OR room-based pricing
    const hasRoomPricing = Array.isArray(data.rooms) && data.rooms.length > 0 && 
      data.rooms.some((room: any) => room.pricePerPerson && parseFloat(room.pricePerPerson) > 0);
    
    if (hasRoomPricing) {
      // Room-based pricing is valid - no need for separate price field
    } else if (!data.price || data.price === '') {
      errors.push("Please set a price for your experience");
    } else if (parseFloat(data.price) <= 0) {
      errors.push("Experience price must be greater than $0");
    } else if (parseFloat(data.price) > 10000) {
      errors.push("Experience price seems unusually high. Please contact support if this is intentional");
    }
    
    return {
      isValid: errors.length === 0,
      errors,
      missingFields: errors.length
    };
  };

  // Publish draft endpoint - validates and converts draft to live experience
  app.post("/api/experience-drafts/:id/publish", isAuthenticated, async (req: any, res) => {
    try {
      const userId = process.env.NODE_ENV === 'development' ? "45788955" : req.user.claims.sub;
      const { id: draftId } = req.params;
      
      // Get the draft
      let draft = await storage.getExperienceDraftById(draftId);
      if (!draft) {
        return res.status(404).json({ message: "Draft not found" });
      }
      
      // Verify ownership
      if (draft.creatorId !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Publish using the latest submitted form values, while preserving ownership.
      draft = { ...draft, ...req.body, creatorId: draft.creatorId };
      
      // Validate draft against publication requirements
      const validation = validateDraftForPublication(draft);
      if (!validation.isValid) {
        return res.status(400).json({
          message: "Draft validation failed",
          errors: validation.errors,
          missingFields: validation.missingFields
        });
      }
      
      // Convert date strings to Date objects
      const experienceType = (draft.type as "one-day" | "multi-day" | "virtual") || "one-day";
      const isSingleDayEvent = experienceType === "one-day";
      const isMultiDayTrip = experienceType === "multi-day";
      const startDate = draft.startDate ? new Date(draft.startDate) : new Date();
      const endDate = isSingleDayEvent
        ? startDate
        : (draft.endDate ? new Date(draft.endDate) : startDate);
      const normalizedRooms = isMultiDayTrip ? (draft.rooms || []) : [];
      const sleepingCapacity = normalizedRooms.reduce((total: number, room: any) => {
        const capacity = Number(room?.capacity || 0);
        const quantity = Number(room?.quantity || 0);
        return total + capacity * quantity;
      }, 0);
      const normalizedMaxParticipants = isSingleDayEvent
        ? Number((draft as any).standingCapacity || draft.maxParticipants || 1)
        : (sleepingCapacity || draft.maxParticipants || 10);
        
      // Calculate MVG deadline from draft data
      const mvgDeadline = draft.mvgEnabled && draft.mvgDeadlineDays && startDate ? 
        new Date(startDate.getTime() - (draft.mvgDeadlineDays * 24 * 60 * 60 * 1000)) : 
        undefined;
      
      // Check if this is a demo event for placeholder image fallback
      const isDemoEvent = draft.title?.toLowerCase().includes('mystic') && 
                         draft.title?.toLowerCase().includes('marrakesh');
      
      // Default placeholder cover image for Marrakesh demo
      const defaultMarrakeshImage = "https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&h=400";
      
      // Use placeholder image for demo if cover image is missing/empty
      const coverImageUrl = (isDemoEvent && (!draft.coverImageUrl || draft.coverImageUrl.trim() === '')) 
        ? defaultMarrakeshImage 
        : draft.coverImageUrl;
      
      // Service and Amenity mappings for converting IDs to structured objects
      const serviceMap: Record<string, { name: string; description: string }> = {
        yoga_instructor: { name: 'Yoga Instructor', description: 'Certified yoga instructor for sessions' },
        meditation_guide: { name: 'Meditation Guide', description: 'Guided meditation and mindfulness' },
        personal_trainer: { name: 'Personal Trainer', description: 'One-on-one fitness coaching' },
        massage_therapist: { name: 'Massage Therapist', description: 'Professional massage services' },
        nutrition_coach: { name: 'Nutrition Coach', description: 'Dietary guidance and meal planning' },
        hiking_guide: { name: 'Hiking Guide', description: 'Experienced trail guide and safety' },
        climbing_instructor: { name: 'Climbing Instructor', description: 'Rock climbing and safety instruction' },
        surf_instructor: { name: 'Surf Instructor', description: 'Surfing lessons and water safety' },
        dive_instructor: { name: 'Dive Instructor', description: 'Scuba diving instruction and certification' },
        kayak_guide: { name: 'Kayak Guide', description: 'Kayaking instruction and tours' },
        language_tutor: { name: 'Language Tutor', description: 'Local language instruction' },
        cultural_guide: { name: 'Cultural Guide', description: 'Local culture and history expert' },
        cooking_instructor: { name: 'Cooking Instructor', description: 'Local cuisine cooking classes' },
        art_instructor: { name: 'Art Instructor', description: 'Creative arts and crafts guidance' },
        music_instructor: { name: 'Music Instructor', description: 'Musical instrument or vocal instruction' },
        photographer: { name: 'Photographer', description: 'Professional photography services' },
        videographer: { name: 'Videographer', description: 'Video production and editing' },
        chef: { name: 'Chef/Cook', description: 'Professional culinary services' },
        driver: { name: 'Driver/Guide', description: 'Transportation and local guiding' },
        childcare_provider: { name: 'Childcare Provider', description: 'Professional childcare services' },
      };

      const amenityMap: Record<string, { name: string; description: string }> = {
        wifi: { name: 'Wi-Fi', description: 'High-speed internet access' },
        projector: { name: 'Projector/Screen', description: 'Presentation equipment' },
        sound_system: { name: 'Sound System', description: 'Audio equipment and speakers' },
        charging_stations: { name: 'Charging Stations', description: 'Device charging areas' },
        pool: { name: 'Swimming Pool', description: 'Swimming and water activities' },
        spa: { name: 'Spa/Hot Tub', description: 'Relaxation and wellness facilities' },
        sauna: { name: 'Sauna', description: 'Steam and heat therapy' },
        gym: { name: 'Gym/Fitness Center', description: 'Exercise equipment and facilities' },
        yoga_studio: { name: 'Yoga/Movement Studio', description: 'Dedicated space for movement practices' },
        fire_pit: { name: 'Fire Pit/Bonfire Area', description: 'Outdoor gathering and warmth' },
        bbq_grill: { name: 'BBQ/Grill', description: 'Outdoor cooking facilities' },
        garden: { name: 'Garden/Terrace', description: 'Outdoor space and nature' },
        sports_court: { name: 'Sports Court', description: 'Basketball, tennis, or multi-sport' },
        hiking_trails: { name: 'Hiking Trails', description: 'Walking and nature paths' },
        full_kitchen: { name: 'Full Kitchen', description: 'Complete cooking facilities' },
        dining_area: { name: 'Dining Area', description: 'Shared meal space' },
        coffee_station: { name: 'Coffee Station', description: 'Coffee and tea facilities' },
        outdoor_dining: { name: 'Outdoor Dining', description: 'Al fresco eating area' },
        air_conditioning: { name: 'Air Conditioning', description: 'Climate control' },
        heating: { name: 'Heating', description: 'Warmth and comfort' },
        parking: { name: 'Parking', description: 'Vehicle parking space' },
        laundry: { name: 'Laundry Facilities', description: 'Washing and drying' },
        library: { name: 'Library/Reading Area', description: 'Quiet space with books' },
      };

      // Convert selectedServiceIds to structured service objects
      const services = Array.isArray((draft as any).selectedServiceIds) 
        ? (draft as any).selectedServiceIds.map((id: string) => ({
            id,
            name: serviceMap[id]?.name || id,
            description: serviceMap[id]?.description,
            custom: !serviceMap[id], // Mark as custom if not in standard list
            approvedByAdmin: false
          }))
        : [];

      // Convert selectedAmenityIds to structured amenity objects
      const amenities = Array.isArray((draft as any).selectedAmenityIds)
        ? (draft as any).selectedAmenityIds.map((id: string) => ({
            id,
            name: amenityMap[id]?.name || id,
            description: amenityMap[id]?.description,
            custom: !amenityMap[id], // Mark as custom if not in standard list
            approvedByAdmin: false
          }))
        : [];

      // Get roles from draft
      const roles = Array.isArray((draft as any).roles) ? (draft as any).roles : [];
      
      // Prepare experience data from draft with explicit type mapping
      const experienceData = {
        title: draft.title || '',
        description: draft.description || '',
        shortDescription: draft.shortDescription,
        category: (draft.category as "sports_wellness" | "retreats" | "community_social" | "adventure_trips" | "workations" | "festivals_events") || "community_social" as const,
        experienceType,
        coverImageUrl,
        gallery: draft.gallery || [],
        location: draft.location || '',
        venue: draft.venue,
        startDate,
        endDate,
        startTime: isSingleDayEvent ? (draft as any).startTime || null : null,
        endTime: isSingleDayEvent ? (draft as any).endTime || null : null,
        maxParticipants: normalizedMaxParticipants,
        currentParticipants: 0,
        price: (draft.price || '0').toString(),
        currency: draft.currency || 'usd',
        depositEnabled: draft.depositEnabled || false,
        depositPercentage: draft.depositPercentage,
        depositAmount: (draft as any).depositAmount || null,
        balanceDueDays: draft.balanceDueDays || 14,
        creatorId: userId,
        status: "published" as const,
        
        // Venue mapping: map selectedVenueId to linkedVenueId
        linkedVenueId: (draft as any).selectedVenueId || null,

        // ── Self-Hosted / Manual Address logic ──────────────────────────────
        // If no platform Space is linked the creator is bringing their own venue.
        // Rules:
        //   1. Space revenue share is forced to 0% — no external venue gets a cut.
        //   2. The creator absorbs that % (their share = 100% - platform fee).
        //   3. No Space Handshake needed — experience publishes immediately.
        venueRevenuePercentage: ((draft as any).selectedVenueId)
          ? String(draft.venueRevenuePercentage ?? '0.00')   // platform Space: keep draft value
          : '0.00',                                           // self-hosted: always 0%

        // MVG field mapping: Map frontend MVG fields to backend schema fields
        // Use type assertion for fields that may exist from frontend but not in strict type
        mvgEnabled: draft.mvgEnabled !== undefined ? draft.mvgEnabled : ((draft as any).requireMinimumParticipants !== undefined ? (draft as any).requireMinimumParticipants : true),
        // mvgMinimumSize (draft) → minimumParticipants, mvgMinimumSize, mvgMin (experience)
        // Note: Frontend sends as minimumParticipants but draft schema stores as mvgMinimumSize
        minimumParticipants: draft.mvgMinimumSize || (draft as any).minimumParticipants || 6,
        mvgMinimumSize: draft.mvgMinimumSize || (draft as any).minimumParticipants || 6,
        mvgMin: draft.mvgMinimumSize || (draft as any).minimumParticipants || 6,
        // Calculate mvgDeadlineDays from mvgDeadline if provided (use mvgDeadlineDays from draft)
        mvgDeadlineDays: draft.mvgDeadlineDays || 7,
        mvgStatus: (draft.mvgEnabled !== undefined ? draft.mvgEnabled : true) ? "pending" as const : undefined,
        escrowEnabled: (draft.mvgEnabled !== undefined ? draft.mvgEnabled : true) || false,
        
        // Revenue split fields
        // Self-hosted: creator gets back whatever % was earmarked for the Space.
        // Platform Space: use the split exactly as the creator configured it.
        ...((() => {
          const isLinked = !!((draft as any).selectedVenueId);
          const platformPct = parseFloat(String(draft.platformPct ?? draft.platformRevenuePercentage ?? 15));
          const venuePct    = isLinked ? parseFloat(String((draft as any).venueRevenuePercentage ?? 0)) : 0;
          const creatorPct  = Math.max(0, 100 - platformPct - venuePct);
          return {
            creatorPct,
            platformPct,
            creatorRevenuePercentage: creatorPct,
            platformRevenuePercentage: platformPct,
          };
        })()),
        
        // Soft-hold fields
        softHoldEnabled: draft.softHoldEnabled || false,
        softHoldDurationHours: draft.softHoldDurationHours || 48,
        
        // Services, Amenities, and Roles
        services,
        amenities,
        roles,
        
        // Itinerary/Plan
        itinerary: (draft as any).itinerary || [],
        
        // Rooms and accommodation
        rooms: normalizedRooms,
        ticketSkus: isSingleDayEvent
          ? []
          : (((draft as any).ticketSkus && (draft as any).ticketSkus.length > 0) 
          ? (draft as any).ticketSkus 
          : normalizedRooms.map((room: any, index: number) => ({
              id: `sku-${Date.now()}-${index}`,
              sourceRoomId: room.id || `room-${index}`,
              ticketName: room.name || `Ticket ${index + 1}`,
              pricePerPerson: room.pricePerPerson || 0,
              ticketCapacity: room.quantity || 0,
              soldCount: 0,
              depositEnabled: room.depositEnabled || false,
              depositType: room.depositType || 'fixed',
              depositPerPerson: room.depositAmount || 0,
              notes: room.notes || '',
              gallery: room.gallery || [],
            }))),
        accommodationType: isMultiDayTrip ? draft.accommodationType : null,
        
        // Virtual meeting fields
        virtualMeetingUrl: draft.virtualMeetingUrl,
        virtualPlatform: draft.virtualPlatform,
        virtualInstructions: draft.virtualInstructions,
        
        // Terms and conditions mapping
        termsAndConditions: (draft as any).customTerms || null,
        termsDocumentUrl: draft.termsDocumentUrl || null,
        
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      
      // Create the published experience
      const experience = await storage.createExperience(experienceData);
      
      // Delete the draft since it's now published
      await storage.deleteExperienceDraft(draftId, userId);
      
      // Generate shareable link
      const shareableLink = `${getAppBaseUrl(req)}/experiences/${experience.id}`;
      
      res.status(201).json({
        message: "Experience published successfully",
        experience,
        shareableLink,
        id: experience.id
      });
      
    } catch (error) {
      console.error("Error publishing experience:", error);
      res.status(500).json({ message: "Failed to publish experience" });
    }
  });

  // Create a new experience
  app.post("/api/experiences", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // Check if creator has completed profile (required for instant publish)
      const creatorProfile = await storage.getCreatorProfile(userId);
      const hasCompletedProfile = creatorProfile && (creatorProfile as any).completed;
      
      // Convert date strings to Date objects
      const startDate = req.body.startDate ? new Date(req.body.startDate) : null;
      const endDate = req.body.endDate 
        ? new Date(req.body.endDate) 
        : (req.body.type === "one-day" && startDate ? startDate : startDate);
        
      // Validate and sanitize status
      const requestedStatus = req.body.status;
      const validStatuses = ["published", "pending_approval", "draft"];
      let status = "published"; // Default to published for creators with completed profiles
      
      // Only allow published status if creator has completed their profile
      if (requestedStatus && validStatuses.includes(requestedStatus)) {
        if (requestedStatus === "published" && !hasCompletedProfile) {
          status = "pending_approval"; // Downgrade to pending if profile incomplete
        } else {
          status = requestedStatus;
        }
      } else if (!hasCompletedProfile) {
        status = "pending_approval"; // Default to pending if profile incomplete
      }
        
      const experienceData = {
        ...req.body,
        experienceType: req.body.type, // Map 'type' to 'experienceType' for database
        creatorId: userId,
        status: status as any,
        startDate,
        endDate,
      };

      const experience = await storage.createExperience(experienceData);
      res.json(experience);
    } catch (error) {
      console.error("Error creating experience:", error);
      res.status(500).json({ message: "Failed to create experience", error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.put("/api/experiences/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const experience = await storage.getExperience(req.params.id);
      
      if (!experience || experience.creatorId !== userId) {
        return res.status(403).json({ message: "Unauthorized" });
      }

      const updated = await storage.updateExperience(req.params.id, req.body);
      res.json(updated);
    } catch (error) {
      console.error("Error updating experience:", error);
      res.status(500).json({ message: "Failed to update experience" });
    }
  });

  // Booking routes
  app.post("/api/bookings", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { experienceId, amount, isEscrow, stripePaymentIntentId, promoterId: providedPromoterId, referralCode: providedReferralCode, paymentType, ticketSkuId: bookingTicketSkuId } = req.body;

      // IDEMPOTENCY: If a booking already exists for this payment intent, return it — prevents
      // duplicate bookings (and duplicate commissions) from retries or double-submits
      if (stripePaymentIntentId) {
        const existingBookingForPI = await storage.getBookingByPaymentIntent(stripePaymentIntentId);
        if (existingBookingForPI) {
          console.log(`[Booking] Idempotency hit: booking ${existingBookingForPI.id} already exists for PI ${stripePaymentIntentId}`);
          return res.status(200).json({
            booking: existingBookingForPI,
            message: "Booking already exists for this payment",
            mvgResult: null
          });
        }
      }

      // Get experience details to check if MVG/escrow is enabled
      const experience = await storage.getExperience(experienceId);
      if (!experience) {
        return res.status(404).json({ message: "Experience not found" });
      }
      
      // PROMOTER ATTRIBUTION - Priority order:
      // 1. Provided values from session/local storage (client sends with booking)
      // 2. User's referred_by_promoter_id (persisted at signup)
      // 3. null (no attribution)
      let promoterId: string | null = null;
      let referralCode: string | null = null;
      
      if (providedPromoterId) {
        // Validate provided promoter exists
        const promoter = await storage.getUser(providedPromoterId);
        if (promoter) {
          promoterId = providedPromoterId;
          referralCode = providedReferralCode || promoter.promoterCode || null;
        }
      } else if (providedReferralCode) {
        // Resolve promoter from referral code
        const promoter = await storage.getUserByPromoterCode(providedReferralCode);
        if (promoter) {
          promoterId = promoter.id;
          referralCode = providedReferralCode;
        }
      }
      
      // Fallback to user's referred_by_promoter_id if no direct attribution
      if (!promoterId) {
        const user = await storage.getUser(userId);
        if (user?.referredByPromoterId) {
          promoterId = user.referredByPromoterId;
          const referrer = await storage.getUser(user.referredByPromoterId);
          referralCode = referrer?.promoterCode || null;
        }
      }

      const fullPrice = amount;
      let isDepositOnly = false;
      let depositAmount = 0;
      let balanceAmount = 0;
      let balanceDueDate = null;

      const ticketSkus = experience.ticketSkus as any[] || [];
      
      let selectedTicket: any = null;
      if (bookingTicketSkuId && ticketSkus.length > 0) {
        selectedTicket = ticketSkus.find((t: any, i: number) => 
          (t.id || t.sourceRoomId || `ticket-${i}`) === bookingTicketSkuId
        );
      }
      
      const fixedDeposit = selectedTicket?.depositPerPerson
        ? parseFloat(selectedTicket.depositPerPerson)
        : (experience.depositAmount ? parseFloat(experience.depositAmount.toString()) : 0);

      if (paymentType === 'full') {
        isDepositOnly = false;
        depositAmount = 0;
        balanceAmount = 0;
      } else if (experience.depositEnabled && fixedDeposit > 0) {
        isDepositOnly = true;
        depositAmount = fixedDeposit;
        balanceAmount = fullPrice - depositAmount;
        
        if (experience.startDate) {
          const startDate = new Date(experience.startDate);
          const dueDays = experience.balanceDueDays || 14;
          balanceDueDate = new Date(startDate.getTime() - (dueDays * 24 * 60 * 60 * 1000));
        }
      } else {
        depositAmount = 0;
        balanceAmount = 0;
      }

      let paymentIntentId = stripePaymentIntentId;

      // If no payment intent ID provided, create a new one
      if (!paymentIntentId) {
        const chargeAmount = isDepositOnly ? depositAmount : fullPrice;
        const paymentIntentData: any = {
          amount: Math.round(chargeAmount * 100), // Convert to cents
          currency: (experience.currency || "eur").toLowerCase(),
          capture_method: "manual", // Hold payment until manually captured
          confirmation_method: "automatic",
          metadata: { 
            experienceId, 
            userId,
            isEscrow: (isEscrow || experience.escrowEnabled)?.toString() || "false",
            isDepositPayment: isDepositOnly.toString(),
            fullPrice: fullPrice.toString(),
            depositAmount: depositAmount.toString(),
            balanceAmount: balanceAmount.toString()
          },
        };

        const paymentIntent = await stripe.paymentIntents.create(paymentIntentData);
        paymentIntentId = paymentIntent.id;
      }

      // Calculate commission if promoter is attached
      let commissionAmount: number | null = null;
      let commissionCurrency: string | null = null;
      let commissionStatus: 'estimated' | 'locked' | 'voided' | null = null;
      
      if (promoterId) {
        // Commission is calculated on FULL PRICE, not deposit
        // DATA CONTRACT: Price comes from ticketSkus.pricePerPerson, currency from experience.currency
        const pricePerPerson = selectedTicket?.pricePerPerson
          ? parseFloat(selectedTicket.pricePerPerson)
          : parseFloat(fullPrice.toString());
        const spotsBooked = 1; // For now, 1 spot per booking (can be extended for group bookings)
        const currency = experience.currency || 'EUR';
        
        const commission = await calculateBookingCommission(
          experienceId,
          pricePerPerson,
          spotsBooked,
          parseFloat(fullPrice.toString()),
          currency
        );
        
        commissionAmount = commission.commissionAmount;
        commissionCurrency = commission.commissionCurrency;
        commissionStatus = commission.commissionStatus;
        
        console.log(`[Booking] Commission calculated for promoter ${promoterId}: ${commissionAmount} ${commissionCurrency}`);
      }

      // Create booking with deposit tracking information and promoter attribution
      const booking = await storage.createBooking({
        experienceId,
        userId,
        amount: (isDepositOnly ? depositAmount : fullPrice).toString(), // Amount actually charged
        totalPrice: fullPrice.toString(), // Full experience price
        isDepositOnly,
        depositAmount: depositAmount.toString(),
        balanceAmount: balanceAmount.toString(),
        balanceDueDate,
        balancePaid: !isDepositOnly, // True if full payment, false if deposit only
        status: isEscrow || experience.requireMinimumParticipants ? "pending" : (isDepositOnly ? "deposit_paid" : "fully_paid"),
        stripePaymentIntentId: paymentIntentId,
        // Promoter attribution (null if no referral)
        promoterId,
        referralCode,
        // Commission fields (null if no promoter)
        commissionAmount: commissionAmount?.toString() || null,
        commissionCurrency,
        commissionStatus,
        ticketSkuId: bookingTicketSkuId || null,
        ticketName: selectedTicket?.ticketName || selectedTicket?.name || null,
      });

      // Check if this booking might trigger MVG completion
      let mvgCheckResult = null;
      if (experience.requireMinimumParticipants && experience.mvgStatus === "pending") {
        const updatedBookings = await storage.getBookingsByExperience(experienceId);
        const currentBookings = updatedBookings.filter(b => b.status === "confirmed" || b.status === "pending").length;
        const mvgMin = experience.mvgMin || experience.minimumParticipants || 6;
        
        if (currentBookings >= mvgMin) {
          // MVG threshold reached! Auto-confirm
          await confirmMVGEvent(experienceId, updatedBookings);
          await storage.updateExperienceMVGStatus(experienceId, "met");
          mvgCheckResult = { action: "mvg_confirmed", currentBookings, mvgMin };
          // Broadcast lifecycle flip to all connected browsers immediately
          const mvgParticipants = await storage.getExperienceParticipantAvatars(experienceId);
          broadcastMVGUpdate({
            trip_id: experienceId,
            seats_taken: currentBookings,
            funded_amount: 0,
            funded_percent: 100,
            participants: mvgParticipants,
            mvg_met: true,
            lifecycle_status: 'confirmed',
          });
        }
      }

      // ── Mark referral click as converted ──────────────────────────────────
      if (referralCode && booking?.id) {
        storage.markReferralClickConverted(referralCode, booking.id).catch(() => {});
      }

      // ── Auto-add buyer to experience chat ─────────────────────────────────
      if (booking?.id) {
        const buyerUserId = booking.userId;
        const buyerUser = buyerUserId ? await storage.getUser(buyerUserId) : null;
        const buyerName = buyerUser?.firstName
          ? `${buyerUser.firstName}${buyerUser.lastName ? ' ' + buyerUser.lastName : ''}`
          : 'A new participant';
        storage.createExperienceMessage({
          experienceId,
          userId: buyerUserId ?? 'system',
          message: `👋 ${buyerName} just joined the experience!`,
          messageType: 'announcement',
        }).catch(() => {});
      }

      // Prepare response message
      let message;
      if (mvgCheckResult?.action === "mvg_confirmed") {
        message = `🎉 Great news! Your booking just helped reach the minimum group size. Your payment has been confirmed and your spot is secured!`;
      } else if (experience.requireMinimumParticipants) {
        const mvgMin = experience.mvgMin || experience.minimumParticipants || 6;
        const currentCount = await storage.getBookingsByExperience(experienceId).then(bookings => 
          bookings.filter(b => b.status === "confirmed" || b.status === "pending").length
        );
        message = `Payment secured! We're at ${currentCount}/${mvgMin} participants. Your payment is held safely until we reach the minimum group size.`;
      } else {
        message = "Booking confirmed successfully!";
      }

      res.json({
        booking,
        message,
        mvgResult: mvgCheckResult
      });
    } catch (error) {
      console.error("Error creating booking:", error);
      res.status(500).json({ message: "Failed to create booking" });
    }
  });

  app.get("/api/bookings/user", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const bookings = await storage.getBookingsByUser(userId);
      res.json(bookings);
    } catch (error) {
      console.error("Error fetching user bookings:", error);
      res.status(500).json({ message: "Failed to fetch bookings" });
    }
  });

  // Milestone 2 Step 2: Traveler Booking Visibility (Read-Only)
  // Get user's own bookings with experience details enriched
  app.get('/api/bookings/my-bookings', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // Get user's bookings
      const userBookings = await storage.getBookingsByUser(userId);
      
      // Enrich with experience details and MVG progress
      const enrichedBookings = await Promise.all(
        userBookings.map(async (booking) => {
          const experience = await storage.getExperience(booking.experienceId);
          const mvgProgress = await storage.getMVGProgress(booking.experienceId);
          return {
            ...booking,
            experience: experience ? {
              id: experience.id,
              title: experience.title,
              coverImageUrl: experience.coverImageUrl,
              startDate: experience.startDate,
              endDate: experience.endDate,
              location: experience.location,
              venue: experience.venue,
              price: experience.price,
              minimumParticipants: mvgProgress.minimum_participants,
              currentParticipants: mvgProgress.current_participants,
              mvgMet: mvgProgress.mvg_met,
              lifecycleStatus: computeLifecycleStatus({
                status: experience.status || '',
                mvgStatus: mvgProgress.mvg_met ? 'met' : (experience.mvgStatus || 'pending'),
                requireMinimumParticipants: experience.requireMinimumParticipants,
                mvgMet: mvgProgress.mvg_met,
              }),
            } : null
          };
        })
      );
      
      // Sort by most recent booking date
      enrichedBookings.sort((a, b) => {
        const dateA = new Date(a.bookingDate || a.createdAt || 0).getTime();
        const dateB = new Date(b.bookingDate || b.createdAt || 0).getTime();
        return dateB - dateA;
      });
      
      res.json(enrichedBookings);
    } catch (error) {
      console.error("Error fetching user bookings:", error);
      res.status(500).json({ message: "Failed to fetch bookings" });
    }
  });

  app.get("/api/bookings/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const bookingId = req.params.id;
      const booking = await storage.getBooking(bookingId);
      if (!booking) {
        return res.status(404).json({ message: "Booking not found" });
      }
      if (booking.userId !== userId) {
        return res.status(403).json({ message: "Not authorized" });
      }

      let enrichedBooking: any = { ...booking };

      if (!booking.ticketName && booking.experienceId) {
        const experience = await storage.getExperience(booking.experienceId);
        if (experience) {
          const ticketSkus = (experience.ticketSkus as any[]) || [];
          if (booking.ticketSkuId && ticketSkus.length > 0) {
            const matchedTicket = ticketSkus.find((t: any, i: number) => 
              (t.id || t.sourceRoomId || `ticket-${i}`) === booking.ticketSkuId
            );
            if (matchedTicket) {
              enrichedBooking.ticketName = matchedTicket.ticketName || matchedTicket.name || null;
            }
          }
        }
      }

      res.json(enrichedBooking);
    } catch (error: any) {
      console.error("Error fetching booking:", error);
      res.status(500).json({ message: "Failed to fetch booking" });
    }
  });

  app.post("/api/bookings/:id/pay-balance/create-intent", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const bookingId = req.params.id;
      
      const booking = await storage.getBooking(bookingId);
      if (!booking) {
        return res.status(404).json({ message: "Booking not found" });
      }
      if (booking.userId !== userId) {
        return res.status(403).json({ message: "Not authorized" });
      }
      
      if (booking.balancePaid) {
        return res.status(400).json({ message: "Balance has already been paid" });
      }
      
      const balanceAmount = parseFloat(booking.balanceAmount?.toString() || "0");
      if (balanceAmount <= 0) {
        return res.status(400).json({ message: "No remaining balance to pay" });
      }
      
      if (!booking.isDepositOnly) {
        return res.status(400).json({ message: "This booking does not have a deposit-only payment" });
      }

      const experience = await storage.getExperience(booking.experienceId);
      const currency = (experience?.currency || "eur").toLowerCase();
      
      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(balanceAmount * 100),
        currency,
        metadata: {
          bookingId,
          experienceId: booking.experienceId,
          userId,
          paymentType: "balance_payment",
          originalDepositAmount: booking.depositAmount?.toString() || "0",
          balanceAmount: balanceAmount.toString(),
        },
      });
      
      await storage.updateBooking(bookingId, {
        balancePaymentIntentId: paymentIntent.id,
      } as any);
      
      res.json({ 
        clientSecret: paymentIntent.client_secret,
        amount: balanceAmount,
        currency: currency.toUpperCase(),
      });
    } catch (error: any) {
      console.error("Error creating balance payment intent:", error);
      res.status(500).json({ message: "Failed to create payment intent for balance" });
    }
  });

  app.post("/api/bookings/:id/pay-balance/confirm", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const bookingId = req.params.id;
      const { paymentIntentId } = req.body;
      
      if (!paymentIntentId) {
        return res.status(400).json({ message: "Payment intent ID is required" });
      }
      
      const booking = await storage.getBooking(bookingId);
      if (!booking) {
        return res.status(404).json({ message: "Booking not found" });
      }
      if (booking.userId !== userId) {
        return res.status(403).json({ message: "Not authorized" });
      }
      
      if (booking.balancePaid) {
        return res.status(400).json({ message: "Balance has already been paid" });
      }
      
      if (!booking.isDepositOnly) {
        return res.status(400).json({ message: "This booking does not have an outstanding balance" });
      }
      
      const balanceAmount = parseFloat(booking.balanceAmount?.toString() || "0");
      if (balanceAmount <= 0) {
        return res.status(400).json({ message: "No remaining balance to pay" });
      }

      const experience = await storage.getExperience(booking.experienceId);
      if (!experience) {
        return res.status(404).json({ message: "Experience not found" });
      }
      
      const expectedCurrency = (experience.currency || "eur").toLowerCase();

      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
      
      if (paymentIntent.status !== "succeeded" && paymentIntent.status !== "requires_capture") {
        return res.status(400).json({ message: "Payment has not been completed" });
      }
      
      if (paymentIntent.metadata?.bookingId !== bookingId) {
        return res.status(400).json({ message: "Payment intent does not match this booking" });
      }
      
      const expectedAmountCents = Math.round(balanceAmount * 100);
      if (paymentIntent.amount !== expectedAmountCents) {
        return res.status(400).json({ message: "Payment amount does not match the remaining balance" });
      }
      
      if (paymentIntent.currency !== expectedCurrency) {
        return res.status(400).json({ message: "Payment currency does not match" });
      }
      
      const isMVGOrEscrow = experience.requireMinimumParticipants || experience.escrowEnabled;
      const newStatus = isMVGOrEscrow ? booking.status : "fully_paid";
      
      const totalPrice = parseFloat(booking.totalPrice?.toString() || "0");
      
      const updatedBooking = await storage.updateBooking(bookingId, {
        balancePaid: true,
        balanceAmount: "0.00",
        isDepositOnly: false,
        balancePaymentIntentId: paymentIntentId,
        amount: totalPrice.toString(),
        status: newStatus,
      } as any);
      
      console.log(`[Balance Payment] Booking ${bookingId} balance paid. Total: ${totalPrice}, Balance: ${balanceAmount}, Status: ${newStatus}`);
      
      res.json({ 
        success: true, 
        booking: updatedBooking,
        message: "Balance payment completed successfully"
      });
    } catch (error: any) {
      console.error("Error confirming balance payment:", error);
      res.status(500).json({ message: "Failed to confirm balance payment" });
    }
  });

  // Milestone 2 Step 1: Booking Creation + Deposit Authorization
  // Creates a booking and authorizes (but does NOT capture) a deposit via Stripe
  app.post("/api/bookings/authorize-deposit", isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const { experienceId, depositAmount, currency = "usd" } = req.body;

    console.log(`[BOOKING] authorize-deposit request:`, { userId, experienceId, depositAmount, currency });

    // Validation 1: Deposit amount must be > 0
    if (!depositAmount || typeof depositAmount !== 'number' || depositAmount <= 0) {
      return res.status(400).json({ 
        success: false, 
        message: "Deposit amount must be greater than 0" 
      });
    }

    // Validation 2: Experience must exist
    const experience = await storage.getExperience(experienceId);
    if (!experience) {
      return res.status(404).json({ 
        success: false, 
        message: "Experience not found" 
      });
    }

    // Validation 3: Experience must be published
    if (experience.status !== "published" && experience.status !== "approved") {
      return res.status(400).json({ 
        success: false, 
        message: `Cannot book experience with status: ${experience.status}. Experience must be published.` 
      });
    }

    // Validation 4: Experience must not be expired (start date in future)
    if (experience.startDate) {
      const startDate = new Date(experience.startDate);
      if (startDate < new Date()) {
        return res.status(400).json({ 
          success: false, 
          message: "Cannot book an experience that has already started" 
        });
      }
    }

    // Validation 5: Spots must be available
    const currentBookings = await storage.getBookingsByExperience(experienceId);
    const activeBookings = currentBookings.filter(b => 
      !['cancelled', 'refunded', 'failed'].includes(b.status)
    );
    const spotsAvailable = experience.maxParticipants - activeBookings.length;
    
    if (spotsAvailable <= 0) {
      return res.status(400).json({ 
        success: false, 
        message: "No spots available for this experience" 
      });
    }

    // Validation 6: Check for duplicate booking (same user + experience)
    const existingBooking = await storage.getBookingByUserAndExperience(userId, experienceId);
    if (existingBooking) {
      return res.status(409).json({ 
        success: false, 
        message: "You already have an active booking for this experience",
        existingBookingId: existingBooking.id
      });
    }

    // Calculate full price and balance
    const fullPrice = parseFloat(experience.price || "0");
    const balanceAmount = Math.max(0, fullPrice - depositAmount);

    let booking: any = null;
    let paymentIntentId: string | null = null;

    try {
      // Step 1: Create booking record FIRST (before Stripe call)
      booking = await storage.createBooking({
        experienceId,
        userId,
        amount: depositAmount.toString(),
        totalPrice: fullPrice.toString(),
        isDepositOnly: true,
        depositAmount: depositAmount.toString(),
        balanceAmount: balanceAmount.toString(),
        balanceDueDate: null,
        balancePaid: false,
        status: "pending",
        depositStatus: "refundable",
        stripePaymentIntentId: null,
      });

      console.log(`[BOOKING] Created booking ${booking.id} for user ${userId}`);

      // Step 2: Create Stripe PaymentIntent with manual capture
      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(depositAmount * 100), // Convert to cents
        currency: currency.toLowerCase(),
        capture_method: "manual", // IMPORTANT: Authorize only, do not capture
        metadata: {
          booking_id: booking.id,
          experience_id: experienceId,
          user_id: userId,
          type: "deposit_authorization"
        },
        description: `Deposit for ${experience.title}`,
      });

      paymentIntentId = paymentIntent.id;
      console.log(`[BOOKING] Created PaymentIntent ${paymentIntentId} with capture_method=manual`);

      // Step 3: Update booking with Stripe PaymentIntent ID and set status to deposit_authorized
      await storage.updateBookingStatus(booking.id, "deposit_authorized");
      const [updatedBooking] = await db
        .update(bookings)
        .set({ stripePaymentIntentId: paymentIntentId })
        .where(eq(bookings.id, booking.id))
        .returning();

      console.log(`[BOOKING] Updated booking ${booking.id} with status=deposit_authorized`);

      return res.status(201).json({
        success: true,
        message: "Deposit authorized successfully. No funds have been captured.",
        booking: {
          id: updatedBooking.id,
          experienceId: updatedBooking.experienceId,
          userId: updatedBooking.userId,
          status: updatedBooking.status,
          depositAmount: updatedBooking.depositAmount,
          totalPrice: updatedBooking.totalPrice,
          balanceAmount: updatedBooking.balanceAmount,
          depositStatus: updatedBooking.depositStatus,
          stripePaymentIntentId: updatedBooking.stripePaymentIntentId,
          createdAt: updatedBooking.createdAt
        },
        paymentIntent: {
          id: paymentIntent.id,
          amount: paymentIntent.amount,
          currency: paymentIntent.currency,
          status: paymentIntent.status,
          capture_method: paymentIntent.capture_method
        }
      });

    } catch (error: any) {
      console.error(`[BOOKING] Error in authorize-deposit:`, error);

      // Rollback: If booking was created but Stripe failed, delete the booking
      if (booking?.id && !paymentIntentId) {
        try {
          await storage.deleteBooking(booking.id);
          console.log(`[BOOKING] Rolled back booking ${booking.id} due to Stripe failure`);
        } catch (rollbackError) {
          console.error(`[BOOKING] Failed to rollback booking ${booking.id}:`, rollbackError);
        }
      }

      // Determine error type for appropriate response
      if (error.type === 'StripeCardError' || error.type === 'StripeInvalidRequestError') {
        return res.status(400).json({
          success: false,
          message: `Payment authorization failed: ${error.message}`,
          error_type: error.type
        });
      }

      return res.status(500).json({
        success: false,
        message: "Failed to authorize deposit. Please try again.",
        error: error.message
      });
    }
  });

  // Admin routes
  
  // Get ALL experiences for admin (with status filtering in frontend)
  app.get("/api/admin/experiences", isAuthenticated, async (req: any, res) => {
    try {
      // Admin role check
      if (!await checkIsAdmin(req)) {
        return res.status(403).json({ message: "Admin access required" });
      }
      
      const allExperiences = await storage.getAllExperiences();
      // Enrich with MVG progress from single source of truth
      const enrichedExperiences = await Promise.all(
        allExperiences.map(async (exp) => {
          const mvgProgress = await storage.getMVGProgress(exp.id);
          const mvgMet = mvgProgress.mvg_met;
          const resolvedMvgStatus = mvgMet ? 'met' : (exp.mvgStatus || 'pending');
          return {
            ...exp,
            currentParticipants: mvgProgress.current_participants,
            participantCount: mvgProgress.current_participants,
            mvgMet,
            mvgStatus: resolvedMvgStatus,
            lifecycleStatus: computeLifecycleStatus({ ...exp, mvgStatus: resolvedMvgStatus, mvgMet }),
          };
        })
      );
      res.json(enrichedExperiences);
    } catch (error) {
      console.error("Error fetching all experiences:", error);
      res.status(500).json({ message: "Failed to fetch experiences" });
    }
  });
  
  app.get("/api/admin/experiences/pending", isAuthenticated, async (req: any, res) => {
    try {
      // TODO: Add admin role check
      const pendingExperiences = await storage.getPendingExperiences();
      // Enrich with MVG progress from single source of truth
      const enrichedExperiences = await Promise.all(
        pendingExperiences.map(async (exp) => {
          const mvgProgress = await storage.getMVGProgress(exp.id);
          const mvgMet = mvgProgress.mvg_met;
          const resolvedMvgStatus = mvgMet ? 'met' : (exp.mvgStatus || 'pending');
          return {
            ...exp,
            currentParticipants: mvgProgress.current_participants,
            participantCount: mvgProgress.current_participants,
            mvgMet,
            mvgStatus: resolvedMvgStatus,
            lifecycleStatus: computeLifecycleStatus({ ...exp, mvgStatus: resolvedMvgStatus, mvgMet }),
          };
        })
      );
      res.json(enrichedExperiences);
    } catch (error) {
      console.error("Error fetching pending experiences:", error);
      res.status(500).json({ message: "Failed to fetch pending experiences" });
    }
  });

  app.post("/api/admin/experiences/:id/approve", isAuthenticated, async (req: any, res) => {
    try {
      const userId = process.env.NODE_ENV === 'development' ? "45788955" : req.user?.claims?.sub;
      const isAdmin = await checkIsAdmin(req);
      
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      if (!isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { reviewNotes } = req.body;
      const experience = await storage.approveExperience(req.params.id, userId, reviewNotes);
      res.json(experience);
    } catch (error) {
      console.error("Error approving experience:", error);
      res.status(500).json({ message: "Failed to approve experience" });
    }
  });

  app.post("/api/admin/experiences/:id/reject", isAuthenticated, async (req: any, res) => {
    try {
      const userId = process.env.NODE_ENV === 'development' ? "45788955" : req.user?.claims?.sub;
      const isAdmin = await checkIsAdmin(req);
      
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      if (!isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { reviewNotes } = req.body;
      const experience = await storage.rejectExperience(req.params.id, userId, reviewNotes);
      res.json(experience);
    } catch (error) {
      console.error("Error rejecting experience:", error);
      res.status(500).json({ message: "Failed to reject experience" });
    }
  });

  // ========================================================================
  // TRIPS ENDPOINTS (Aliases for experiences - cleaner API naming)
  // ========================================================================

  // POST /api/trips - Create a new trip draft
  app.post("/api/trips", isAuthenticated, async (req: any, res) => {
    try {
      const userId = process.env.NODE_ENV === 'development' ? "45788955" : req.user.claims.sub;
      
      // Normalize date fields before saving
      const parsedBody = { ...req.body };
      
      // Convert date strings to valid Date objects or null if invalid
      if (parsedBody.startDate) {
        const date = new Date(parsedBody.startDate);
        parsedBody.startDate = !isNaN(date.getTime()) ? date : null;
      }
      if (parsedBody.endDate) {
        const date = new Date(parsedBody.endDate);
        parsedBody.endDate = !isNaN(date.getTime()) ? date : null;
      }
      if (parsedBody.mvgDeadline) {
        const date = new Date(parsedBody.mvgDeadline);
        parsedBody.mvgDeadline = !isNaN(date.getTime()) ? date : null;
      }
      
      const draftData = { ...parsedBody, creatorId: userId };
      const draft = await storage.createExperienceDraft(draftData);
      res.json(draft);
    } catch (error) {
      console.error("Error creating trip draft:", error);
      res.status(500).json({ message: "Failed to create trip draft" });
    }
  });

  // PUT /api/trips/:id - Update a trip draft
  app.put("/api/trips/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = process.env.NODE_ENV === 'development' ? "45788955" : req.user.claims.sub;
      const { id } = req.params;
      
      // Normalize date fields before saving
      const updateData = { ...req.body };
      
      // Convert date strings to valid Date objects or null if invalid
      if (updateData.startDate) {
        const date = new Date(updateData.startDate);
        updateData.startDate = !isNaN(date.getTime()) ? date : null;
      }
      if (updateData.endDate) {
        const date = new Date(updateData.endDate);
        updateData.endDate = !isNaN(date.getTime()) ? date : null;
      }
      if (updateData.mvgDeadline) {
        const date = new Date(updateData.mvgDeadline);
        updateData.mvgDeadline = !isNaN(date.getTime()) ? date : null;
      }
      
      const draft = await storage.updateExperienceDraft(id, updateData, userId);
      res.json(draft);
    } catch (error) {
      console.error("Error updating trip draft:", error);
      res.status(500).json({ message: "Failed to update trip draft" });
    }
  });

  // POST /api/trips/:id/submit - Submit trip for admin review
  app.post("/api/trips/:id/submit", isAuthenticated, async (req: any, res) => {
    try {
      const userId = process.env.NODE_ENV === 'development' ? "45788955" : req.user.claims.sub;
      const draftId = req.params.id;
      
      // Verify draft exists and belongs to user
      const existingDraft = await storage.getExperienceDraft(draftId, userId);
      if (!existingDraft) {
        return res.status(404).json({ 
          success: false,
          message: "Trip draft not found" 
        });
      }
      
      // Basic validation for submission
      const errors: string[] = [];
      
      if (!existingDraft.title || existingDraft.title.trim() === '') {
        errors.push("Title is required");
      }
      if (!existingDraft.description || existingDraft.description.trim() === '') {
        errors.push("Description is required");
      }
      if (!existingDraft.startDate) {
        errors.push("Start date is required");
      }
      if (!existingDraft.location || existingDraft.location.trim() === '') {
        errors.push("Location is required");
      }
      if (!existingDraft.price || parseFloat(existingDraft.price) <= 0) {
        errors.push("Valid price is required");
      }
      
      if (errors.length > 0) {
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors
        });
      }
      
      // Convert draft to experience with pending_approval status
      const experienceData = {
        ...existingDraft,
        creatorId: userId,
        status: "pending_approval" as any,
        submittedAt: new Date()
      };
      
      // Create the experience from the draft
      const experience = await storage.createExperience(experienceData as any);
      
      // Delete the draft
      await storage.deleteExperienceDraft(draftId, userId);
      
      res.json({
        success: true,
        message: "Trip submitted for review",
        experience
      });
    } catch (error) {
      console.error("Error submitting trip:", error);
      res.status(500).json({ 
        success: false,
        message: "Failed to submit trip", 
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  // POST /api/trips/:id/deposit - Create a deposit/reservation for a trip with auto-MVG confirmation
  app.post("/api/trips/:id/deposit", isAuthenticated, async (req: any, res) => {
    try {
      const userId = process.env.NODE_ENV === 'development' ? "45788955" : req.user.claims.sub;
      const { id: experienceId } = req.params;
      const { amount, payment_method_nonce } = req.body;

      // Validate request body
      if (!amount || typeof amount !== 'number' || amount <= 0) {
        return res.status(400).json({
          success: false,
          message: "Valid deposit amount is required"
        });
      }

      let paymentIntentId: string | undefined;
      let sandboxMode = false;

      // Handle sandbox testing or real Stripe payment
      if (payment_method_nonce === 'sandbox_test') {
        // Sandbox mode for testing
        const sandboxResult = await paymentService.createSandboxCharge({
          userId,
          experienceId,
          amount,
          paymentMethodNonce: payment_method_nonce
        });
        paymentIntentId = sandboxResult.paymentIntentId;
        sandboxMode = true;
      } else {
        // Real Stripe payment - create payment intent
        const paymentResult = await paymentService.createDepositIntent({
          userId,
          experienceId,
          amount
        });
        paymentIntentId = paymentResult.paymentIntentId;
      }
      
      // Create the deposit booking
      const booking = await storage.createDeposit(
        experienceId,
        userId,
        amount,
        paymentIntentId
      );

      // Get the updated experience to calculate funded amounts
      const experience = await storage.getExperience(experienceId);
      
      if (!experience) {
        return res.status(404).json({
          success: false,
          message: "Experience not found"
        });
      }

      // Calculate funded metrics (include both confirmed and pending)
      const allBookings = await storage.getBookingsByExperience(experienceId);
      
      const confirmedAmount = allBookings
        .filter(b => b.status === "confirmed")
        .reduce((sum, b) => sum + Number(b.amount), 0);
      
      const pendingAmount = allBookings
        .filter(b => b.status === "pending")
        .reduce((sum, b) => sum + Number(b.amount), 0);
      
      const totalFundedAmount = confirmedAmount + pendingAmount;
      
      const confirmedSeats = allBookings.filter(b => b.status === "confirmed").length;
      const pendingSeats = allBookings.filter(b => b.status === "pending").length;
      const totalSeats = confirmedSeats + pendingSeats;
      
      const minimumParticipants = experience.minimumParticipants || 0;
      const price = Number(experience.price);
      const mvgTargetAmount = price * minimumParticipants;
      const fundedPercent = mvgTargetAmount > 0 ? (totalFundedAmount / mvgTargetAmount) * 100 : 0;
      const remainingToMvg = Math.max(0, mvgTargetAmount - totalFundedAmount);

      // Send deposit created notification (to participant)
      try {
        await notificationService.sendDepositCreatedNotification(userId, experience, booking);
      } catch (notifError) {
        console.error('Error sending deposit notification:', notifError);
      }

      // Send new-member notification to creator
      if (experience.creatorId && experience.creatorId !== userId) {
        try {
          await notificationService.sendCreatorNewMemberNotification(experience.creatorId, experience, userId);
        } catch (creatorNotifError) {
          console.error('Error sending creator new-member notification:', creatorNotifError);
        }
      }

      // Check if MVG is now met and auto-confirm
      let mvgConfirmed = false;
      let mvgMessage = "Deposit created successfully";
      
      if (experience.requireMinimumParticipants && totalSeats >= minimumParticipants) {
        try {
          console.log(`[MVG Auto-Confirm] Minimum participants reached for ${experienceId}. Auto-confirming...`);
          await storage.processMVGSuccess(experienceId);
          mvgConfirmed = true;
          mvgMessage = "Community Confirmed! The minimum group size has been reached!";
          
          // Send MVG confirmed notifications to all participants
          const mvgBookings = allBookings.filter(b => b.status === "confirmed" || b.status === "pending");
          await notificationService.sendMVGConfirmedNotification(experience, mvgBookings);
          console.log(`[MVG Auto-Confirm] Trip ${experienceId} confirmed - notifications sent to ${mvgBookings.length} participants`);
        } catch (mvgError) {
          console.error(`[MVG Auto-Confirm] Error processing MVG success for ${experienceId}:`, mvgError);
        }
      }

      const mvgStatus = {
        funded_amount: totalFundedAmount,
        funded_amount_confirmed: confirmedAmount,
        funded_amount_pending: pendingAmount,
        funded_percent: Math.round(fundedPercent * 100) / 100,
        remaining_to_mvg: remainingToMvg,
        seats_taken: totalSeats,
        seats_confirmed: confirmedSeats,
        seats_pending: pendingSeats,
        seats_total: experience.maxParticipants,
        mvg_confirmed: mvgConfirmed
      };

      // Broadcast real-time MVG update via WebSocket (includes lifecycle flip when MVG is met)
      const participants = await storage.getExperienceParticipantAvatars(experienceId);
      broadcastMVGUpdate({
        trip_id: experienceId,
        seats_taken: totalSeats,
        funded_amount: totalFundedAmount,
        funded_percent: Math.round(fundedPercent * 100) / 100,
        participants,
        mvg_met: mvgConfirmed,
        lifecycle_status: mvgConfirmed ? 'confirmed' : 'forming',
      });

      res.json({
        success: true,
        message: mvgMessage,
        booking,
        mvg_status: mvgStatus,
        payment_intent_id: paymentIntentId,
        sandbox_mode: sandboxMode
      });
    } catch (error) {
      console.error("Error creating deposit:", error);
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : "Failed to create deposit"
      });
    }
  });

  // POST /api/trips/:id/mvg/check-success - Check and process MVG success
  // QA-ONLY: Force MVG success for testing. Broadcasts WebSocket update so all browsers flip to CONFIRMED.
  app.post("/api/trips/:id/mvg/check-success", isAuthenticated, async (req: any, res) => {
    try {
      const { id: experienceId } = req.params;
      
      const result = await storage.processMVGSuccess(experienceId);

      // Broadcast lifecycle flip via WebSocket so all open browsers update immediately
      const mvgParticipants = await storage.getExperienceParticipantAvatars(experienceId);
      const mvgProgressData = await storage.getMVGProgress(experienceId);
      broadcastMVGUpdate({
        trip_id: experienceId,
        seats_taken: mvgProgressData.current_participants,
        funded_amount: 0,
        funded_percent: 100,
        participants: mvgParticipants,
        mvg_met: true,
        lifecycle_status: 'confirmed',
      });
      
      res.json({
        success: true,
        message: `MVG met! ${result.confirmedBookings} deposits confirmed`,
        experience: result.experience,
        confirmed_bookings: result.confirmedBookings
      });
    } catch (error) {
      console.error("Error processing MVG success:", error);
      res.status(400).json({
        success: false,
        message: error instanceof Error ? error.message : "Failed to process MVG success"
      });
    }
  });

  // POST /api/trips/:id/mvg/check-failure - Check and process MVG failure
  app.post("/api/trips/:id/mvg/check-failure", isAuthenticated, async (req: any, res) => {
    try {
      const { id: experienceId } = req.params;
      
      const result = await storage.processMVGFailure(experienceId);
      
      res.json({
        success: true,
        message: `MVG failed. ${result.refundedBookings} deposits refunded`,
        experience: result.experience,
        refunded_bookings: result.refundedBookings
      });
    } catch (error) {
      console.error("Error processing MVG failure:", error);
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : "Failed to process MVG failure"
      });
    }
  });

  // ========================================================================
  // PAYMENT ENDPOINTS (Stripe integration for deposits, capture, refunds)
  // ========================================================================

  // POST /api/payments/create-intent - Create payment intent for deposit
  app.post("/api/payments/create-intent", isAuthenticated, async (req: any, res) => {
    try {
      const userId = process.env.NODE_ENV === 'development' ? "45788955" : req.user.claims.sub;
      const { experienceId, amount, paymentMethodNonce } = req.body;

      if (!experienceId || typeof experienceId !== 'string') {
        return res.status(400).json({
          success: false,
          message: "Valid experienceId is required"
        });
      }

      if (!amount || typeof amount !== 'number' || amount <= 0 || !Number.isFinite(amount)) {
        return res.status(400).json({
          success: false,
          message: "Valid positive amount is required"
        });
      }

      if (paymentMethodNonce === 'sandbox_test') {
        const result = await paymentService.createSandboxCharge({
          userId,
          experienceId,
          amount,
          paymentMethodNonce
        });

        return res.json({
          success: true,
          paymentIntentId: result.paymentIntentId,
          clientSecret: null,
          sandboxMode: true
        });
      }

      const result = await paymentService.createDepositIntent({
        userId,
        experienceId,
        amount
      });

      res.json({
        success: true,
        clientSecret: result.clientSecret,
        paymentIntentId: result.paymentIntentId,
        amount: result.amount,
        sandboxMode: false
      });
    } catch (error: any) {
      console.error("Error creating payment intent:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to create payment intent"
      });
    }
  });

  // POST /api/payments/capture - Capture payment when MVG met (admin only)
  app.post("/api/payments/capture", isAuthenticated, async (req: any, res) => {
    try {
      const isAdmin = await checkIsAdmin(req);
      
      if (!isAdmin) {
        return res.status(403).json({
          success: false,
          message: "Admin access required"
        });
      }

      const { paymentIntentId, bookingId, experienceId } = req.body;

      if (!paymentIntentId || typeof paymentIntentId !== 'string') {
        return res.status(400).json({
          success: false,
          message: "Valid paymentIntentId is required"
        });
      }

      if (paymentIntentId.startsWith('pi_sandbox_')) {
        return res.json({
          success: true,
          paymentIntentId,
          amount: 0,
          status: 'succeeded',
          captured: true,
          sandboxMode: true,
          message: "Sandbox payment auto-captured"
        });
      }

      const result = await paymentService.capturePayment({
        paymentIntentId,
        bookingId,
        experienceId
      });

      res.json({
        success: true,
        ...result,
        sandboxMode: false
      });
    } catch (error: any) {
      console.error("Error capturing payment:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to capture payment"
      });
    }
  });

  // POST /api/payments/refund - Refund payment when MVG failed (admin only)
  app.post("/api/payments/refund", isAuthenticated, async (req: any, res) => {
    try {
      const isAdmin = await checkIsAdmin(req);
      
      if (!isAdmin) {
        return res.status(403).json({
          success: false,
          message: "Admin access required"
        });
      }

      const { paymentIntentId, bookingId, experienceId, amount, reason } = req.body;

      if (!paymentIntentId || typeof paymentIntentId !== 'string') {
        return res.status(400).json({
          success: false,
          message: "Valid paymentIntentId is required"
        });
      }

      if (paymentIntentId.startsWith('pi_sandbox_')) {
        return res.json({
          success: true,
          refundId: `re_sandbox_${Date.now()}`,
          paymentIntentId,
          amount: amount || 0,
          status: 'succeeded',
          reason: reason || 'mvg_failed',
          sandboxMode: true,
          message: "Sandbox payment auto-refunded"
        });
      }

      const result = await paymentService.refundPayment({
        paymentIntentId,
        bookingId,
        experienceId,
        amount,
        reason
      });

      res.json({
        success: true,
        ...result,
        sandboxMode: false
      });
    } catch (error: any) {
      console.error("Error refunding payment:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to refund payment"
      });
    }
  });

  // GET /api/payments/logs - Get payment logs for debugging (dev/admin only)
  app.get("/api/payments/logs", isAuthenticated, async (req: any, res) => {
    try {
      const isDev = process.env.NODE_ENV === 'development';
      const isAdmin = await checkIsAdmin(req);
      
      if (!isDev && !isAdmin) {
        return res.status(403).json({
          success: false,
          message: "Development or admin access required"
        });
      }

      const logs = paymentService.getPaymentLogs();
      
      res.json({
        success: true,
        logs,
        count: logs.length
      });
    } catch (error: any) {
      console.error("Error fetching payment logs:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch payment logs"
      });
    }
  });

  // GET /api/admin/trips - List pending trips for admin review
  app.get("/api/admin/trips", isAuthenticated, async (req: any, res) => {
    try {
      const isAdmin = await checkIsAdmin(req);
      
      if (!isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const pendingExperiences = await storage.getPendingExperiences();
      res.json(pendingExperiences);
    } catch (error) {
      console.error("Error fetching pending trips:", error);
      res.status(500).json({ message: "Failed to fetch pending trips" });
    }
  });

  // POST /api/admin/trips/:id/approve - Approve a trip
  app.post("/api/admin/trips/:id/approve", isAuthenticated, async (req: any, res) => {
    try {
      const userId = process.env.NODE_ENV === 'development' ? "45788955" : req.user?.claims?.sub;
      const isAdmin = await checkIsAdmin(req);
      
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      if (!isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { reviewNotes } = req.body;
      const experience = await storage.approveExperience(req.params.id, userId, reviewNotes);
      res.json(experience);
    } catch (error) {
      console.error("Error approving trip:", error);
      res.status(500).json({ message: "Failed to approve trip" });
    }
  });

  // Legacy signed-URL endpoint — redirects callers to the direct upload endpoint.
  // All uploads now go through POST /api/uploads/images which uses Supabase Storage.
  app.post("/api/objects/upload", isAuthenticated, async (_req, res) => {
    try {
      res.status(410).json({
        error: "This endpoint is deprecated. Use POST /api/uploads/images with multipart/form-data instead.",
      });
    } catch (error) {
      console.error("Error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.put("/api/objects", isAuthenticated, async (req: any, res) => {
    if (!req.body.imageUrl) {
      return res.status(400).json({ error: "imageUrl is required" });
    }

    const userId = req.user?.claims?.sub;

    try {
      const objectStorageService = new ObjectStorageService();
      const objectPath = await objectStorageService.trySetObjectEntityAclPolicy(
        req.body.imageUrl,
        {
          owner: userId,
          visibility: "public",
        },
      );

      res.status(200).json({
        objectPath: objectPath,
      });
    } catch (error) {
      console.error("Error setting image policy:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Direct image upload endpoint
  app.post("/api/uploads/images", isAuthenticated, upload.single('image'), async (req: any, res) => {
    try {
      // Check if file was uploaded
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const userId = req.user.claims.sub;

      const file = req.file;

      // Magic-byte validation — only allow real images
      const detectedType = await fileTypeFromBuffer(file.buffer);
      const allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];

      if (!detectedType || !allowedMimes.includes(detectedType.mime)) {
        return res.status(400).json({
          error: "Invalid file type. Only JPEG, PNG, or WebP images are allowed.",
        });
      }

      if (file.mimetype !== detectedType.mime) {
        return res.status(400).json({
          error: "File type mismatch. Declared MIME type does not match file content.",
        });
      }

      if (file.size > 10 * 1024 * 1024) {
        return res.status(413).json({ error: "File too large. Maximum size is 10MB." });
      }

      // Upload to Supabase Storage
      const publicUrl = await uploadImageToSupabase(file.buffer, detectedType.mime, userId);

      res.status(200).json({
        url: publicUrl,
        contentType: detectedType.mime,
        size: file.size,
        message: "Image uploaded successfully",
      });

    } catch (error) {
      console.error("Error uploading image:", error);
      
      // Enhanced multer error handling with proper status codes
      if (error instanceof multer.MulterError) {
        switch (error.code) {
          case 'LIMIT_FILE_SIZE':
            return res.status(413).json({ error: "File too large. Maximum size is 10MB." });
          case 'LIMIT_UNEXPECTED_FILE':
            return res.status(400).json({ error: "Unexpected file field. Expected 'image' field." });
          case 'LIMIT_FILE_COUNT':
            return res.status(400).json({ error: "Too many files. Only one file allowed." });
          default:
            return res.status(400).json({ error: error.message || "File upload error" });
        }
      }
      
      // Handle other specific errors with appropriate status codes
      if (error instanceof Error) {
        if (error.message.includes('Upload failed with status')) {
          return res.status(502).json({ 
            error: "Failed to upload to storage service", 
            details: error.message 
          });
        }
        if (error.message.includes('not authenticated')) {
          return res.status(401).json({ error: error.message });
        }
      }
      
      res.status(500).json({ error: "Failed to upload image" });
    }
  });

  // Document upload endpoint (PDFs) — Supabase Storage
  const documentUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      if (file.mimetype === 'application/pdf') cb(null, true);
      else cb(new Error('Only PDF files are allowed'));
    },
  });

  app.post("/api/uploads/documents", isAuthenticated, documentUpload.single('file'), async (req: any, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: "No file uploaded" });

      const userId = req.user.claims.sub;
      const publicUrl = await uploadDocumentToSupabase(req.file.buffer, req.file.mimetype, userId);

      res.status(200).json({ url: publicUrl, message: "Document uploaded successfully" });
    } catch (error) {
      console.error("Error uploading document:", error);
      res.status(500).json({ error: "Failed to upload document" });
    }
  });

  // Stripe payment routes
  app.post("/api/create-payment-intent", async (req, res) => {
    try {
      const { amount, experienceId, ticketSkuId, paymentMode } = req.body;
      
      const experience = await storage.getExperience(experienceId);
      if (!experience) {
        return res.status(404).json({ message: "Experience not found" });
      }

      const isMVGExperience = experience.requireMinimumParticipants;
      const ticketSkus = experience.ticketSkus as any[] || [];
      
      let selectedTicket: any = null;
      if (ticketSkuId && ticketSkus.length > 0) {
        selectedTicket = ticketSkus.find((t: any, i: number) => 
          (t.id || t.sourceRoomId || `ticket-${i}`) === ticketSkuId
        );
      }
      
      const fullPrice = selectedTicket 
        ? parseFloat(selectedTicket.pricePerPerson || 0)
        : amount;
      
      const fixedDeposit = selectedTicket?.depositPerPerson
        ? parseFloat(selectedTicket.depositPerPerson)
        : (experience.depositAmount ? parseFloat(experience.depositAmount.toString()) : 0);
      const hasDeposit = experience.depositEnabled && fixedDeposit > 0;
      
      const ticketName = selectedTicket?.ticketName || selectedTicket?.name || null;
      
      let chargeAmount = fullPrice;
      let depositAmount = 0;
      let balanceAmount = 0;
      let isDepositPayment = false;

      if (hasDeposit) {
        depositAmount = fixedDeposit;
        balanceAmount = fullPrice - depositAmount;
        if (paymentMode === 'full') {
          chargeAmount = fullPrice;
          isDepositPayment = false;
        } else {
          chargeAmount = depositAmount;
          isDepositPayment = true;
        }
      }
      
      const paymentIntentData: any = {
        amount: Math.round(chargeAmount * 100),
        currency: (experience.currency || "eur").toLowerCase(),
        automatic_payment_methods: {
          enabled: true,
        },
        metadata: { 
          experienceId, 
          ticketSkuId: ticketSkuId || "",
          ticketName: ticketName || "",
          isMVGExperience: isMVGExperience?.toString() || "false",
          isDepositPayment: isDepositPayment.toString(),
          fullPrice: fullPrice.toString(),
          depositAmount: depositAmount.toString(),
          balanceAmount: balanceAmount.toString(),
          mvgMin: (experience.mvgMin || experience.minimumParticipants || 0).toString(),
          mvgDeadline: experience.mvgDeadline || ""
        },
      };

      if (isMVGExperience && !hasDeposit) {
        paymentIntentData.capture_method = "manual";
        paymentIntentData.confirmation_method = "automatic";
      } else if (isMVGExperience && hasDeposit) {
        paymentIntentData.setup_future_usage = "off_session";
      }

      const paymentIntent = await stripe.paymentIntents.create(paymentIntentData);
      res.json({ 
        clientSecret: paymentIntent.client_secret,
        isMVGExperience,
        isDepositPayment,
        depositAmount,
        balanceAmount,
        fullPrice,
        ticketName,
        ticketSkuId: ticketSkuId || null,
        mvgMin: experience.mvgMin || experience.minimumParticipants,
        mvgDeadline: experience.mvgDeadline,
        paymentMode: isDepositPayment ? 'deposit' : 'full',
        hasDeposit
      });
    } catch (error: any) {
      res.status(500).json({ message: "Error creating payment intent: " + error.message });
    }
  });

  // Get booking stats for MVG experiences
  app.get("/api/experiences/:id/booking-stats", async (req, res) => {
    try {
      const experienceId = req.params.id;
      const bookings = await storage.getBookingsByExperience(experienceId);
      
      const currentBookings = bookings.filter(b => b.status === "confirmed" || b.status === "pending").length;
      const confirmedBookings = bookings.filter(b => b.status === "confirmed").length;
      
      res.json({ currentBookings, confirmedBookings });
    } catch (error: any) {
      res.status(500).json({ message: "Error fetching booking stats: " + error.message });
    }
  });

  // Get MVG progress for experience - using single source of truth
  app.get("/api/experiences/:id/mvg-progress", async (req, res) => {
    try {
      const experienceId = req.params.id;
      const experience = await storage.getExperience(experienceId);
      
      if (!experience) {
        return res.status(404).json({ message: "Experience not found" });
      }

      // Use getMVGProgress as single source of truth
      const mvgProgress = await storage.getMVGProgress(experienceId);
      const percentage = mvgProgress.minimum_participants > 0 
        ? Math.round((mvgProgress.current_participants / mvgProgress.minimum_participants) * 100)
        : 0;
      
      res.json({ 
        currentBookings: mvgProgress.current_participants,
        mvgMin: mvgProgress.minimum_participants,
        percentage,
        mvgDeadline: experience.mvgDeadline,
        mvgStatus: mvgProgress.mvg_met ? 'met' : (experience.mvgStatus || 'pending'),
        current_participants: mvgProgress.current_participants,
        minimum_participants: mvgProgress.minimum_participants,
        mvg_met: mvgProgress.mvg_met
      });
    } catch (error: any) {
      res.status(500).json({ message: "Error fetching MVG progress: " + error.message });
    }
  });

  // Public social proof endpoint — returns real committed participants + total count
  // No auth required: only shows avatars/names, not personal details
  app.get("/api/experiences/:id/social-proof", async (req, res) => {
    try {
      const { id } = req.params;
      const experience = await storage.getExperience(id);
      if (!experience) {
        return res.status(404).json({ message: "Experience not found" });
      }
      const data = await storage.getExperienceSocialProof(id);
      res.json(data);
    } catch (error: any) {
      res.status(500).json({ message: "Error fetching social proof: " + error.message });
    }
  });

  // Capture deposits when MVG is met (idempotent, fail-safe)
  app.post("/api/experiences/:id/capture-deposits", isAuthenticated, async (req: any, res) => {
    const experienceId = req.params.id;
    const captureLog: Array<{ bookingId: string; status: string; error?: string }> = [];
    
    try {
      // Step 1: Verify experience exists and requires MVG
      const experience = await storage.getExperience(experienceId);
      if (!experience) {
        return res.status(404).json({ message: "Experience not found" });
      }
      
      if (!experience.requireMinimumParticipants) {
        return res.status(400).json({ 
          message: "Experience does not require minimum participants",
          captured: 0,
          captureLog 
        });
      }
      
      // Step 2: Re-check MVG status (single source of truth)
      const mvgProgress = await storage.getMVGProgress(experienceId);
      
      if (!mvgProgress.mvg_met) {
        return res.status(400).json({ 
          message: "MVG not met - cannot capture deposits",
          current_participants: mvgProgress.current_participants,
          minimum_participants: mvgProgress.minimum_participants,
          captured: 0,
          captureLog
        });
      }
      
      // Step 3: Get eligible bookings (deposit_authorized, not yet captured)
      const eligibleBookings = await storage.getEligibleDepositsForCapture(experienceId);
      
      if (eligibleBookings.length === 0) {
        return res.json({ 
          message: "No deposits to capture (already processed or none eligible)",
          captured: 0,
          captureLog
        });
      }
      
      // Step 4: Capture each deposit with Stripe (handle partial failures)
      let capturedCount = 0;
      
      for (const booking of eligibleBookings) {
        try {
          // Skip if no payment intent ID
          if (!booking.stripePaymentIntentId) {
            captureLog.push({ 
              bookingId: booking.id, 
              status: "skipped", 
              error: "No Stripe payment intent ID" 
            });
            continue;
          }
          
          // Capture only the deposit amount from Stripe
          const depositAmountCents = Math.round(parseFloat(booking.depositAmount || "0") * 100);
          
          if (depositAmountCents <= 0) {
            captureLog.push({ 
              bookingId: booking.id, 
              status: "skipped", 
              error: "No deposit amount" 
            });
            continue;
          }
          
          // Call Stripe to capture the payment
          await stripe.paymentIntents.capture(booking.stripePaymentIntentId, {
            amount_to_capture: depositAmountCents,
          });
          
          // Update booking in database
          await storage.markDepositAsCaptured(booking.id);
          
          capturedCount++;
          captureLog.push({ bookingId: booking.id, status: "captured" });
          
          console.log(`[MVG Capture] Captured deposit for booking ${booking.id}: $${booking.depositAmount}`);
          
        } catch (stripeError: any) {
          // Log error but continue with other bookings
          console.error(`[MVG Capture] Failed to capture booking ${booking.id}:`, stripeError.message);
          captureLog.push({ 
            bookingId: booking.id, 
            status: "failed", 
            error: stripeError.message 
          });
        }
      }
      
      // Step 5: Update experience MVG status if any deposits were captured
      if (capturedCount > 0) {
        await storage.updateExperienceMVGStatus(experienceId, "met");
      }
      
      res.json({
        message: capturedCount > 0 
          ? `Successfully captured ${capturedCount} deposit(s)` 
          : "No deposits were captured",
        captured: capturedCount,
        total: eligibleBookings.length,
        captureLog
      });
      
    } catch (error: any) {
      console.error("[MVG Capture] Error:", error);
      res.status(500).json({ 
        message: "Error capturing deposits: " + error.message,
        captured: 0,
        captureLog 
      });
    }
  });

  // Refund/cancel deposits when MVG fails (idempotent, fail-safe)
  app.post("/api/experiences/:id/refund-deposits", isAuthenticated, async (req: any, res) => {
    const experienceId = req.params.id;
    const refundLog: Array<{ bookingId: string; status: string; error?: string }> = [];
    
    try {
      // Step 1: Verify experience exists and requires MVG
      const experience = await storage.getExperience(experienceId);
      if (!experience) {
        return res.status(404).json({ message: "Experience not found" });
      }
      
      if (!experience.requireMinimumParticipants) {
        return res.status(400).json({ 
          message: "Experience does not require minimum participants",
          refunded: 0,
          refundLog 
        });
      }
      
      // Step 2: Check MVG status - only refund if NOT met
      const mvgProgress = await storage.getMVGProgress(experienceId);
      
      if (mvgProgress.mvg_met) {
        return res.status(400).json({ 
          message: "MVG is met - cannot refund deposits (use capture instead)",
          current_participants: mvgProgress.current_participants,
          minimum_participants: mvgProgress.minimum_participants,
          refunded: 0,
          refundLog
        });
      }
      
      // Step 3: Get eligible bookings (deposit_authorized, not captured, not cancelled)
      const eligibleBookings = await storage.getEligibleBookingsForRefund(experienceId);
      
      if (eligibleBookings.length === 0) {
        return res.json({ 
          message: "No deposits to refund (already processed or none eligible)",
          refunded: 0,
          refundLog
        });
      }
      
      // Step 4: Cancel each PaymentIntent with Stripe (handle partial failures)
      let refundedCount = 0;
      
      for (const booking of eligibleBookings) {
        try {
          // Skip if no payment intent ID
          if (!booking.stripePaymentIntentId) {
            refundLog.push({ 
              bookingId: booking.id, 
              status: "skipped", 
              error: "No Stripe payment intent ID" 
            });
            // Still mark as cancelled since there's nothing to refund
            await storage.markBookingAsRefunded(booking.id);
            refundedCount++;
            continue;
          }
          
          // Cancel the Stripe PaymentIntent (releases authorized funds)
          await stripe.paymentIntents.cancel(booking.stripePaymentIntentId);
          
          // Update booking in database
          await storage.markBookingAsRefunded(booking.id);
          
          refundedCount++;
          refundLog.push({ bookingId: booking.id, status: "refunded" });
          
          console.log(`[MVG Refund] Cancelled authorization for booking ${booking.id}`);
          
        } catch (stripeError: any) {
          // Log error but continue with other bookings
          console.error(`[MVG Refund] Failed to cancel booking ${booking.id}:`, stripeError.message);
          refundLog.push({ 
            bookingId: booking.id, 
            status: "failed", 
            error: stripeError.message 
          });
        }
      }
      
      // Step 5: Update experience MVG status if any refunds were processed
      if (refundedCount > 0) {
        await storage.updateExperienceMVGStatus(experienceId, "failed");
      }
      
      res.json({
        message: refundedCount > 0 
          ? `Successfully cancelled ${refundedCount} authorization(s)` 
          : "No authorizations were cancelled",
        refunded: refundedCount,
        total: eligibleBookings.length,
        refundLog
      });
      
    } catch (error: any) {
      console.error("[MVG Refund] Error:", error);
      res.status(500).json({ 
        message: "Error refunding deposits: " + error.message,
        refunded: 0,
        refundLog 
      });
    }
  });

  // Manual trigger for MVG scheduler (for testing - requires authentication)
  app.post("/api/admin/mvg-scheduler/run", isAuthenticated, async (req: any, res) => {
    try {
      const { processMVGDeadlines } = await import('./mvg-scheduler');
      const results = await processMVGDeadlines();
      res.json({
        message: "MVG scheduler run complete",
        ...results
      });
    } catch (error: any) {
      console.error("[MVG Scheduler Manual] Error:", error);
      res.status(500).json({ message: "Error running MVG scheduler: " + error.message });
    }
  });

  // Generate shareable invite link for experience
  app.get("/api/experiences/:id/invite-link", isAuthenticated, async (req: any, res) => {
    try {
      const experienceId = req.params.id;
      const userId = req.user.claims.sub;
      
      // Verify experience exists
      const experience = await storage.getExperience(experienceId);
      if (!experience) {
        return res.status(404).json({ message: "Experience not found" });
      }

      // Generate unique invite link with user reference
      const baseUrl = getAppBaseUrl(req);
      const inviteLink = `${baseUrl}/event/${experienceId}?ref=${userId}`;
      
      res.json({ 
        inviteLink,
        experienceId,
        referrerId: userId,
        experienceTitle: experience.title
      });
    } catch (error: any) {
      res.status(500).json({ message: "Error generating invite link: " + error.message });
    }
  });

  // Get user details by ID (for referrer information)
  app.get('/api/users/:id', async (req, res) => {
    try {
      const userId = req.params.id;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const creatorProfile = await storage.getCreatorProfileByUserId(userId);
      const socialLinks = creatorProfile?.socialLinks || {};
      const socialLink = socialLinks.website || socialLinks.instagram || socialLinks.linkedin || socialLinks.youtube || null;

      // Return limited user info for privacy
      res.json({
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        profileImageUrl: user.profileImageUrl,
        displayName: creatorProfile?.displayName || null,
        profilePhoto: creatorProfile?.profilePhoto || null,
        tagline: creatorProfile?.tagline || null,
        bio: creatorProfile?.bio || null,
        location: creatorProfile?.location || null,
        expertiseTags: creatorProfile?.expertiseTags || [],
        socialLink,
      });
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Manual MVG check for specific experience
  app.post("/api/mvg/check-experience/:id", isAuthenticated, async (req: any, res) => {
    try {
      const experienceId = req.params.id;
      const experience = await storage.getExperience(experienceId);
      
      if (!experience) {
        return res.status(404).json({ message: "Experience not found" });
      }

      if (!experience.requireMinimumParticipants) {
        return res.status(400).json({ message: "Experience does not have MVG enabled" });
      }

      const bookings = await storage.getBookingsByExperience(experienceId);
      const currentBookings = bookings.filter(b => b.status === "confirmed" || b.status === "pending").length;
      const mvgMin = experience.mvgMin || experience.minimumParticipants || 6;
      const now = new Date();
      const deadlinePassed = experience.mvgDeadline ? new Date(experience.mvgDeadline) <= now : false;

      let result = {
        experienceId,
        currentBookings,
        required: mvgMin,
        mvgDeadline: experience.mvgDeadline,
        deadlinePassed,
        status: experience.mvgStatus,
        action: "none"
      };

      // Check if we should process this experience
      if (experience.mvgStatus === "pending") {
        if (currentBookings >= mvgMin) {
          // Minimum reached - capture payments
          await confirmMVGEvent(experienceId, bookings);
          await storage.updateExperienceMVGStatus(experienceId, "met");
          // Lock commissions for all promoter-attributed bookings
          await lockCommissionsForExperience(experienceId);
          result.action = "confirmed";
          result.status = "met";
        } else if (deadlinePassed) {
          // Deadline passed without meeting minimum - refund
          await refundMVGParticipants(experienceId, bookings);
          await storage.updateExperienceMVGStatus(experienceId, "failed");
          // Void commissions for all promoter-attributed bookings
          await voidCommissionsForExperience(experienceId);
          result.action = "refunded";
          result.status = "failed";
        }
      }

      res.json(result);
    } catch (error: any) {
      console.error("Error checking MVG experience:", error);
      res.status(500).json({ message: "Error checking MVG experience: " + error.message });
    }
  });

  // Check and process MVG deadlines (cron job endpoint)
  app.post("/api/mvg/check-deadlines", async (req, res) => {
    try {
      const experiences = await storage.getAllMVGExperiences();
      const now = new Date();
      const processedExperiences = [];

      for (const experience of experiences) {
        // Skip if already processed or no deadline set
        if (!experience.mvgDeadline || experience.mvgStatus !== "pending") {
          continue;
        }

        const deadlinePassed = new Date(experience.mvgDeadline) <= now;
        const bookings = await storage.getBookingsByExperience(experience.id);
        const currentBookings = bookings.filter(b => b.status === "confirmed" || b.status === "pending").length;
        const mvgMin = experience.mvgMin || experience.minimumParticipants || 6;

        if (deadlinePassed) {
          if (currentBookings >= mvgMin) {
            // Threshold met - confirm event and capture payments
            await confirmMVGEvent(experience.id, bookings);
            await storage.updateExperienceMVGStatus(experience.id, "met");
            processedExperiences.push({ 
              id: experience.id, 
              action: "confirmed", 
              bookings: currentBookings,
              required: mvgMin,
              status: "met" 
            });
          } else {
            // Threshold not met - refund all participants
            await refundMVGParticipants(experience.id, bookings);
            await storage.updateExperienceMVGStatus(experience.id, "failed");
            // Void commissions for all promoter-attributed bookings
            await voidCommissionsForExperience(experience.id);
            processedExperiences.push({ 
              id: experience.id, 
              action: "refunded", 
              bookings: currentBookings,
              required: mvgMin,
              status: "failed" 
            });
          }
        } else if (currentBookings >= mvgMin) {
          // Early success - minimum reached before deadline
          await confirmMVGEvent(experience.id, bookings);
          await storage.updateExperienceMVGStatus(experience.id, "met");
          // Lock commissions for all promoter-attributed bookings
          await lockCommissionsForExperience(experience.id);
          processedExperiences.push({ 
            id: experience.id, 
            action: "early_confirmed", 
            bookings: currentBookings,
            required: mvgMin,
            status: "met" 
          });
        }
      }

      res.json({ processedExperiences });
    } catch (error: any) {
      res.status(500).json({ message: "Error processing MVG deadlines: " + error.message });
    }
  });

  // Get aggregated funding summary for homepage
  app.get("/api/mvg/funding-summary", async (req, res) => {
    try {
      // Get all approved MVG experiences with pending status
      const allExperiences = await storage.getAllMVGExperiences();
      const approvedExperiences = allExperiences.filter(exp => 
        exp.status === "approved" && 
        exp.mvgStatus === "pending" &&
        exp.mvgDeadline
      );

      // Enrich each experience with funding stats
      const fundingSummary = await Promise.all(
        approvedExperiences.map(async (experience) => {
          const bookings = await storage.getBookingsByExperience(experience.id);
          const currentBookings = bookings.filter(b => b.status === "confirmed" || b.status === "pending").length;
          const mvgMin = experience.mvgMin || experience.minimumParticipants || 6;
          const fundingPercentage = Math.round((currentBookings / mvgMin) * 100);
          
          // Calculate time remaining (clamped to non-negative)
          const now = new Date();
          const deadline = new Date(experience.mvgDeadline!);
          const timeRemaining = Math.max(0, deadline.getTime() - now.getTime());
          const daysRemaining = Math.max(0, Math.ceil(timeRemaining / (1000 * 60 * 60 * 24)));
          const hoursRemaining = Math.max(0, Math.ceil(timeRemaining / (1000 * 60 * 60)));
          const deadlinePassed = deadline.getTime() <= now.getTime();
          
          // DATA CONTRACT: Use ticketSkus.depositPerPerson or experience.depositAmount (fixed amounts only)
          const ticketSkus = experience.ticketSkus as any[] || [];
          const fixedDeposit = ticketSkus.length > 0 && ticketSkus[0]?.depositPerPerson
            ? parseFloat(ticketSkus[0].depositPerPerson)
            : (experience.depositAmount ? parseFloat(experience.depositAmount.toString()) : 0);
          const depositAmount = experience.depositEnabled && fixedDeposit > 0 ? fixedDeposit : Number(experience.price);

          // Compute additional funding metrics
          const participantsNeeded = Math.max(0, mvgMin - currentBookings);
          const spotsRemaining = Math.max(0, (experience.maxParticipants || mvgMin) - currentBookings);
          const amountFunded = currentBookings * depositAmount;
          const fundingGoal = mvgMin * depositAmount;

          return {
            id: experience.id,
            title: experience.title,
            shortDescription: experience.shortDescription,
            location: experience.location,
            coverImageUrl: experience.coverImageUrl,
            startDate: experience.startDate,
            endDate: experience.endDate,
            currentParticipants: currentBookings,
            minimumParticipants: mvgMin,
            maxParticipants: experience.maxParticipants,
            participantsNeeded,
            spotsRemaining,
            fundingPercentage,
            price: Number(experience.price),
            depositAmount,
            amountFunded,
            fundingGoal,
            depositEnabled: experience.depositEnabled,
            depositPercentage: experience.depositPercentage,
            mvgDeadline: experience.mvgDeadline,
            daysRemaining,
            hoursRemaining,
            deadlinePassed,
            venue: experience.venue,
            category: experience.category,
            creatorId: experience.creatorId
          };
        })
      );

      // Sort by funding percentage (descending) to show near-funded experiences first
      fundingSummary.sort((a, b) => b.fundingPercentage - a.fundingPercentage);

      res.json({ 
        activeFunding: fundingSummary,
        totalActive: fundingSummary.length 
      });
    } catch (error: any) {
      console.error("Error fetching funding summary:", error);
      res.status(500).json({ message: "Error fetching funding summary: " + error.message });
    }
  });

  // Get recently funded (successful) MVG experiences
  app.get("/api/mvg/recently-funded", async (req, res) => {
    try {
      const TEST_TITLE_FILTER = ['test', 'qa', 'acceptance', '8rivyi'];
      const allExperiences = await storage.getAllMVGExperiences();
      const fundedExperiences = allExperiences.filter(exp => 
        exp.status === "approved" && 
        exp.mvgStatus === "met" &&
        !TEST_TITLE_FILTER.some(keyword => exp.title?.toLowerCase().includes(keyword))
      );

      // Sort by most recently funded (using updatedAt as proxy)
      const recentlyFunded = fundedExperiences
        .sort((a, b) => {
          const dateA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
          const dateB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
          return dateB - dateA;
        })
        .slice(0, 6) // Get top 6 recently funded
        .map(exp => ({
          id: exp.id,
          title: exp.title,
          location: exp.location,
          coverImageUrl: exp.coverImageUrl,
          startDate: exp.startDate,
          minimumParticipants: exp.mvgMin || exp.minimumParticipants,
          price: Number(exp.price),
          category: exp.category
        }));

      res.json({ recentlyFunded });
    } catch (error: any) {
      console.error("Error fetching recently funded experiences:", error);
      res.status(500).json({ message: "Error fetching recently funded experiences: " + error.message });
    }
  });

  // Helper function to confirm MVG event and capture payments
  async function confirmMVGEvent(experienceId: string, bookings: any[]) {
    console.log(`Confirming MVG event ${experienceId} - processing ${bookings.length} bookings`);
    
    // Get experience details for balance calculation
    const experience = await storage.getExperience(experienceId);
    if (!experience) {
      console.error(`Experience ${experienceId} not found for MVG confirmation`);
      return;
    }
    
    for (const booking of bookings) {
      if (booking.status === "pending" && booking.stripePaymentIntentId) {
        try {
          const paymentIntent = await stripe.paymentIntents.retrieve(booking.stripePaymentIntentId);
          
          // Check if this is a deposit payment or full payment
          const isDepositPayment = paymentIntent.metadata?.isDepositPayment === "true";
          const balanceAmount = paymentIntent.metadata?.balanceAmount ? parseFloat(paymentIntent.metadata.balanceAmount) : 0;
          
          if (isDepositPayment && balanceAmount > 0) {
            // Verify deposit payment actually succeeded before creating balance charge
            if (paymentIntent.status !== "succeeded") {
              console.error(`[CRITICAL] MVG met but deposit payment not succeeded for booking ${booking.id}, status: ${paymentIntent.status} - REQUIRES MANUAL INTERVENTION`);
              // Do NOT confirm booking - this is a critical error that needs investigation
              continue;
            }
            
            // Get customer and payment method from deposit payment intent
            const customer = paymentIntent.customer as string || undefined;
            const paymentMethod = paymentIntent.payment_method as string || undefined;
            
            if (!customer || !paymentMethod) {
              console.error(`[CRITICAL] MVG met but missing customer/payment method for booking ${booking.id} - CANNOT CHARGE BALANCE - REQUIRES MANUAL INTERVENTION`);
              // Do NOT confirm booking - this is a critical error that needs investigation
              continue;
            }
            
            // Check if balance payment intent already exists (idempotency)
            const existingBooking = await storage.getBooking(booking.id);
            if (existingBooking?.balancePaymentIntentId) {
              console.log(`Balance payment intent already exists for booking ${booking.id}: ${existingBooking.balancePaymentIntentId}`);
              await storage.updateBookingStatus(booking.id, "confirmed");
              continue;
            }
            
            const balancePaymentIntent = await stripe.paymentIntents.create({
              amount: Math.round(balanceAmount * 100), // Convert to cents
              currency: "usd",
              customer, // Reuse customer from deposit payment
              payment_method: paymentMethod, // Reuse saved payment method
              capture_method: "manual", // Will be captured later when balance is due
              confirmation_method: "automatic",
              confirm: true, // Confirm immediately to move to requires_capture state
              off_session: true, // Allow charging without customer present
              metadata: {
                experienceId,
                bookingId: booking.id,
                isBalancePayment: "true",
                depositPaid: "true"
              }
            });
            
            // Calculate balance due date
            let balanceDueDate = null;
            if (experience.startDate && experience.balanceDueDays) {
              const startDate = new Date(experience.startDate);
              balanceDueDate = new Date(startDate.getTime() - (experience.balanceDueDays * 24 * 60 * 60 * 1000));
            }
            
            // Update booking with balance payment info
            await storage.updateBookingBalancePayment(booking.id, balancePaymentIntent.id, balanceDueDate);
              
            console.log(`MVG met: Deposit confirmed for booking ${booking.id}, balance payment intent created: ${balancePaymentIntent.id}`);
          } else if (isDepositPayment && balanceAmount === 0) {
            // Deposit only, no balance
            await storage.updateBookingStatus(booking.id, "confirmed");
            console.log(`MVG met: Deposit-only booking ${booking.id} confirmed`);
          } else if (paymentIntent.status === "requires_capture") {
            // Full payment authorized - capture it now
            await stripe.paymentIntents.capture(booking.stripePaymentIntentId);
            await storage.updateBookingStatus(booking.id, "confirmed");
            console.log(`MVG met: Captured full payment for booking ${booking.id}`);
          } else if (paymentIntent.status === "succeeded") {
            // Already captured (shouldn't happen but handle it)
            await storage.updateBookingStatus(booking.id, "confirmed");
            console.log(`MVG met: Payment already captured for booking ${booking.id}`);
          }
        } catch (error) {
          console.error(`Failed to process payment for booking ${booking.id}:`, error);
        }
      }
    }
  }

  // Helper function to refund MVG participants
  async function refundMVGParticipants(experienceId: string, bookings: any[]) {
    console.log(`MVG failed for ${experienceId} - refunding ${bookings.length} bookings`);
    
    for (const booking of bookings) {
      if ((booking.status === "pending" || booking.status === "confirmed") && booking.stripePaymentIntentId) {
        try {
          const paymentIntent = await stripe.paymentIntents.retrieve(booking.stripePaymentIntentId);
          const isDepositPayment = paymentIntent.metadata?.isDepositPayment === "true";
          
          if (paymentIntent.status === "requires_capture") {
            // Cancel uncaptured authorization (full payment, no deposit)
            await stripe.paymentIntents.cancel(booking.stripePaymentIntentId);
            console.log(`MVG failed: Cancelled uncaptured authorization for booking ${booking.id}`);
          } else if (paymentIntent.status === "succeeded") {
            // Refund charged payment (deposit or full payment)
            await stripe.refunds.create({
              payment_intent: booking.stripePaymentIntentId,
              reason: "requested_by_customer"
            });
            if (isDepositPayment) {
              console.log(`MVG failed: Refunded deposit for booking ${booking.id}`);
            } else {
              console.log(`MVG failed: Refunded full payment for booking ${booking.id}`);
            }
          }
          
          // Update booking status to refunded
          await storage.updateBookingStatus(booking.id, "refunded");
        } catch (error) {
          console.error(`Failed to refund payment for booking ${booking.id}:`, error);
        }
      }
    }
  }

  // Stripe Connect routes for creators
  app.post("/api/stripe/connect-url", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const userEmail = req.user.claims.email;
      
      // First, create or get existing Stripe Connect account
      let account;
      const existingProfile = await storage.getCreatorProfile(userId);
      
      if (existingProfile?.stripeAccountId) {
        account = await stripe.accounts.retrieve(existingProfile.stripeAccountId);
      } else {
        account = await stripe.accounts.create({
          type: 'express',
          email: userEmail,
          metadata: { userId: userId }
        });
        
        // Update creator profile with Stripe account ID
        await storage.updateCreatorProfileStripe(userId, account.id);
      }
      
      // Create account link for onboarding
      const accountLink = await stripe.accountLinks.create({
        account: account.id,
        refresh_url: `${getAppBaseUrl(req)}/creator-profile-setup?stripe_refresh=true`,
        return_url: `${getAppBaseUrl(req)}/creator-profile-setup?stripe_success=true`,
        type: 'account_onboarding',
      });

      res.json({ url: accountLink.url });
    } catch (error: any) {
      console.error("Error creating Stripe Connect URL:", error);
      res.status(500).json({ message: "Error creating Stripe Connect URL: " + error.message });
    }
  });

  // Review routes
  app.post("/api/reviews", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const reviewData = {
        ...req.body,
        userId,
      };

      const review = await storage.createReview(reviewData);
      res.json(review);
    } catch (error) {
      console.error("Error creating review:", error);
      res.status(500).json({ message: "Failed to create review" });
    }
  });

  // ============================================================================
  // VENUE ROUTES
  // ============================================================================

  // List all venues (public - returns only approved venues by default)
  app.get("/api/venues", async (req, res) => {
    try {
      const { location } = req.query;
      // Public endpoint — always return only admin-approved venues.
      // Pending/rejected venues are never visible to the public.
      const venues = await storage.getVenues({
        approved: true,
        location: location as string,
      });
      res.json(venues);
    } catch (error) {
      console.error("Error fetching venues:", error);
      res.status(500).json({ message: "Failed to fetch venues" });
    }
  });

  // Get user's own venues (protected - returns all statuses for owner)
  app.get("/api/user/venues", isAuthenticated, async (req: any, res) => {
    try {
      const userId = resolveCurrentUserId(req);
      
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const venues = await storage.getVenuesByCreator(userId);
      res.json(venues);
    } catch (error) {
      console.error("Error fetching user venues:", error);
      res.status(500).json({ message: "Failed to fetch venues" });
    }
  });

  app.get("/api/user/service-providers", isAuthenticated, async (req: any, res) => {
    try {
      const userId = resolveCurrentUserId(req);

      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const services = await storage.getServiceProviders();
      res.json(services.filter((service) => service.createdBy === userId));
    } catch (error) {
      console.error("Error fetching user service providers:", error);
      res.status(500).json({ message: "Failed to fetch service provider profiles" });
    }
  });

  // Get authenticated user's venues (alias for creator dashboard)
  app.get("/api/venues/my", isAuthenticated, async (req: any, res) => {
    try {
      const userId = resolveCurrentUserId(req);
      
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const venues = await storage.getVenuesByCreator(userId);
      res.json(venues);
    } catch (error) {
      console.error("Error fetching my venues:", error);
      res.status(500).json({ message: "Failed to fetch venues" });
    }
  });

  // Get venue for editing (protected - allows owner/admin to access draft venues)
  app.get("/api/venues/:id/edit", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const isAdmin = await checkIsAdmin(req);
      
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const venue = await storage.getVenue(req.params.id);
      
      if (!venue) {
        return res.status(404).json({ message: "Venue not found" });
      }

      // Check if user is owner or admin
      if (venue.createdBy !== userId && !isAdmin) {
        return res.status(403).json({ message: "You don't have permission to edit this venue" });
      }

      res.json(venue);
    } catch (error) {
      console.error("Error fetching venue for editing:", error);
      res.status(500).json({ message: "Failed to fetch venue" });
    }
  });

  // Get venue by slug or ID (public - returns only approved venues)
  app.get("/api/venues/:slug", async (req, res) => {
    try {
      // Try to fetch by slug first, fallback to ID for backward compatibility
      let venue = await storage.getVenueBySlug(req.params.slug);
      
      // If not found by slug, try by ID (for backward compatibility)
      if (!venue) {
        venue = await storage.getVenue(req.params.slug);
      }
      
      if (!venue) {
        return res.status(404).json({ message: "Venue not found" });
      }
      
      // Only return approved venues (public access)
      if (venue.status !== "approved" || !venue.approved) {
        return res.status(404).json({ message: "Venue not found" });
      }
      
      res.json(venue);
    } catch (error) {
      console.error("Error fetching venue:", error);
      res.status(500).json({ message: "Failed to fetch venue" });
    }
  });

  // Public venue page endpoint - fetch by slug or ID
  // Allows owners to view their own draft venues
  app.get("/api/v/:slugOrId", async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub || (process.env.NODE_ENV === 'development' ? "45788955" : null);
      
      // Try to find venue by slug first, then by ID
      let venue = await storage.getVenueBySlug(req.params.slugOrId);
      if (!venue) {
        venue = await storage.getVenue(req.params.slugOrId);
      }
      
      if (!venue) {
        return res.status(404).json({ message: "Venue not found" });
      }
      
      // For approved venues, anyone can view
      if (venue.status === "approved" && venue.approved) {
        return res.json(venue);
      }
      
      // For non-approved venues, only the owner can view
      if (userId && venue.createdBy === userId) {
        return res.json(venue);
      }
      
      // Otherwise, venue is not accessible
      return res.status(404).json({ message: "Venue not found" });
    } catch (error) {
      console.error("Error fetching venue by slug/id:", error);
      res.status(500).json({ message: "Failed to fetch venue" });
    }
  });

  // Get experiences hosted at a specific venue (public endpoint)
  app.get("/api/venues/:venueId/experiences", async (req, res) => {
    try {
      const experiences = await storage.getExperiencesByVenue(req.params.venueId);
      res.json(experiences);
    } catch (error) {
      console.error("Error fetching venue experiences:", error);
      res.status(500).json({ message: "Failed to fetch venue experiences" });
    }
  });

  // Create venue (protected - creates draft venue by default)
  app.post("/api/venues", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      // Generate unique slug from venue name and city
      let baseSlug = generateVenueSlug(req.body.name, req.body.city);
      let slug = baseSlug;
      let counter = 1;
      
      // Check for slug uniqueness and append number if needed
      let existingVenue = await storage.getVenueBySlug(slug);
      while (existingVenue) {
        slug = `${baseSlug}-${counter}`;
        existingVenue = await storage.getVenueBySlug(slug);
        counter++;
      }
      
      // Prepare venue data with ALL fields from request body
      const venuePayload = {
        // Required fields
        name: req.body.name,
        city: req.body.city,
        description: req.body.description,
        venueType: req.body.venueType || 'multi_day',
        capacity: req.body.capacity,
        standingCapacity: req.body.standingCapacity ?? null,
        seatedCapacity: req.body.seatedCapacity ?? null,
        location: req.body.location,
        
        // Basic optional fields
        tagline: req.body.tagline || null,
        friendlyAddress: req.body.friendlyAddress || null,
        logoUrl: req.body.logoUrl || null,
        website: req.body.website || null,
        instagram: req.body.instagram || null,
        videoUrl: req.body.videoUrl || null,
        
        // Geographic fields
        latitude: req.body.latitude ?? null,
        longitude: req.body.longitude ?? null,
        region: req.body.region || null,
        timezone: req.body.timezone || null,
        
        // Categorization arrays (ensure proper array format)
        categories: Array.isArray(req.body.categories) ? req.body.categories : [],
        vibes: Array.isArray(req.body.vibes) ? req.body.vibes : [],
        amenities: Array.isArray(req.body.amenities) ? req.body.amenities : [],
        customAmenities: Array.isArray(req.body.customAmenities) ? req.body.customAmenities : [],
        servicesOffered: Array.isArray(req.body.servicesOffered) ? req.body.servicesOffered : [],
        customServicesOffered: Array.isArray(req.body.customServicesOffered) ? req.body.customServicesOffered : [],
        
        // Media fields (legacy)
        coverImageUrl: req.body.coverImageUrl || null,
        galleryImages: Array.isArray(req.body.galleryImages) ? req.body.galleryImages : [],
        
        // Media fields (new JSONB structure)
        coverImages: Array.isArray(req.body.coverImages) ? req.body.coverImages : [],
        galleryImagesJsonb: Array.isArray(req.body.galleryImagesJsonb) ? req.body.galleryImagesJsonb : [],
        
        // Services JSONB
        services: Array.isArray(req.body.services) ? req.body.services : [],
        
        // Pricing fields
        pricingModel: req.body.pricingModel || null,
        currency: req.body.currency || 'usd',
        basePrice: req.body.basePrice ?? null,
        minStay: req.body.minStay ?? null,
        depositPercent: req.body.depositPercent ?? null,
        cancellationPolicy: req.body.cancellationPolicy || null,
        
        // New Page 9 Pricing fields
        basePricePerDay: req.body.basePricePerDay ?? null,
        basePricePerEvent: req.body.basePricePerEvent ?? null,
        cleaningFee: req.body.cleaningFee ?? null,
        useRoomPricesFromRoomsPage: req.body.useRoomPricesFromRoomsPage ?? true,
        defaultPricePerRoomPerNight: req.body.defaultPricePerRoomPerNight ?? null,
        minimumNights: req.body.minimumNights ?? null,
        paymentTimingModel: req.body.paymentTimingModel || null,
        softHoldDurationDays: req.body.softHoldDurationDays ?? null,
        balanceDueDaysBeforeArrival: req.body.balanceDueDaysBeforeArrival ?? null,
        pricingNotes: req.body.pricingNotes || null,
        
        // New Page 10 Terms fields
        termsAndConditionsUrl: req.body.termsAndConditionsUrl || null,
        houseRules: req.body.houseRules || null,
        damagePolicy: req.body.damagePolicy || null,
        termsConfirmed: req.body.termsConfirmed ?? false,
        
        // Business fields
        softHoldDays: req.body.softHoldDays ?? null,
        commissionPercent: req.body.commissionPercent ?? null,
        paymentModel: req.body.paymentModel || null,
        approvalMode: req.body.approvalMode || null,
        commercialModel: req.body.commercialModel || null,
        softHoldPolicyEnabled: req.body.softHoldPolicyEnabled ?? false,
        softHoldRefundableDeposit: req.body.softHoldRefundableDeposit ?? null,
        
        // Availability integration
        googleCalendarConnected: req.body.googleCalendarConnected ?? false,
        googleCalendarId: req.body.googleCalendarId || null,
        featuredWeeksToFill: Array.isArray(req.body.featuredWeeksToFill) ? req.body.featuredWeeksToFill : [],
        
        // Contact & Social
        contactPerson: req.body.contactPerson || null,
        contactEmail: req.body.contactEmail || null,
        contactPhone: req.body.contactPhone || null,
        facebook: req.body.facebook || null,
        youtube: req.body.youtube || null,
        whatsapp: req.body.whatsapp || null,
        skype: req.body.skype || null,
        
        // Templates & Defaults (JSONB)
        venueRoles: Array.isArray(req.body.venueRoles) ? req.body.venueRoles : [],
        venueRoomTypes: Array.isArray(req.body.venueRoomTypes) ? req.body.venueRoomTypes : [],
        defaultItinerary: Array.isArray(req.body.defaultItinerary) ? req.body.defaultItinerary : [],
        displayPrefs: req.body.displayPrefs || {},
        
        // System fields
        slug,
        createdBy: userId,
        // status defaults to 'draft' in database schema
      };
      
      // Validate using Zod schema
      const validationResult = extendedInsertVenueSchema.safeParse(venuePayload);
      
      if (!validationResult.success) {
        const errors = validationResult.error.issues.map(issue => {
          const path = issue.path.join('.');
          return `${path}: ${issue.message}`;
        });
        
        console.log('Venue validation failed:', errors);
        
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors,
          details: validationResult.error.issues
        });
      }
      
      // Use validated data
      const venueData = validationResult.data;

      console.log('Creating venue with validated data:', JSON.stringify(venueData, null, 2));
      
      const venue = await storage.createVenue(venueData);
      res.json(venue);
    } catch (error) {
      console.error("Error creating venue:", error);
      res.status(500).json({ message: "Failed to create venue" });
    }
  });

  // Update venue (protected - owner or admin only)
  app.put("/api/venues/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const isAdmin = await checkIsAdmin(req);
      
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      // Get venue to check ownership
      const existingVenue = await storage.getVenue(req.params.id);
      if (!existingVenue) {
        return res.status(404).json({ message: "Venue not found" });
      }

      // Check if user is owner or admin
      if (existingVenue.createdBy !== userId && !isAdmin) {
        return res.status(403).json({ message: "Only the venue owner or admin can edit this venue" });
      }

      // Explicitly map ALL fields from request body (prevent silent drops)
      const updatePayload = {
        // Required fields (merge with existing if not provided)
        name: req.body.name ?? existingVenue.name,
        city: req.body.city ?? existingVenue.city,
        description: req.body.description ?? existingVenue.description,
        venueType: req.body.venueType ?? existingVenue.venueType,
        capacity: req.body.capacity ?? existingVenue.capacity,
        standingCapacity: req.body.standingCapacity !== undefined ? req.body.standingCapacity : existingVenue.standingCapacity,
        seatedCapacity: req.body.seatedCapacity !== undefined ? req.body.seatedCapacity : existingVenue.seatedCapacity,
        location: req.body.location ?? existingVenue.location,
        
        // Basic optional fields
        tagline: req.body.tagline !== undefined ? (req.body.tagline || null) : existingVenue.tagline,
        friendlyAddress: req.body.friendlyAddress !== undefined ? (req.body.friendlyAddress || null) : existingVenue.friendlyAddress,
        logoUrl: req.body.logoUrl !== undefined ? (req.body.logoUrl || null) : existingVenue.logoUrl,
        website: req.body.website !== undefined ? (req.body.website || null) : existingVenue.website,
        instagram: req.body.instagram !== undefined ? (req.body.instagram || null) : existingVenue.instagram,
        videoUrl: req.body.videoUrl !== undefined ? (req.body.videoUrl || null) : existingVenue.videoUrl,
        
        // Geographic fields
        latitude: req.body.latitude !== undefined ? req.body.latitude : existingVenue.latitude,
        longitude: req.body.longitude !== undefined ? req.body.longitude : existingVenue.longitude,
        region: req.body.region !== undefined ? (req.body.region || null) : existingVenue.region,
        timezone: req.body.timezone !== undefined ? (req.body.timezone || null) : existingVenue.timezone,
        
        // Categorization arrays (ensure proper array format)
        categories: req.body.categories !== undefined ? (Array.isArray(req.body.categories) ? req.body.categories : []) : existingVenue.categories,
        vibes: req.body.vibes !== undefined ? (Array.isArray(req.body.vibes) ? req.body.vibes : []) : existingVenue.vibes,
        amenities: req.body.amenities !== undefined ? (Array.isArray(req.body.amenities) ? req.body.amenities : []) : existingVenue.amenities,
        customAmenities: req.body.customAmenities !== undefined ? (Array.isArray(req.body.customAmenities) ? req.body.customAmenities : []) : existingVenue.customAmenities,
        servicesOffered: req.body.servicesOffered !== undefined ? (Array.isArray(req.body.servicesOffered) ? req.body.servicesOffered : []) : existingVenue.servicesOffered,
        customServicesOffered: req.body.customServicesOffered !== undefined ? (Array.isArray(req.body.customServicesOffered) ? req.body.customServicesOffered : []) : existingVenue.customServicesOffered,
        
        // Media fields (legacy)
        coverImageUrl: req.body.coverImageUrl !== undefined ? (req.body.coverImageUrl || null) : existingVenue.coverImageUrl,
        galleryImages: req.body.galleryImages !== undefined ? (Array.isArray(req.body.galleryImages) ? req.body.galleryImages : []) : existingVenue.galleryImages,
        
        // Media fields (new JSONB structure)
        coverImages: req.body.coverImages !== undefined ? (Array.isArray(req.body.coverImages) ? req.body.coverImages : []) : existingVenue.coverImages,
        galleryImagesJsonb: req.body.galleryImagesJsonb !== undefined ? (Array.isArray(req.body.galleryImagesJsonb) ? req.body.galleryImagesJsonb : []) : existingVenue.galleryImagesJsonb,
        
        // Services JSONB
        services: req.body.services !== undefined ? (Array.isArray(req.body.services) ? req.body.services : []) : existingVenue.services,
        
        // Pricing fields
        pricingModel: req.body.pricingModel !== undefined ? (req.body.pricingModel || null) : existingVenue.pricingModel,
        currency: req.body.currency !== undefined ? (req.body.currency || 'usd') : existingVenue.currency,
        basePrice: req.body.basePrice !== undefined ? req.body.basePrice : existingVenue.basePrice,
        minStay: req.body.minStay !== undefined ? req.body.minStay : existingVenue.minStay,
        depositPercent: req.body.depositPercent !== undefined ? req.body.depositPercent : existingVenue.depositPercent,
        cancellationPolicy: req.body.cancellationPolicy !== undefined ? (req.body.cancellationPolicy || null) : existingVenue.cancellationPolicy,
        
        // New Page 9 Pricing fields
        basePricePerDay: req.body.basePricePerDay !== undefined ? req.body.basePricePerDay : existingVenue.basePricePerDay,
        basePricePerEvent: req.body.basePricePerEvent !== undefined ? req.body.basePricePerEvent : existingVenue.basePricePerEvent,
        cleaningFee: req.body.cleaningFee !== undefined ? req.body.cleaningFee : existingVenue.cleaningFee,
        useRoomPricesFromRoomsPage: req.body.useRoomPricesFromRoomsPage !== undefined ? req.body.useRoomPricesFromRoomsPage : existingVenue.useRoomPricesFromRoomsPage,
        defaultPricePerRoomPerNight: req.body.defaultPricePerRoomPerNight !== undefined ? req.body.defaultPricePerRoomPerNight : existingVenue.defaultPricePerRoomPerNight,
        minimumNights: req.body.minimumNights !== undefined ? req.body.minimumNights : existingVenue.minimumNights,
        paymentTimingModel: req.body.paymentTimingModel !== undefined ? (req.body.paymentTimingModel || null) : existingVenue.paymentTimingModel,
        softHoldDurationDays: req.body.softHoldDurationDays !== undefined ? req.body.softHoldDurationDays : existingVenue.softHoldDurationDays,
        balanceDueDaysBeforeArrival: req.body.balanceDueDaysBeforeArrival !== undefined ? req.body.balanceDueDaysBeforeArrival : existingVenue.balanceDueDaysBeforeArrival,
        pricingNotes: req.body.pricingNotes !== undefined ? (req.body.pricingNotes || null) : existingVenue.pricingNotes,
        
        // New Page 10 Terms fields
        termsAndConditionsUrl: req.body.termsAndConditionsUrl !== undefined ? (req.body.termsAndConditionsUrl || null) : existingVenue.termsAndConditionsUrl,
        houseRules: req.body.houseRules !== undefined ? (req.body.houseRules || null) : existingVenue.houseRules,
        damagePolicy: req.body.damagePolicy !== undefined ? (req.body.damagePolicy || null) : existingVenue.damagePolicy,
        termsConfirmed: req.body.termsConfirmed !== undefined ? req.body.termsConfirmed : existingVenue.termsConfirmed,
        
        // Business fields
        softHoldDays: req.body.softHoldDays !== undefined ? req.body.softHoldDays : existingVenue.softHoldDays,
        commissionPercent: req.body.commissionPercent !== undefined ? req.body.commissionPercent : existingVenue.commissionPercent,
        paymentModel: req.body.paymentModel !== undefined ? (req.body.paymentModel || null) : existingVenue.paymentModel,
        approvalMode: req.body.approvalMode !== undefined ? (req.body.approvalMode || null) : existingVenue.approvalMode,
        commercialModel: req.body.commercialModel !== undefined ? (req.body.commercialModel || null) : existingVenue.commercialModel,
        softHoldPolicyEnabled: req.body.softHoldPolicyEnabled !== undefined ? req.body.softHoldPolicyEnabled : existingVenue.softHoldPolicyEnabled,
        softHoldRefundableDeposit: req.body.softHoldRefundableDeposit !== undefined ? req.body.softHoldRefundableDeposit : existingVenue.softHoldRefundableDeposit,
        
        // Availability integration
        googleCalendarConnected: req.body.googleCalendarConnected !== undefined ? req.body.googleCalendarConnected : existingVenue.googleCalendarConnected,
        googleCalendarId: req.body.googleCalendarId !== undefined ? (req.body.googleCalendarId || null) : existingVenue.googleCalendarId,
        featuredWeeksToFill: req.body.featuredWeeksToFill !== undefined ? (Array.isArray(req.body.featuredWeeksToFill) ? req.body.featuredWeeksToFill : []) : existingVenue.featuredWeeksToFill,
        
        // Contact & Social
        contactPerson: req.body.contactPerson !== undefined ? (req.body.contactPerson || null) : existingVenue.contactPerson,
        contactEmail: req.body.contactEmail !== undefined ? (req.body.contactEmail || null) : existingVenue.contactEmail,
        contactPhone: req.body.contactPhone !== undefined ? (req.body.contactPhone || null) : existingVenue.contactPhone,
        facebook: req.body.facebook !== undefined ? (req.body.facebook || null) : existingVenue.facebook,
        youtube: req.body.youtube !== undefined ? (req.body.youtube || null) : existingVenue.youtube,
        whatsapp: req.body.whatsapp !== undefined ? (req.body.whatsapp || null) : existingVenue.whatsapp,
        skype: req.body.skype !== undefined ? (req.body.skype || null) : existingVenue.skype,
        
        // Templates & Defaults (JSONB)
        venueRoles: req.body.venueRoles !== undefined ? (Array.isArray(req.body.venueRoles) ? req.body.venueRoles : []) : existingVenue.venueRoles,
        venueRoomTypes: req.body.venueRoomTypes !== undefined ? (Array.isArray(req.body.venueRoomTypes) ? req.body.venueRoomTypes : []) : existingVenue.venueRoomTypes,
        defaultItinerary: req.body.defaultItinerary !== undefined ? (Array.isArray(req.body.defaultItinerary) ? req.body.defaultItinerary : []) : existingVenue.defaultItinerary,
        displayPrefs: req.body.displayPrefs !== undefined ? (req.body.displayPrefs || {}) : existingVenue.displayPrefs,
        
        // Preserve system fields (never allow user modification)
        slug: existingVenue.slug, // Keep original slug
        createdBy: existingVenue.createdBy, // Keep original creator
      };
      
      // Validate using partial Zod schema (allows partial updates)
      const validationResult = extendedInsertVenueSchema.partial().safeParse(updatePayload);
      
      if (!validationResult.success) {
        const errors = validationResult.error.issues.map(issue => {
          const path = issue.path.join('.');
          return `${path}: ${issue.message}`;
        });
        
        console.log('Venue update validation failed:', errors);
        
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors,
          details: validationResult.error.issues
        });
      }
      
      // Use validated data for update
      const updateData = validationResult.data;

      console.log('Updating venue with validated data, fields updated:', Object.keys(updateData).length);
      
      const updatedVenue = await storage.updateVenue(req.params.id, updateData);
      res.json(updatedVenue);
    } catch (error) {
      console.error("Error updating venue:", error);
      res.status(500).json({ message: "Failed to update venue" });
    }
  });

  // ============================================================================
  // VENUE WORKFLOW ROUTES (Submit, Approve, Reject)
  // ============================================================================

  // Submit venue for review (protected - owner only)
  app.patch("/api/venues/:id/submit", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      // Get venue to check ownership
      const venue = await storage.getVenue(req.params.id);
      if (!venue) {
        return res.status(404).json({ message: "Venue not found" });
      }

      // Check if user is owner
      if (venue.createdBy !== userId) {
        return res.status(403).json({ message: "Only the venue owner can submit for review" });
      }

      // Update status to pending
      const updatedVenue = await storage.updateVenueStatus(req.params.id, 'pending');
      res.json(updatedVenue);
    } catch (error) {
      console.error("Error submitting venue for review:", error);
      res.status(500).json({ message: "Failed to submit venue for review" });
    }
  });

  // ============================================================================
  // ADMIN VENUE ROUTES
  // ============================================================================

  // Get all pending venues for admin review (admin only)
  app.get("/api/admin/venues/pending", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const isAdmin = await checkIsAdmin(req);
      
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      if (!isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const pendingVenues = await storage.getPendingVenues();
      res.json(pendingVenues);
    } catch (error) {
      console.error("Error fetching pending venues:", error);
      res.status(500).json({ message: "Failed to fetch pending venues" });
    }
  });

  // Approve venue (admin only)
  app.patch("/api/venues/:id/approve", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const isAdmin = await checkIsAdmin(req);
      
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      if (!isAdmin) {
        return res.status(403).json({ message: "Only admins can approve venues" });
      }

      const { reviewNotes } = req.body;
      const venue = await storage.approveVenue(req.params.id, userId, reviewNotes);
      res.json(venue);
    } catch (error) {
      console.error("Error approving venue:", error);
      res.status(500).json({ message: "Failed to approve venue" });
    }
  });

  // Reject venue (admin only)
  app.patch("/api/venues/:id/reject", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const isAdmin = await checkIsAdmin(req);
      
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      if (!isAdmin) {
        return res.status(403).json({ message: "Only admins can reject venues" });
      }

      const { reviewNotes } = req.body;
      const venue = await storage.rejectVenue(req.params.id, userId, reviewNotes);
      res.json(venue);
    } catch (error) {
      console.error("Error rejecting venue:", error);
      res.status(500).json({ message: "Failed to reject venue" });
    }
  });

  app.delete("/api/venues/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const isAdmin = await checkIsAdmin(req);
      
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      // Get venue to check ownership
      const venue = await storage.getVenue(req.params.id);
      if (!venue) {
        return res.status(404).json({ message: "Venue not found" });
      }

      // Check if user is owner or admin
      if (venue.createdBy !== userId && !isAdmin) {
        return res.status(403).json({ message: "Only the venue owner or admin can delete this venue" });
      }

      await storage.rejectVenue(req.params.id);
      res.json({ message: "Venue deleted" });
    } catch (error) {
      console.error("Error deleting venue:", error);
      res.status(500).json({ message: "Failed to delete venue" });
    }
  });

  // ============================================================================
  // VENUE AVAILABILITY ROUTES
  // ============================================================================

  // Get venue availability (protected - owner or admin only)
  app.get("/api/venues/:venueId/availability", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const isAdmin = await checkIsAdmin(req);
      
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      // Verify venue ownership
      const venue = await storage.getVenue(req.params.venueId);
      if (!venue) {
        return res.status(404).json({ message: "Venue not found" });
      }

      if (venue.createdBy !== userId && !isAdmin) {
        return res.status(403).json({ message: "Only the venue owner or admin can view availability" });
      }

      const availability = await storage.getVenueAvailability(req.params.venueId);
      res.json(availability);
    } catch (error) {
      console.error("Error fetching venue availability:", error);
      res.status(500).json({ message: "Failed to fetch availability" });
    }
  });

  // Create venue availability block (protected - owner or admin only)
  app.post("/api/venues/:venueId/availability", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const isAdmin = await checkIsAdmin(req);
      
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      // Verify venue ownership
      const venue = await storage.getVenue(req.params.venueId);
      if (!venue) {
        return res.status(404).json({ message: "Venue not found" });
      }

      if (venue.createdBy !== userId && !isAdmin) {
        return res.status(403).json({ message: "Only the venue owner or admin can manage availability" });
      }

      // Validate request body with extended schema
      const validationSchema = insertVenueAvailabilitySchema.extend({
        startDate: insertVenueAvailabilitySchema.shape.startDate,
        endDate: insertVenueAvailabilitySchema.shape.endDate,
      }).refine((data) => {
        const start = new Date(data.startDate);
        const end = new Date(data.endDate);
        return start < end;
      }, {
        message: "End date must be after start date",
      });

      const validatedData = validationSchema.parse({
        venueId: req.params.venueId,
        ...req.body
      });

      const availability = await storage.createVenueAvailability(validatedData);
      res.json(availability);
    } catch (error) {
      if (error instanceof Error && error.name === 'ZodError') {
        return res.status(400).json({ message: "Invalid data", errors: error });
      }
      console.error("Error creating venue availability:", error);
      res.status(500).json({ message: "Failed to create availability" });
    }
  });

  // Update venue availability block (protected - owner or admin only)
  app.put("/api/venues/availability/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const isAdmin = await checkIsAdmin(req);
      
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      // Get the availability block to verify venue ownership
      const availabilityBlock = await storage.getVenueAvailabilityById(req.params.id);
      if (!availabilityBlock) {
        return res.status(404).json({ message: "Availability block not found" });
      }

      // Get venue to check ownership
      const venue = await storage.getVenue(availabilityBlock.venueId);
      if (!venue) {
        return res.status(404).json({ message: "Venue not found" });
      }

      if (venue.createdBy !== userId && !isAdmin) {
        return res.status(403).json({ message: "Only the venue owner or admin can update availability" });
      }

      // Validate date range
      if (req.body.startDate && req.body.endDate) {
        const start = new Date(req.body.startDate);
        const end = new Date(req.body.endDate);
        if (start >= end) {
          return res.status(400).json({ message: "End date must be after start date" });
        }
      }

      const updatedAvailability = await storage.updateVenueAvailability(req.params.id, req.body);
      res.json(updatedAvailability);
    } catch (error) {
      console.error("Error updating availability:", error);
      res.status(500).json({ message: "Failed to update availability" });
    }
  });

  // Delete venue availability block (protected - owner or admin only)
  app.delete("/api/venues/availability/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const isAdmin = await checkIsAdmin(req);
      
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      // Get the availability block to verify venue ownership
      const availabilityBlock = await storage.getVenueAvailabilityById(req.params.id);
      if (!availabilityBlock) {
        return res.status(404).json({ message: "Availability block not found" });
      }

      // Get venue to check ownership
      const venue = await storage.getVenue(availabilityBlock.venueId);
      if (!venue) {
        return res.status(404).json({ message: "Venue not found" });
      }

      if (venue.createdBy !== userId && !isAdmin) {
        return res.status(403).json({ message: "Only the venue owner or admin can delete this availability block" });
      }

      await storage.deleteVenueAvailability(req.params.id);
      res.json({ message: "Availability deleted" });
    } catch (error) {
      console.error("Error deleting availability:", error);
      res.status(500).json({ message: "Failed to delete availability" });
    }
  });

  app.patch("/api/venues/:venueId/google-calendar", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const isAdmin = await checkIsAdmin(req);
      
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      // Verify venue ownership
      const venue = await storage.getVenue(req.params.venueId);
      if (!venue) {
        return res.status(404).json({ message: "Venue not found" });
      }

      if (venue.createdBy !== userId && !isAdmin) {
        return res.status(403).json({ message: "Only the venue owner or admin can manage Google Calendar integration" });
      }

      const updatedVenue = await storage.updateVenueGoogleCalendar(
        req.params.venueId,
        req.body.connected,
        req.body.calendarId
      );
      res.json(updatedVenue);
    } catch (error) {
      console.error("Error updating Google Calendar connection:", error);
      res.status(500).json({ message: "Failed to update Google Calendar connection" });
    }
  });

  // Service provider routes
  app.get("/api/service-providers", async (req, res) => {
    try {
      const { location, type, approved } = req.query;
      
      // Validate query parameters
      const queryOptions: { location?: string; type?: string; approved?: boolean } = {};
      
      if (location && typeof location === 'string') {
        queryOptions.location = location;
      }
      
      if (type && typeof type === 'string') {
        queryOptions.type = type;
      }
      
      if (approved !== undefined) {
        queryOptions.approved = approved === 'true';
      }

      const services = await storage.getServiceProviders(queryOptions);
      
      // Ensure we return an array with proper error handling
      if (!Array.isArray(services)) {
        console.error("Service providers query returned non-array:", services);
        return res.status(500).json({ 
          message: "Invalid data format from database",
          services: []
        });
      }

      // Validate each service has required fields
      const validatedServices = services.map(service => ({
        id: service.id || '',
        name: service.name || 'Unnamed Service',
        profileImageUrl: service.profileImageUrl || null,
        description: service.description || '',
        location: service.location || '',
        serviceCategory: service.serviceCategory || 'general',
        serviceType: service.serviceType || [],
        tags: service.tags || [],
        priceModel: service.priceModel || 'per_day',
        price: service.price || '0.00',
        availabilityType: service.availabilityType || 'available',
        contactEmail: service.contactEmail || null,
        phoneNumber: service.phoneNumber || null,
        socialLinks: service.socialLinks || {},
        galleryImages: service.galleryImages || [],
        approved: service.approved || false,
        createdBy: service.createdBy || '',
        createdAt: service.createdAt || new Date(),
        updatedAt: service.updatedAt || new Date()
      }));

      res.json(validatedServices);
    } catch (error) {
      console.error("Error fetching service providers:", error);
      res.status(500).json({ 
        message: "Failed to fetch service providers",
        error: error instanceof Error ? error.message : 'Unknown error',
        services: []
      });
    }
  });

  app.get("/api/service-providers/:id", async (req, res) => {
    try {
      const service = await storage.getServiceProvider(req.params.id);
      if (!service) {
        return res.status(404).json({ message: "Service provider not found" });
      }
      res.json(service);
    } catch (error) {
      console.error("Error fetching service provider:", error);
      res.status(500).json({ message: "Failed to fetch service provider" });
    }
  });

  app.post("/api/service-providers", isAuthenticated, async (req: any, res) => {
    try {
      const userId = resolveCurrentUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const serviceData = {
        ...req.body,
        createdBy: userId,
        approved: false,
      };
      
      const service = await storage.createServiceProvider(serviceData);
      res.status(201).json(service);
    } catch (error) {
      console.error("Error creating service provider:", error);
      res.status(500).json({ message: "Failed to create service provider" });
    }
  });

  app.put("/api/service-providers/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = resolveCurrentUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const service = await storage.getServiceProvider(req.params.id);
      if (!service) {
        return res.status(404).json({ message: "Service provider not found" });
      }

      const isAdmin = await checkIsAdmin(req);
      if (service.createdBy !== userId && !isAdmin) {
        return res.status(403).json({ message: "You don't have permission to edit this service provider profile" });
      }

      const editableFields = { ...(req.body || {}) };
      const requestedApproved = editableFields.approved;
      delete editableFields.id;
      delete editableFields.createdBy;
      delete editableFields.createdAt;
      delete editableFields.updatedAt;
      delete editableFields.approved;

      const updatedService = await storage.updateServiceProvider(req.params.id, {
        ...editableFields,
        createdBy: service.createdBy,
        approved: isAdmin && typeof requestedApproved === "boolean" ? requestedApproved : service.approved,
      });

      res.json(updatedService);
    } catch (error) {
      console.error("Error updating service provider:", error);
      res.status(500).json({ message: "Failed to update service provider" });
    }
  });

  app.patch("/api/service-providers/:id/approve", isAuthenticated, async (req: any, res) => {
    try {
      // Add admin check here if needed
      const service = await storage.approveServiceProvider(req.params.id);
      res.json(service);
    } catch (error) {
      console.error("Error approving service provider:", error);
      res.status(500).json({ message: "Failed to approve service provider" });
    }
  });

  app.delete("/api/service-providers/:id", isAuthenticated, async (req: any, res) => {
    try {
      // Add admin check here if needed
      await storage.rejectServiceProvider(req.params.id);
      res.json({ message: "Service provider rejected and deleted" });
    } catch (error) {
      console.error("Error rejecting service provider:", error);
      res.status(500).json({ message: "Failed to reject service provider" });
    }
  });

  // Venue availability routes
  app.get("/api/venues/available", async (req, res) => {
    try {
      const { startDate, endDate, capacity, venueType } = req.query;
      const availableVenues = await storage.getAvailableVenues({
        startDate: startDate as string,
        endDate: endDate as string,
        capacity: capacity ? parseInt(capacity as string) : undefined,
        venueType: venueType as string
      });
      res.json(availableVenues);
    } catch (error) {
      console.error('Error fetching available venues:', error);
      res.status(500).json({ message: 'Failed to fetch available venues' });
    }
  });

  // Service availability routes
  app.get("/api/services/available", async (req, res) => {
    try {
      const { startDate, endDate, category, location } = req.query;
      const availableServices = await storage.getAvailableServices({
        startDate: startDate as string,
        endDate: endDate as string,
        category: category as string,
        location: location as string
      });
      res.json(availableServices);
    } catch (error) {
      console.error('Error fetching available services:', error);
      res.status(500).json({ message: 'Failed to fetch available services' });
    }
  });

  app.get("/api/services", async (req, res) => {
    try {
      const services = await storage.getAllServicesWithProviders();
      res.json(services);
    } catch (error) {
      console.error('Error fetching services:', error);
      res.status(500).json({ message: 'Failed to fetch services' });
    }
  });

  // Experience venue/service assignment routes
  app.post("/api/experiences/:id/venues", isAuthenticated, async (req: any, res) => {
    try {
      const assignment = await storage.assignVenueToExperience({
        experienceId: req.params.id,
        venueId: req.body.venueId,
      });
      res.json(assignment);
    } catch (error) {
      console.error("Error assigning venue:", error);
      res.status(500).json({ message: "Failed to assign venue" });
    }
  });

  app.post("/api/experiences/:id/services", isAuthenticated, async (req: any, res) => {
    try {
      const assignment = await storage.assignServiceToExperience({
        experienceId: req.params.id,
        serviceId: req.body.serviceId,
        roleDescription: req.body.roleDescription,
      });
      res.json(assignment);
    } catch (error) {
      console.error("Error assigning service:", error);
      res.status(500).json({ message: "Failed to assign service" });
    }
  });

  // Participant interaction routes
  app.post("/api/participant-connections", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const connection = await storage.createParticipantConnection({
        ...req.body,
        userId,
      });
      res.json(connection);
    } catch (error) {
      console.error("Error creating connection:", error);
      res.status(500).json({ message: "Failed to create connection" });
    }
  });

  app.get("/api/participant-connections", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { experienceId } = req.query;
      const connections = await storage.getUserConnections(userId);
      res.json(connections);
    } catch (error) {
      console.error("Error fetching connections:", error);
      res.status(500).json({ message: "Failed to fetch connections" });
    }
  });

  app.patch("/api/participant-connections/:id", isAuthenticated, async (req: any, res) => {
    try {
      const { status } = req.body;
      const connection = await storage.updateConnectionStatus(req.params.id, status);
      res.json(connection);
    } catch (error) {
      console.error("Error updating connection:", error);
      res.status(500).json({ message: "Failed to update connection" });
    }
  });

  // Messaging routes
  app.post("/api/experiences/:id/messages", isAuthenticated, async (req: any, res) => {
    try {
      const userId = await requireParticipantProfileForCommunity(req, res);
      if (!userId) return;
      const message = await storage.createMessage({
        ...req.body,
        experienceId: req.params.id,
        userId,
      });
      res.json(message);
    } catch (error) {
      console.error("Error creating message:", error);
      res.status(500).json({ message: "Failed to create message" });
    }
  });

  app.get("/api/experiences/:id/messages", isAuthenticated, async (req: any, res) => {
    try {
      const { isPrivate } = req.query;
      const messages = await storage.getExperienceMessages(req.params.id);
      res.json(messages);
    } catch (error) {
      console.error("Error fetching messages:", error);
      res.status(500).json({ message: "Failed to fetch messages" });
    }
  });

  // Participant profiles
  app.post("/api/participant-profile", isAuthenticated, async (req: any, res) => {
    try {
      const userId = resolveCurrentUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "User not authenticated" });
      }
      const validatedData = insertParticipantProfileSchema.parse({
        ...req.body,
        userId,
      });
      const profile = await storage.createOrUpdateProfile(validatedData);
      res.json(profile);
    } catch (error: any) {
      console.error("Error creating/updating profile:", error);
      if (error?.name === "ZodError") {
        return res.status(400).json({
          message: "Invalid profile data",
          errors: error.errors,
        });
      }
      res.status(500).json({ message: "Failed to create/update profile" });
    }
  });

  app.get("/api/participant-profile", isAuthenticated, async (req: any, res) => {
    try {
      const userId = resolveCurrentUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "User not authenticated" });
      }
      const profile = await storage.getProfile(userId);
      res.json(profile);
    } catch (error) {
      console.error("Error fetching profile:", error);
      res.status(500).json({ message: "Failed to fetch profile" });
    }
  });

  app.get("/api/experiences/:id/participants", isAuthenticated, async (req: any, res) => {
    try {
      const userId = process.env.NODE_ENV === 'development' ? "45788955" : req.user.claims.sub;
      const experienceId = req.params.id;
      
      const profiles = await storage.getProfilesByExperience(experienceId, userId);
      res.json(profiles);
    } catch (error) {
      console.error("Error fetching participant profiles:", error);
      
      // Handle specific authorization error for private participant lists
      if (error instanceof Error && error.message === "UNAUTHORIZED_PRIVATE_PARTICIPANT_LIST") {
        return res.status(403).json({ 
          message: "Participant list is private",
          error: "UNAUTHORIZED_PRIVATE_PARTICIPANT_LIST"
        });
      }
      
      if (error instanceof Error && error.message === "Experience not found") {
        return res.status(404).json({ message: "Experience not found" });
      }
      
      res.status(500).json({ message: "Failed to fetch participant profiles" });
    }
  });

  // Creator profile routes
  app.get("/api/creator-profile", isAuthenticated, async (req: any, res) => {
    try {
      const userId = resolveCurrentUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "User not authenticated" });
      }
      const profile = await storage.getCreatorProfile(userId);
      if (!profile) {
        return res.status(404).json({ message: "Creator profile not found" });
      }
      res.json(profile);
    } catch (error) {
      console.error("Error fetching creator profile:", error);
      res.status(500).json({ message: "Failed to fetch creator profile" });
    }
  });

  app.post("/api/creator-profile", isAuthenticated, async (req: any, res) => {
    try {
      const userId = resolveCurrentUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "User not authenticated" });
      }
      
      // Validate request body with schema (userId already excluded from schema)
      const validation = insertCreatorProfileSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ 
          message: "Invalid profile data", 
          errors: validation.error.issues 
        });
      }
      
      const profile = await storage.createOrUpdateCreatorProfile(userId, validation.data);
      res.json(profile);
    } catch (error) {
      console.error("Error saving creator profile:", error);
      res.status(500).json({ message: "Failed to save creator profile" });
    }
  });

  app.get("/api/creator/experiences", isAuthenticated, async (req: any, res) => {
    try {
      const creatorId = req.user.claims.sub;
      const experiences = await storage.getExperiencesByCreator(creatorId);
      // Enrich with MVG progress from single source of truth
      const enrichedExperiences = await Promise.all(
        experiences.map(async (exp) => {
          const mvgProgress = await storage.getMVGProgress(exp.id);
          const mvgMet = mvgProgress.mvg_met;
          const resolvedMvgStatus = mvgMet ? 'met' : (exp.mvgStatus || 'pending');
          return {
            ...exp,
            currentParticipants: mvgProgress.current_participants,
            participantCount: mvgProgress.current_participants,
            mvgMet,
            mvgStatus: resolvedMvgStatus,
            lifecycleStatus: computeLifecycleStatus({ ...exp, mvgStatus: resolvedMvgStatus, mvgMet }),
          };
        })
      );
      res.json(enrichedExperiences);
    } catch (error) {
      console.error("Error fetching creator experiences:", error);
      res.status(500).json({ message: "Failed to fetch creator experiences" });
    }
  });

  app.get("/api/creator/analytics/:period", isAuthenticated, async (req: any, res) => {
    try {
      const creatorId = req.user.claims.sub;
      const { period } = req.params;
      const analytics = await storage.getExperiencesByCreator(creatorId);
      res.json(analytics);
    } catch (error) {
      console.error("Error fetching creator analytics:", error);
      res.status(500).json({ message: "Failed to fetch creator analytics" });
    }
  });

  app.get("/api/creator/earnings/:period", isAuthenticated, async (req: any, res) => {
    try {
      const creatorId = req.user.claims.sub;
      const { period } = req.params;
      const earnings = await storage.getCreatorEarnings(creatorId);
      res.json(earnings);
    } catch (error) {
      console.error("Error fetching creator earnings:", error);
      res.status(500).json({ message: "Failed to fetch creator earnings" });
    }
  });

  // Announcements
  app.post("/api/experiences/:id/announcements", isAuthenticated, async (req: any, res) => {
    try {
      const creatorId = req.user.claims.sub;
      const announcement = await storage.createAnnouncement({
        ...req.body,
        experienceId: req.params.id,
        creatorId,
      });
      res.json(announcement);
    } catch (error) {
      console.error("Error creating announcement:", error);
      res.status(500).json({ message: "Failed to create announcement" });
    }
  });

  app.get("/api/experiences/:id/announcements", isAuthenticated, async (req: any, res) => {
    try {
      const announcements = await storage.getAnnouncements(req.params.id);
      res.json(announcements);
    } catch (error) {
      console.error("Error fetching announcements:", error);
      res.status(500).json({ message: "Failed to fetch announcements" });
    }
  });

  // Message reactions
  app.post("/api/messages/:id/reactions", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const reaction = await storage.createReaction({
        messageId: req.params.id,
        userId,
        reactionType: req.body.reactionType,
      });
      res.json(reaction);
    } catch (error) {
      console.error("Error creating reaction:", error);
      res.status(500).json({ message: "Failed to create reaction" });
    }
  });

  app.get("/api/messages/:id/reactions", isAuthenticated, async (req: any, res) => {
    try {
      const reactions = await storage.getReactions(req.params.id);
      res.json(reactions);
    } catch (error) {
      console.error("Error fetching reactions:", error);
      res.status(500).json({ message: "Failed to fetch reactions" });
    }
  });

  app.delete("/api/messages/:id/reactions", isAuthenticated, async (req: any, res) => {
    try {
      const userId = process.env.NODE_ENV === 'development' ? "45788955" : req.user?.claims?.sub;
      await storage.removeReaction(req.params.id);
      res.json({ message: "Reaction removed" });
    } catch (error) {
      console.error("Error removing reaction:", error);
      res.status(500).json({ message: "Failed to remove reaction" });
    }
  });

  // Get community profiles
  app.get("/api/community/profiles", async (req, res) => {
    try {
      const profiles = await storage.getAllParticipantProfiles();
      res.json(profiles);
    } catch (error) {
      console.error("Error fetching community profiles:", error);
      res.status(500).json({ error: "Failed to fetch community profiles" });
    }
  });

  app.put("/api/participant-profile", isAuthenticated, async (req: any, res) => {
    try {
      const validatedData = insertParticipantProfileSchema.partial().parse(req.body);
      const userId = process.env.NODE_ENV === 'development' ? "45788955" : req.user?.claims?.sub;
      
      if (!userId) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const profile = await storage.updateParticipantProfile(userId, validatedData);
      res.json(profile);
    } catch (error) {
      console.error("Error updating participant profile:", error);
      res.status(500).json({ message: "Failed to update participant profile" });
    }
  });

  app.get("/api/participant-profiles", async (req, res) => {
    try {
      const profiles = await storage.getAllParticipantProfiles();
      res.json(profiles);
    } catch (error) {
      console.error("Error fetching participant profiles:", error);
      res.status(500).json({ message: "Failed to fetch participant profiles" });
    }
  });

  // Participant roles routes for creator-defined roles
  app.post("/api/experiences/:experienceId/participant-roles", isAuthenticated, async (req: any, res) => {
    try {
      const { experienceId } = req.params;
      const userId = req.user.claims.sub;
      
      // Verify user is the creator of this experience
      const experience = await storage.getExperience(experienceId);
      if (!experience || experience.creatorId !== userId) {
        return res.status(403).json({ message: "Only the creator can define participant roles" });
      }
      
      const roleData = {
        ...req.body,
        experienceId,
        currentCount: 0
      };
      
      const role = await storage.createParticipantRole(roleData);
      res.status(201).json(role);
    } catch (error: any) {
      console.error("Error creating participant role:", error);
      res.status(500).json({ message: "Failed to create participant role" });
    }
  });

  app.get("/api/experiences/:experienceId/participant-roles", async (req, res) => {
    try {
      const { experienceId } = req.params;
      const roles = await storage.getParticipantRolesByExperience(experienceId);
      res.json(roles);
    } catch (error: any) {
      console.error("Error fetching participant roles:", error);
      res.status(500).json({ message: "Failed to fetch participant roles" });
    }
  });

  app.post("/api/experiences/:experienceId/role-assignments", isAuthenticated, async (req: any, res) => {
    try {
      const { experienceId } = req.params;
      const { roleId } = req.body;
      const userId = req.user.claims.sub;
      
      const assignmentData = {
        roleId,
        userId,
        experienceId,
        status: "applied" as const,
        appliedAt: new Date()
      };
      
      const assignment = await storage.assignParticipantRole(assignmentData);
      res.status(201).json(assignment);
    } catch (error: any) {
      console.error("Error applying for participant role:", error);
      res.status(500).json({ message: "Failed to apply for role" });
    }
  });

  app.get("/api/experiences/:experienceId/role-assignments", async (req, res) => {
    try {
      const { experienceId } = req.params;
      const assignments = await storage.getParticipantRoleAssignments(experienceId);
      res.json(assignments);
    } catch (error: any) {
      console.error("Error fetching role assignments:", error);
      res.status(500).json({ message: "Failed to fetch role assignments" });
    }
  });

  app.get("/api/experiences/:experienceId/participants-with-skills", async (req, res) => {
    try {
      const { experienceId } = req.params;
      const participants = await storage.getParticipantsWithSkillsAndRoles(experienceId);
      res.json(participants);
    } catch (error: any) {
      console.error("Error fetching participants with skills:", error);
      res.status(500).json({ message: "Failed to fetch participants with skills" });
    }
  });

  // Duplicate endpoint removed - kept main one at line 874

  app.get("/objects/:objectPath(*)", async (req, res) => {
    try {
      const objectStorageService = new ObjectStorageService();
      const objectFile = await objectStorageService.getObjectEntityFile(req.path);
      objectStorageService.downloadObject(objectFile, res);
    } catch (error) {
      console.error("Error serving object:", error);
      if (error instanceof ObjectNotFoundError) {
        return res.sendStatus(404);
      }
      return res.sendStatus(500);
    }
  });

  app.get("/public-objects/:filePath(*)", async (req, res) => {
    try {
      const filePath = req.params.filePath;
      const objectStorageService = new ObjectStorageService();
      const file = await objectStorageService.searchPublicObject(filePath);
      if (!file) {
        return res.status(404).json({ error: "File not found" });
      }
      objectStorageService.downloadObject(file, res);
    } catch (error) {
      console.error("Error searching for public object:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // AI Itinerary Generation Endpoint
  app.post('/api/generate-itinerary', async (req, res) => {
    try {
      const { title, startDate, endDate, experienceType, category, location, customPrompt } = req.body;
      
      if (!title || !startDate || !endDate || !location) {
        return res.status(400).json({ error: "Missing required fields: title, startDate, endDate, location" });
      }
      
      // Generate AI-powered itinerary using OpenAI
      const itinerary = await generateItinerary(
        title,
        new Date(startDate),
        new Date(endDate),
        experienceType,
        category,
        location,
        customPrompt
      );
      
      res.json({
        itinerary,
        message: "AI itinerary generated successfully"
      });
    } catch (error) {
      console.error("Error generating AI itinerary:", error);
      res.status(500).json({ error: "Failed to generate itinerary. Please try again." });
    }
  });

  // Seed sample participant profiles
  app.post("/api/seed-profiles", async (req, res) => {
    try {
      const sampleProfiles = [
        {
          userId: "sample-user-1",
          displayName: "Maya Rodriguez",
          bio: "Digital nomad and wellness coach passionate about mindful travel and sustainable living. I love connecting with nature and helping others find balance in their lives.",
          location: "Lisbon, Portugal",
          interests: ["Yoga", "Meditation", "Sustainable Travel", "Digital Marketing", "Mindfulness"],
          experienceLevel: "Experienced",
          travelStyle: ["Adventure", "Wellness", "Cultural Immersion"],
          fitnessLevel: "Active",
          occupation: "Wellness Coach & Content Creator",
          skills: ["Yoga Instruction", "Content Creation", "Community Building", "Digital Marketing", "Portuguese"],
          willingToTakeRoles: true,
          rolePreferences: ["Wellness Guide", "Community Facilitator", "Content Coordinator"],
          languages: ["English", "Spanish", "Portuguese"],
          professionalInterests: ["Health & Wellness", "Digital Marketing", "Sustainable Tourism"],
          profileVisibility: "Public",
          contactMethod: "In-App Messaging",
          dietaryPreferences: ["Vegetarian", "Organic"],
          emergencyContact: "Carlos Rodriguez (Brother) - +34 123 456 789"
        },
        {
          userId: "sample-user-2", 
          displayName: "Alex Chen",
          bio: "Software engineer turned adventure photographer. I capture stories through my lens while exploring remote destinations. Always up for adrenaline-pumping activities and meeting fellow adventurers.",
          location: "Vancouver, Canada",
          interests: ["Photography", "Rock Climbing", "Hiking", "Technology", "Adventure Sports"],
          experienceLevel: "Expert",
          travelStyle: ["Adventure", "Photography", "Off-the-beaten-path"],
          fitnessLevel: "Very Active",
          occupation: "Adventure Photographer & Software Engineer",
          skills: ["Photography", "Rock Climbing", "Software Development", "Drone Operation", "Video Editing"],
          willingToTakeRoles: true,
          rolePreferences: ["Photographer", "Technical Support", "Safety Coordinator"],
          languages: ["English", "Mandarin", "French"],
          professionalInterests: ["Photography", "Technology", "Adventure Tourism"],
          profileVisibility: "Public",
          contactMethod: "In-App Messaging",
          dietaryPreferences: ["No restrictions"],
          emergencyContact: "Linda Chen (Mother) - +1 604 123 4567"
        },
        {
          userId: "sample-user-3",
          displayName: "Sofia Andersson",
          bio: "Sustainability consultant and permaculture enthusiast from Sweden. I organize eco-conscious retreats and love sharing knowledge about regenerative living practices.",
          location: "Stockholm, Sweden", 
          interests: ["Permaculture", "Sustainability", "Organic Farming", "Climate Action", "Community Building"],
          experienceLevel: "Expert",
          travelStyle: ["Eco-conscious", "Educational", "Community-focused"],
          fitnessLevel: "Moderate",
          occupation: "Sustainability Consultant",
          skills: ["Permaculture Design", "Project Management", "Environmental Consulting", "Workshop Facilitation", "Swedish"],
          willingToTakeRoles: true,
          rolePreferences: ["Sustainability Educator", "Workshop Facilitator", "Project Coordinator"],
          languages: ["Swedish", "English", "German", "Danish"],
          professionalInterests: ["Environmental Consulting", "Sustainable Agriculture", "Climate Solutions"],
          profileVisibility: "Public",
          contactMethod: "In-App Messaging",
          dietaryPreferences: ["Vegan", "Organic", "Local sourcing"],
          emergencyContact: "Erik Andersson (Father) - +46 70 123 4567"
        },
        {
          userId: "sample-user-4",
          displayName: "Raj Patel",
          bio: "Executive chef and culinary storyteller exploring global food cultures. I create immersive culinary experiences that connect people through authentic flavors and traditions.",
          location: "Mumbai, India",
          interests: ["Culinary Arts", "Food Culture", "Travel", "Storytelling", "Cultural Exchange"],
          experienceLevel: "Expert", 
          travelStyle: ["Culinary", "Cultural", "Local experiences"],
          fitnessLevel: "Moderate",
          occupation: "Executive Chef & Culinary Consultant",
          skills: ["Culinary Arts", "Menu Development", "Food Safety", "Cultural Research", "Hindi"],
          willingToTakeRoles: true,
          rolePreferences: ["Chef", "Cultural Guide", "Experience Curator"],
          languages: ["Hindi", "English", "Gujarati", "French"],
          professionalInterests: ["Culinary Arts", "Food Tourism", "Cultural Preservation"],
          profileVisibility: "Public", 
          contactMethod: "In-App Messaging",
          dietaryPreferences: ["Vegetarian"],
          emergencyContact: "Priya Patel (Wife) - +91 98765 43210"
        },
        {
          userId: "sample-user-5",
          displayName: "Emma Thompson",
          bio: "Former corporate lawyer who traded boardrooms for beaches. Now I lead mindfulness retreats and help others find work-life balance. Passionate about mental health and personal growth.",
          location: "Byron Bay, Australia",
          interests: ["Mindfulness", "Personal Development", "Surfing", "Writing", "Mental Health"],
          experienceLevel: "Intermediate",
          travelStyle: ["Wellness", "Mindfulness", "Beach destinations"],
          fitnessLevel: "Active",
          occupation: "Mindfulness Coach & Former Lawyer",
          skills: ["Mindfulness Coaching", "Legal Consulting", "Workshop Design", "Public Speaking", "Surfing"],
          willingToTakeRoles: true,
          rolePreferences: ["Mindfulness Guide", "Workshop Facilitator", "Wellness Coordinator"],
          languages: ["English"],
          professionalInterests: ["Mental Health", "Personal Development", "Wellness Tourism"],
          profileVisibility: "Public",
          contactMethod: "In-App Messaging", 
          dietaryPreferences: ["Gluten-free", "Pescatarian"],
          emergencyContact: "James Thompson (Partner) - +61 412 345 678"
        }
      ];

      // Create sample users first if they don't exist
      for (const profile of sampleProfiles) {
        try {
          await storage.upsertUser({
            id: profile.userId,
            email: `${profile.displayName.toLowerCase().replace(' ', '.')}@example.com`,
            firstName: profile.displayName.split(' ')[0],
            lastName: profile.displayName.split(' ')[1],
          });
        } catch (error) {
          console.log(`User ${profile.userId} might already exist`);
        }
      }

      // Create participant profiles
      const createdProfiles = [];
      for (const profileData of sampleProfiles) {
        try {
          const profile = await storage.createParticipantProfile(profileData);
          createdProfiles.push(profile);
        } catch (error) {
          console.log(`Profile for ${profileData.displayName} might already exist`);
        }
      }

      res.json({ 
        message: "Sample profiles seeded successfully",
        profilesCreated: createdProfiles.length 
      });
    } catch (error) {
      console.error("Error seeding profiles:", error);
      res.status(500).json({ message: "Failed to seed profiles" });
    }
  });

  // Query classification utility function
  function classifyUserQuery(message: string) {
    const query = message.toLowerCase().trim();
    
    // Trip planning keywords (route to AI Travel)
    const tripKeywords = ['trip', 'travel', 'plan', 'itinerary', 'vacation', 'holiday', 'fly', 'hotel', 'accommodation', 'book flight', 'visit', 'go to', 'days in'];
    
    // Experience browsing keywords (route to Experiences)
    const browseKeywords = ['find', 'search', 'look for', 'discover', 'explore', 'show me', 'what is', 'available', 'options', 'list', 'browse'];
    
    // Onboarding/Community keywords (route to Profile Setup) - HIGHEST PRIORITY
    const onboardingKeywords = ['get started', 'i want to get started', 'want to get started', 'sign up', 'onboard', 'new user', 'first time', 'begin my journey', 'start here', 'help me start'];
    const communityKeywords = ['join community', 'connect with people', 'network', 'meet people', 'make friends', 'social', 'members'];
    
    // Creation keywords (route to Journey Builder) - More specific
    const createKeywords = ['create experience', 'create an experience', 'host experience', 'organize experience', 'build experience', 'make experience', 'setup experience', 'launch experience', 'become creator', 'become host', 'start hosting'];
    
    // Venue/Service keywords
    const venueKeywords = ['venue', 'location', 'space', 'rent space', 'list venue', 'add venue'];
    const serviceKeywords = ['service provider', 'offer service', 'provide service', 'freelancer', 'professional service'];
    
    // Category-specific keywords
    const categoryKeywords = {
      retreats: ['retreat', 'wellness', 'meditation', 'yoga', 'spiritual', 'mindfulness'],
      workations: ['workation', 'remote work', 'coworking', 'digital nomad', 'work travel'],
      adventure: ['adventure', 'hiking', 'climbing', 'outdoor', 'extreme', 'sports'],
      workshops: ['workshop', 'learn', 'skill', 'class', 'training', 'course']
    };
    
    console.log("🔍 Classifying query:", query);
    
    // Check for trip planning intent (enhanced detection)
    const tripPlanningPatterns = [
      /\b(?:plan|planning|organize|book|schedule)\s+(?:a\s+)?(?:trip|travel|vacation|holiday|journey)/,
      /\b(?:visit|go\s+to|travel\s+to|trip\s+to)\s+\w+/,
      /\b(?:\d+\s+days?|week|month)\s+(?:in|at|to)\s+\w+/,
      /\b(?:fly|flight|hotel|accommodation|itinerary)/,
      /\b(?:workation|retreat|getaway)\s+(?:in|to|at)\s+\w+/
    ];
    
    const hasDestination = /\b(?:to|in|at)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/.test(query);
    const hasTripKeywords = tripKeywords.some(keyword => query.includes(keyword));
    const hasTripPatterns = tripPlanningPatterns.some(pattern => pattern.test(query));
    
    if (hasTripKeywords || hasTripPatterns || hasDestination) {
      console.log("📅 Classified as: TRIP_PLANNING");
      console.log("Trip indicators - Keywords:", hasTripKeywords, "Patterns:", hasTripPatterns, "Destination:", hasDestination);
      
      // Extract destination if found
      const destinationMatch = query.match(/\b(?:to|in|at)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/);
      const destination = destinationMatch ? destinationMatch[1] : null;
      
      return { 
        type: 'trip_planning', 
        confidence: 0.8,
        route: '/ai-travel',
        reasoning: 'Contains trip/travel planning keywords or patterns',
        destination,
        originalQuery: message
      };
    }
    
    // Check for onboarding intent FIRST (highest priority) - use exact phrase matching
    const onboardingMatches = onboardingKeywords.filter(keyword => query.includes(keyword));
    if (onboardingMatches.length > 0) {
      console.log("🚀 Classified as: ONBOARDING (matched:", onboardingMatches, ")");
      return { 
        type: 'onboarding', 
        confidence: 0.95,
        route: '/participant-profile-setup',
        reasoning: `Contains onboarding keywords: ${onboardingMatches.join(', ')}`
      };
    }
    
    // Check for venue intent
    if (venueKeywords.some(keyword => query.includes(keyword))) {
      console.log("🏢 Classified as: VENUE_SETUP");
      return { 
        type: 'venue_setup', 
        confidence: 0.8,
        route: '/venue-profile-setup',
        reasoning: 'Contains venue-related keywords'
      };
    }
    
    // Check for service provider intent
    if (serviceKeywords.some(keyword => query.includes(keyword))) {
      console.log("⚙️ Classified as: SERVICE_SETUP");
      return { 
        type: 'service_setup', 
        confidence: 0.8,
        route: '/service-provider-setup',
        reasoning: 'Contains service provider keywords'
      };
    }
    
    // Check for creation intent
    if (createKeywords.some(keyword => query.includes(keyword))) {
      console.log("🛠️ Classified as: CREATE_EXPERIENCE");
      return { 
        type: 'create_experience', 
        confidence: 0.9,
        route: '/creator',
        reasoning: 'Contains creation/hosting keywords'
      };
    }
    
    // Check for community intent
    if (communityKeywords.some(keyword => query.includes(keyword))) {
      console.log("👥 Classified as: JOIN_COMMUNITY");
      return { 
        type: 'join_community', 
        confidence: 0.8,
        route: '/participant-profile-setup',
        reasoning: 'Contains community/joining keywords'
      };
    }
    
    // Check for category-specific browsing
    for (const [category, keywords] of Object.entries(categoryKeywords)) {
      if (keywords.some(keyword => query.includes(keyword))) {
        console.log(`🏷️ Classified as: BROWSE_CATEGORY (${category})`);
        return { 
          type: 'browse_category', 
          category,
          confidence: 0.7,
          route: `/experiences?category=${category}`,
          reasoning: `Contains ${category} category keywords`
        };
      }
    }
    
    // Check for general browsing
    if (browseKeywords.some(keyword => query.includes(keyword))) {
      console.log("🔍 Classified as: BROWSE_EXPERIENCES");
      return { 
        type: 'browse_experiences', 
        confidence: 0.6,
        route: '/experiences',
        reasoning: 'Contains general browsing keywords'
      };
    }
    
    // Default to general browsing for generic queries
    console.log("🎯 Classified as: GENERIC_BROWSE (default)");
    return { 
      type: 'generic_browse', 
      confidence: 0.4,
      route: '/experiences',
      reasoning: 'Generic query - defaulting to experiences page'
    };
  }

  // AI Assistant endpoint
  app.post("/api/ai-assistant", async (req, res) => {
    try {
      const { message, context } = req.body;
      
      console.log("🔍 AI Assistant Query Analysis:");
      console.log("User Query:", message);
      console.log("Context Length:", context?.length || 0);
      
      // Enhanced query classification
      const queryClassification = classifyUserQuery(message);
      console.log("Query Classification:", queryClassification);

      if (!process.env.OPENAI_API_KEY) {
        throw new Error('OpenAI API key not configured');
      }

      // Use OpenAI to understand user intent and provide contextual responses
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
          messages: [
            {
              role: "system",
              content: `You are the AI assistant for "Great." - a platform for discovering and creating transformative experiences like retreats, workations, workshops, and adventure trips. 

              Your role is to:
              1. Help users discover and join transformative experiences (retreats, workations, adventures)
              2. Guide experience creation through journey builder and creator tools
              3. Assist with workation planning, group trips, and AI travel itineraries
              4. Connect users with venues, service providers, and community features
              5. Provide navigation to profiles, dashboards, payments, and all platform sections
              6. Be conversational, insightful, and action-oriented
              7. Prioritize platform's own experiences, venues, and partners before suggesting external options

              CRITICAL ROUTING RULES:
              
              1. ONBOARDING INTENT: "get started", "sign up", "new user", "join" → /conversational-profile?type=participant
              2. CREATION INTENT: "create experience", "become host", "start hosting" → /creator  
              3. VENUE INTENT: "list venue", "add location", "rent space" → /venue-profile-setup
              4. SERVICE INTENT: "offer services", "become provider" → /service-provider-setup
              5. BROWSING INTENT: "find", "search", "discover", "what's available" → /experiences
              6. TRIP PLANNING: specific destinations, dates, "plan trip" → /ai-travel
              
              DEFAULT FALLBACK: If intent is unclear or generic, ALWAYS route to /experiences for browsing.
              
              SPECIAL ROUTING BEHAVIORS:
              - For single action responses (high confidence), enable auto-navigation after 1.5 seconds
              - For onboarding queries, prioritize guided setup over generic browsing
              - For creative/hosting intent, route to conversational creator setup for AI guidance
              - For venue/service providers, route to specialized registration flows

              Available app routes and features:
              - /experiences (browse all experiences - USE THIS for generic discovery queries)
              - /experiences?category=retreats (wellness, meditation, spiritual experiences)
              - /experiences?category=workations (remote work + travel experiences)
              - /experiences?category=adventure_trips (outdoor, hiking, sports)
              - /experiences?category=community_social (social, networking events)
              - /experiences?category=sports_wellness (fitness, health activities)  
              - /experiences?category=festivals_events (festivals, special events)
              - /experience-details/:id (individual experience pages)
              - /creator (Creator dashboard with experience creation tools)
              - /community (community hub and networking)
              - /conversational-profile?type=participant (guided onboarding to join community)
              - /creator (Creator dashboard and management)
              - /ai-travel (AI trip and workation planning - USE THIS for travel planning queries)
              - /participant-profile-setup (create rich user profile)
              - /creator-profile-setup (become creator/host)
              - /creator-dashboard (creator analytics and management)
              - /venues (browse venue partners)
              - /services (browse service providers)
              - /venue-profile-setup (venue registration)
              - /service-provider-setup (service provider registration)
              - /admin-dashboard (admin features - if authorized)
              - /why-us (platform benefits and features)
              - /checkout (payment processing)
              
              ROUTING PRIORITIES (in order):
              1. Onboarding: "get started", "new user" → /conversational-profile?type=participant
              2. Trip planning: destinations, dates → /ai-travel  
              3. Creation: "create experience", "become host" → /creator
              4. Venues: "list venue", "add space" → /venue-profile-setup
              5. Services: "offer services" → /service-provider-setup
              6. Category-specific: yoga, retreat, etc → /experiences?category=X
              7. Generic/browsing: "find", "what's available" → /experiences
              8. FALLBACK: unclear intent → /experiences

              Always provide 2-4 actionable buttons in your responses. Keep responses conversational, brief (2-3 sentences), and focused on helping the user take their next step.

              Response format: JSON with "message" (string) and "actions" (array of {label, action, route})
              `
            },
            ...(context || []).map((msg: any) => ({
              role: msg.type === 'user' ? 'user' : 'assistant',
              content: msg.content
            })),
            {
              role: "user",
              content: message
            }
          ],
          response_format: { type: "json_object" },
          temperature: 0.7
        })
      });

      if (!response.ok) {
        throw new Error('OpenAI API request failed');
      }

      const data = await response.json();
      const aiResponse = JSON.parse(data.choices[0].message.content);

      res.json(aiResponse);
    } catch (error) {
      console.error("AI Assistant error:", error);
      
      // Enhanced fallback response with proper routing
      const fallbackClassification = classifyUserQuery(req.body.message || "");
      console.log("🔄 Using fallback with classification:", fallbackClassification);
      
      res.json({
        message: "I'm here to help you get started! What would you like to do first?",
        actions: [
          { label: "Get Started", action: "navigate", route: "/participant-profile-setup" },
          { label: "Browse Experiences", action: "navigate", route: "/experiences" },
          { label: "Create Experience", action: "navigate", route: "/creator" },
          { label: "Plan a Trip", action: "navigate", route: "/ai-travel" }
        ]
      });
    }
  });

  // Conversational Creator Setup Assistant
  app.post("/api/conversational-creator-setup", async (req, res) => {
    try {
      const { message, context, currentStep, currentData } = req.body;

      if (!process.env.OPENAI_API_KEY) {
        throw new Error('OpenAI API key not configured');
      }

      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
          messages: [
            {
              role: "system",
              content: `You are Great AI, a friendly and conversational assistant helping creators set up their profiles on Great. - a platform for transformative experiences.

              Your role is to guide creators through profile creation in a conversational, supportive way - like chatting with a helpful friend.

              Current Setup Step: ${currentStep} (0=intro, 1=identity, 2=expertise, 3=background, 4=monetization, 5=complete)
              Current Data: ${JSON.stringify(currentData)}

              Step Guidelines:
              - Step 1 (Identity): Get displayName, tagline, bio
              - Step 2 (Expertise): Get expertiseTags (array), main areas they teach/lead, ALWAYS ask for confirmation before advancing
              - Step 3 (Background): Get baseLocation, experienceLevel, socialMediaLinks (extract social handles from any URL or @mention)
              - Step 4 (Monetization): Get payoutEmail, terms acceptance, mention Stripe Connect setup
              - Step 5 (Complete): Final review and completion, mention dashboard setup for photos/Stripe

              CRITICAL BIO HANDLING:
              - Ask: "Can you write a bit about yourself below?"
              - When they provide bio text, DON'T save it yet - instead repeat it back with improved sentence structure/grammar
              - Say something like "Here's how that sounds: [improved version]. Does that sound perfect to you?"
              - ONLY save the bio when they say "perfect", "yes", "that's great", etc.
              - Then immediately move to nextStep: 2
              - NO ACTION BUTTONS - everything happens through text conversation

              IMPORTANT BEHAVIOR:
              - ALWAYS continue the conversation regardless of user response
              - Accept ANY user response (yes, no, maybe, specific answers, questions, etc.)
              - If they answer your question, acknowledge it and move to the next logical step
              - If they give vague responses, ask for clarification but keep moving forward
              - If they seem confused, reassure them and suggest the next step
              - ALWAYS return empty actions array - NO ACTION BUTTONS
              - Extract any useful information from their message and update form fields
              - Auto-advance to next step when you have enough information

              Your personality:
              - Warm, encouraging, and conversational
              - Use casual language and be supportive
              - Ask follow-up questions to gather information naturally
              - Celebrate their progress and choices
              - Keep responses concise (2-3 sentences max)

              Response format: JSON with:
              - "message" (string): Your conversational response that acknowledges their input and continues the flow
              - "actions" (array): Always empty array []
              - "formUpdates" (object): Any form fields to update based on their input
              - "nextStep" (number): Next step if advancing (optional)

              Extract information from their message and update form fields naturally. For expertise, convert topics they mention into expertiseTags array.
              For bio/background questions, capture ANY descriptive text about themselves as bio field.
              
              EXPERTISE CONFIRMATION FLOW:
              When user provides expertise areas, ALWAYS:
              1. Extract topics into expertiseTags array
              2. Repeat back the expertise areas as a summary
              3. End with "Should I get those down as your expertise areas?" or similar confirmation question
              4. Wait for user confirmation before advancing to nextStep: 3
              
              SOCIAL MEDIA EXTRACTION (Step 3):
              From location/social responses, extract BOTH fields and ALWAYS ask for confirmation:
              - baseLocation: Any city/country mentioned (e.g., "Amsterdam" -> "Amsterdam, Netherlands")  
              - socialMediaLinks: Extract handles/URLs and format as JSON object with instagram/website keys
              
              Example: "Amsterdam and my instagram handle is @tim.theeuwsen and www.instagram.com/tim.theeuwsen"
              -> Extract: baseLocation: "Amsterdam, Netherlands", socialMediaLinks: {"instagram": "@tim.theeuwsen", "website": "www.instagram.com/tim.theeuwsen"}
              -> ALWAYS respond with summary: "Great! I see you're based in Amsterdam, Netherlands and your Instagram is @tim.theeuwsen. Should I save these details?"
              -> WAIT for user confirmation before advancing to nextStep: 4
              
              EXAMPLE BIO FLOW:
              Step 1 - Ask: "Can you write a bit about yourself below?"
              User: "I'm a yoga teacher with 10 years experience helping people find balance"
              Step 2 - Repeat back improved: "Here's how that sounds: I'm a passionate yoga instructor with over 10 years of experience helping people discover balance and inner peace through mindful movement. Does that sound perfect to you?"
              User: "Perfect!"
              Step 3 - Save: {"message": "Wonderful! I've saved your bio. Now let's move on to your expertise areas...", "formUpdates": {"bio": "I'm a passionate yoga instructor with over 10 years of experience helping people discover balance and inner peace through mindful movement."}, "nextStep": 2, "actions": []}
              
              MONETIZATION STEP (Step 4):
              - Ask for payoutEmail for payments
              - Mention: "We'll use Stripe Connect so you can receive payments from your experiences. You can complete the full Stripe setup later in your dashboard!"
              - When they provide email, IMMEDIATELY save it and ask for terms acceptance
              - If any delay/timeout occurs, provide immediate fallback: "Got your email! Do you agree to our creator terms of service?"
              
              COMPLETION STEP (Step 5):
              - Congratulate them on completing the basic profile
              - Mention: "Great news! You can add your profile photo and complete your Stripe Connect setup anytime in your creator dashboard. For now, you're ready to start creating experiences!"
              
              CRITICAL: Never include suggestion buttons or action prompts in your message text. Just natural conversation flow.`
            },
            ...context.map((msg: any) => ({
              role: msg.type === 'user' ? 'user' : 'assistant',
              content: msg.content
            })),
            {
              role: "user",
              content: message
            }
          ],
          response_format: { type: "json_object" },
          temperature: 0.7
        })
      });

      if (!response.ok) {
        throw new Error('OpenAI API request failed');
      }

      const data = await response.json();
      
      // Handle potential parsing errors
      let aiResponse;
      try {
        const content = data.choices[0]?.message?.content;
        if (!content || content.trim() === '') {
          throw new Error('Empty response from OpenAI');
        }
        aiResponse = JSON.parse(content);
      } catch (parseError) {
        console.error('Failed to parse OpenAI response:', parseError, 'Content:', data.choices[0]?.message?.content);
        throw new Error('Invalid response format from OpenAI');
      }

      res.json(aiResponse);
    } catch (error) {
      console.error("Conversational Creator Setup error:", error);
      
      // Fallback response with proper currentStep access
      res.json({
        message: "I'm having a little trouble connecting, but I'm still here to help! Can you tell me what you'd like to work on? Just type your response and we'll continue the conversation.",
        actions: [],
        formUpdates: {},
        nextStep: req.body.currentStep || 0
      });
    }
  });

  // Duplicate endpoint removed - kept main one at line 874

  app.put("/api/profile-photos", async (req, res) => {
    try {
      const { profilePhotoURL } = req.body;
      if (!profilePhotoURL) {
        return res.status(400).json({ error: "profilePhotoURL is required" });
      }

      const { ObjectStorageService } = await import("./objectStorage");
      const objectStorageService = new ObjectStorageService();
      const objectPath = objectStorageService.normalizeObjectEntityPath(profilePhotoURL);

      res.status(200).json({ objectPath });
    } catch (error) {
      console.error("Error setting profile photo:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Route for serving objects (for profile photos)
  app.get("/objects/:objectPath(*)", async (req, res) => {
    try {
      const { ObjectStorageService, ObjectNotFoundError } = await import("./objectStorage");
      const objectStorageService = new ObjectStorageService();
      const objectFile = await objectStorageService.getObjectEntityFile(req.path);
      objectStorageService.downloadObject(objectFile, res);
    } catch (error) {
      console.error("Error accessing object:", error);
      if (error instanceof Error && error.name === "ObjectNotFoundError") {
        return res.sendStatus(404);
      }
      return res.sendStatus(500);
    }
  });

  // Services endpoints (minimal implementation for now)
  // Community routes - Public profiles for community page
  app.get("/api/community/profiles", async (req, res) => {
    try {
      const profiles = await storage.getAllParticipantProfiles();
      // Filter only public profiles
      const publicProfiles = profiles.filter(profile => 
        profile.profileVisibility === "Public"
      );
      res.json(publicProfiles);
    } catch (error) {
      console.error("Error fetching community profiles:", error);
      res.status(500).json({ message: "Failed to fetch community profiles" });
    }
  });

  // Participant Hub routes
  app.get("/api/experiences/:id/participants", async (req, res) => {
    try {
      const participants = await storage.getExperienceParticipants(req.params.id);
      
      // Transform the data to match the expected format
      const formattedParticipants = participants.map(participant => ({
        id: participant.userId,
        userId: participant.userId,
        firstName: participant.firstName,
        lastName: participant.lastName,
        name: `${participant.firstName || ""} ${participant.lastName || ""}`.trim() || "Anonymous",
        displayName: participant.displayName,
        profileImage: participant.avatarUrl || participant.profileImageUrl,
        profileImageUrl: participant.profileImageUrl,
        avatarUrl: participant.avatarUrl,
        bookingId: participant.bookingId,
        joinedAt: participant.bookingDate,
        bookingDate: participant.bookingDate,
        role: "Participant" // This could be enhanced with actual roles
      }));
      
      res.json(formattedParticipants);
    } catch (error) {
      console.error("Error fetching participants:", error);
      res.status(500).json({ message: "Failed to fetch participants" });
    }
  });

  app.get("/api/experiences/:id/messages", async (req, res) => {
    try {
      const messages = await storage.getMessages(req.params.id);
      res.json(messages);
    } catch (error) {
      console.error("Error fetching messages:", error);
      res.status(500).json({ message: "Failed to fetch messages" });
    }
  });

  app.post("/api/experiences/:id/messages", isAuthenticated, async (req: any, res) => {
    try {
      const userId = await requireParticipantProfileForCommunity(req, res);
      if (!userId) return;
      const messageData = {
        experienceId: req.params.id,
        userId: userId,
        message: req.body.content,
        messageType: "text" as const
      };
      
      const message = await storage.createMessage(messageData);
      res.status(201).json(message);
    } catch (error) {
      console.error("Error creating message:", error);
      res.status(500).json({ message: "Failed to send message" });
    }
  });

  app.get("/api/experiences/:id/announcements", async (req, res) => {
    try {
      const announcements = await storage.getAnnouncements(req.params.id);
      res.json(announcements);
    } catch (error) {
      console.error("Error fetching announcements:", error);
      res.status(500).json({ message: "Failed to fetch announcements" });
    }
  });

  app.get("/api/services", async (req, res) => {
    try {
      // Return empty array for now - will be implemented when storage is fixed
      res.json([]);
    } catch (error: any) {
      console.error("Error fetching services:", error);
      res.status(500).json({ message: "Failed to fetch services" });
    }
  });

  // Community application routes
  app.post("/api/community/apply", async (req, res) => {
    try {
      const validatedData = insertCommunityApplicationSchema.parse(req.body);
      const application = await storage.submitCommunityApplication(validatedData);
      res.json(application);
    } catch (error) {
      console.error("Error submitting community application:", error);
      if (error instanceof Error && error.name === "ZodError") {
        res.status(400).json({ message: "Invalid application data", errors: (error as any).errors });
      } else {
        res.status(500).json({ message: "Failed to submit application" });
      }
    }
  });

  app.get("/api/admin/community-applications", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      // Only admin users can view applications
      if (!await checkIsAdmin(req)) {
        return res.status(403).json({ message: "Unauthorized" });
      }
      
      const applications = await storage.getCommunityApplications();
      res.json(applications);
    } catch (error) {
      console.error("Error fetching community applications:", error);
      res.status(500).json({ message: "Failed to fetch applications" });
    }
  });

  app.patch("/api/admin/community-applications/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      // Only admin users can review applications
      if (!await checkIsAdmin(req)) {
        return res.status(403).json({ message: "Unauthorized" });
      }

      const { status, reviewNotes } = req.body;
      const application = await storage.reviewCommunityApplication(
        req.params.id, 
        status, 
        reviewNotes, 
        userId
      );
      res.json(application);
    } catch (error) {
      console.error("Error reviewing community application:", error);
      res.status(500).json({ message: "Failed to review application" });
    }
  });

  // Community group routes
  app.get("/api/community/groups", async (req, res) => {
    try {
      const groups = await storage.getCommunityGroups();
      res.json(groups);
    } catch (error) {
      console.error("Error fetching community groups:", error);
      res.status(500).json({ message: "Failed to fetch groups" });
    }
  });

  app.post("/api/community/groups", isAuthenticated, async (req: any, res) => {
    try {
      const userId = await requireParticipantProfileForCommunity(req, res);
      if (!userId) return;
      
      const groupData = {
        ...req.body,
        createdBy: userId
      };
      
      const group = await storage.createCommunityGroup(groupData);
      res.json(group);
    } catch (error) {
      console.error("Error creating community group:", error);
      res.status(500).json({ message: "Failed to create group" });
    }
  });

  app.get("/api/community/groups/:id/messages", async (req, res) => {
    try {
      const messages = await storage.getGroupMessages(req.params.id);
      res.json(messages);
    } catch (error) {
      console.error("Error fetching group messages:", error);
      res.status(500).json({ message: "Failed to fetch messages" });
    }
  });

  app.post("/api/community/groups/:id/messages", isAuthenticated, async (req: any, res) => {
    try {
      const userId = await requireParticipantProfileForCommunity(req, res);
      if (!userId) return;
      
      const messageData = {
        groupId: req.params.id,
        userId,
        content: req.body.message,
        messageType: req.body.messageType || "text"
      };
      
      const message = await storage.createGroupMessage(messageData);
      res.json(message);
    } catch (error) {
      console.error("Error creating group message:", error);
      res.status(500).json({ message: "Failed to create message" });
    }
  });

  app.get("/api/community/featured-members", async (req, res) => {
    try {
      const members = await storage.getFeaturedMembers();
      res.json(members);
    } catch (error) {
      console.error("Error fetching featured members:", error);
      res.status(500).json({ message: "Failed to fetch featured members" });
    }
  });

  // Public community profile — privacy-safe (first name + last initial only, no email/payment data)
  app.get("/api/community/profile/:userId", async (req, res) => {
    try {
      const { userId } = req.params;
      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ message: "Profile not found" });

      // Filter out test/qa/anonymous accounts
      const fullName = `${user.firstName || ''} ${user.lastName || ''}`.toLowerCase();
      if (fullName.includes('test') || fullName.includes(' qa') || fullName.startsWith('qa') || fullName.includes('anonymous')) {
        return res.status(404).json({ message: "Profile not found" });
      }

      const profile = await storage.getParticipantProfileByUserId(userId);

      // Sanitize userId to prevent SQL injection (Replit user IDs are numeric strings)
      const safeUserId = userId.replace(/[^a-zA-Z0-9_-]/g, '');

      // Get trips this user has joined (bookings with experience data)
      const userBookings = await db.execute(`
        SELECT DISTINCT ON (e.id)
          e.id,
          e.title,
          e.location,
          e.start_date,
          e.cover_image_url,
          e.status,
          e.mvg_status,
          e.require_minimum_participants,
          b.status AS booking_status,
          b.created_at AS booking_created_at
        FROM bookings b
        JOIN experiences e ON b.experience_id = e.id
        WHERE b.user_id = '${safeUserId}'
          AND b.status NOT IN ('cancelled','refunded')
          AND e.status IN ('approved','published')
        ORDER BY e.id, b.created_at DESC
        LIMIT 6
      `);

      // Derive interest tags from booking categories if no explicit interests
      const bookingCategories = await db.execute(`
        SELECT DISTINCT e.category
        FROM bookings b
        JOIN experiences e ON b.experience_id = e.id
        WHERE b.user_id = '${safeUserId}'
          AND b.status NOT IN ('cancelled','refunded')
          AND e.category IS NOT NULL
        LIMIT 5
      `);

      const explicitInterests: string[] = Array.isArray(profile?.interests) ? profile.interests : [];
      const derivedTags = (bookingCategories.rows as any[]).map((r: any) => r.category).filter(Boolean);
      const allInterests = Array.from(new Set([...explicitInterests, ...derivedTags])).slice(0, 6);

      // Build privacy-safe display name: first name + last initial only
      const firstName = user.firstName || "";
      const lastInitial = user.lastName ? `${user.lastName[0]}.` : "";
      const displayName = lastInitial ? `${firstName} ${lastInitial}` : firstName;

      // Avatar: prefer profile avatar, then user profileImageUrl
      const avatarUrl = profile?.avatarUrl || user.profileImageUrl || null;

      // Trips
      const trips = (userBookings.rows as any[]).map((row: any) => ({
        id: row.id,
        title: row.title,
        location: row.location,
        startDate: row.start_date,
        coverImageUrl: row.cover_image_url,
        bookingStatus: row.booking_status,
        mvgStatus: row.mvg_status,
      }));

      res.json({
        userId,
        displayName,
        avatarUrl,
        location: profile?.location || null,
        bio: profile?.bio || null,
        interests: allInterests,
        skills: profile?.skills || [],
        occupation: profile?.occupation || null,
        trips,
      });
    } catch (error) {
      console.error("Error fetching community profile:", error);
      res.status(500).json({ message: "Failed to fetch profile" });
    }
  });

  // Member Interests Grid — real users with interest tags, max 12
  app.get("/api/community/members", async (req, res) => {
    try {
      // Fetch users with participant profiles, enriched with booking-derived tags
      const rows = await db.execute(`
        SELECT
          u.id,
          u.first_name,
          u.last_name,
          u.profile_image_url,
          COALESCE(pp.location, '') AS location,
          COALESCE(pp.interests, '{}'::text[]) AS interests,
          COALESCE(pp.avatar_url, u.profile_image_url) AS avatar_url,
          -- Derive tags from booked experience categories when no interests set
          ARRAY(
            SELECT DISTINCT e.category
            FROM bookings b2
            JOIN experiences e ON e.id = b2.experience_id
            WHERE b2.user_id = u.id
              AND b2.status NOT IN ('cancelled','refunded')
              AND e.category IS NOT NULL
            LIMIT 3
          ) AS booking_categories
        FROM users u
        INNER JOIN participant_profiles pp ON pp.user_id = u.id
        WHERE u.first_name IS NOT NULL
        ORDER BY pp.updated_at DESC NULLS LAST
        LIMIT 12
      `);

      const isAnonMember = (firstName: string | null, lastName: string | null): boolean => {
        const combined = `${firstName || ''} ${lastName || ''}`.toLowerCase().trim();
        if (!combined || combined.replace(/\s/g, '') === '') return true;
        if (combined.includes('anonymous')) return true;
        if (combined.includes('???')) return true;
        if (combined.includes('test')) return true;
        if (combined.startsWith('qa') || combined.includes(' qa')) return true;
        return false;
      };

      const members = (rows.rows as any[])
        .filter((row) => !isAnonMember(row.first_name, row.last_name))
        .map((row) => {
          // Merge explicit interests with booking-derived categories
          const explicitInterests: string[] = Array.isArray(row.interests) ? row.interests : [];
          const bookingCategories: string[] = Array.isArray(row.booking_categories) ? row.booking_categories : [];
          const allTags = Array.from(new Set([...explicitInterests, ...bookingCategories])).slice(0, 5);

          const firstName = row.first_name || "";
          const lastName = row.last_name || "";
          const lastInitial = lastName ? `${lastName[0]}.` : "";
          const displayName = lastInitial ? `${firstName} ${lastInitial}` : firstName;

          return {
            id: row.id,
            displayName,
            avatarUrl: row.avatar_url || null,
            location: row.location || null,
            tags: allTags,
          };
        });

      res.json(members);
    } catch (error) {
      console.error("Error fetching community members:", error);
      res.status(500).json({ message: "Failed to fetch members" });
    }
  });

  app.get("/api/community/events", async (req, res) => {
    try {
      const events = await storage.getCommunityEvents();
      res.json(events);
    } catch (error) {
      console.error("Error fetching community events:", error);
      res.status(500).json({ message: "Failed to fetch events" });
    }
  });

  // Community Activity Feed — real events pulled from the database
  app.get("/api/community/activity", async (req, res) => {
    try {
      // Recent bookings with participant first name + experience title
      const recentBookings = await db.execute(`
        SELECT
          b.id,
          b.user_id,
          b.created_at,
          b.experience_id,
          e.title AS experience_title,
          e.location AS experience_location,
          e.max_participants,
          e.current_participants,
          e.mvg_status,
          u.first_name,
          u.last_name,
          pp.display_name,
          pp.avatar_url,
          'booking' AS event_type
        FROM bookings b
        JOIN experiences e ON b.experience_id = e.id
        JOIN users u ON b.user_id = u.id
        LEFT JOIN participant_profiles pp ON pp.user_id = u.id
        WHERE b.status IN ('pending', 'confirmed', 'deposit_authorized')
          AND e.status = 'approved'
          AND b.created_at > NOW() - INTERVAL '30 days'
        ORDER BY b.created_at DESC
        LIMIT 20
      `);

      // Recently confirmed experiences
      const confirmedExperiences = await db.execute(`
        SELECT
          e.id,
          e.title,
          e.location,
          e.updated_at AS created_at,
          'confirmed' AS event_type
        FROM experiences e
        WHERE e.mvg_status = 'met'
          AND e.status = 'approved'
          AND e.updated_at > NOW() - INTERVAL '30 days'
        ORDER BY e.updated_at DESC
        LIMIT 5
      `);

      // Platform stats
      const statsResult = await db.execute(`
        SELECT
          (SELECT COUNT(DISTINCT b.user_id)
           FROM bookings b
           WHERE b.status IN ('pending', 'confirmed', 'deposit_authorized')) AS total_travelers,
          (SELECT COUNT(*)
           FROM experiences e
           WHERE e.mvg_status = 'met' AND e.status = 'approved') AS confirmed_trips,
          (SELECT COUNT(DISTINCT pp.location)
           FROM participant_profiles pp
           WHERE pp.location IS NOT NULL AND pp.location != '') AS total_countries
      `);

      // Build feed items from bookings
      const bookingItems = (recentBookings.rows as any[]).map((row: any) => {
        const firstName = row.display_name
          ? row.display_name.split(' ')[0]
          : (row.first_name || 'Someone');
        const spotsLeft = row.max_participants != null && row.current_participants != null
          ? row.max_participants - row.current_participants
          : null;

        let text = `${firstName} joined ${row.experience_title}`;
        let type = 'joined';
        if (spotsLeft !== null && spotsLeft <= 3 && spotsLeft > 0) {
          text = `Only ${spotsLeft} spot${spotsLeft === 1 ? '' : 's'} left in ${row.experience_title}`;
          type = 'low_spots';
        }

        // Filter test/qa/anonymous/blank accounts from activity feed
        const rawName = `${row.first_name || ''} ${row.last_name || ''}`.toLowerCase().trim();
        const isTestUser = !rawName || rawName.replace(/\s/g, '') === '' ||
          rawName.includes('anonymous') || rawName.includes('???') ||
          rawName.includes('test') || rawName.startsWith('qa') || rawName.includes(' qa');

        return {
          id: `booking-${row.id}`,
          type: isTestUser ? 'skip' : type,
          text,
          experienceName: row.experience_title,
          experienceLocation: row.experience_location,
          firstName: isTestUser ? null : firstName,
          avatarUrl: isTestUser ? null : (row.avatar_url || null),
          userId: isTestUser ? null : (row.user_id || null),
          createdAt: row.created_at,
        };
      });

      // Build feed items from confirmed experiences
      const confirmedItems = (confirmedExperiences.rows as any[]).map((row: any) => ({
        id: `confirmed-${row.id}`,
        type: 'confirmed',
        text: `Trip confirmed — ${row.title} is happening!`,
        experienceName: row.title,
        experienceLocation: row.location,
        firstName: null,
        avatarUrl: null,
        createdAt: row.created_at,
      }));

      // Merge and sort by timestamp descending, keep latest 20 — filter test accounts
      const allItems = [...bookingItems, ...confirmedItems]
        .filter(item => item.type !== 'skip')
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 20);

      const statsRow = (statsResult.rows as any[])[0] || {};

      res.json({
        feed: allItems,
        stats: {
          totalTravelers: parseInt(statsRow.total_travelers || '0', 10),
          confirmedTrips: parseInt(statsRow.confirmed_trips || '0', 10),
          totalCountries: parseInt(statsRow.total_countries || '0', 10),
        },
      });
    } catch (error) {
      console.error("Error fetching community activity:", error);
      res.status(500).json({ message: "Failed to fetch community activity" });
    }
  });

  // Additional Admin dashboard routes for managing venues and services
  // Note: /api/admin/experiences is defined earlier with MVG enrichment

  app.get("/api/admin/venues", isAuthenticated, async (req: any, res) => {
    try {
      if (!await checkIsAdmin(req)) {
        return res.status(403).json({ message: "Admin access required" });
      }
      const venues = await storage.getVenuesWithCreators();
      res.json(venues);
    } catch (error) {
      console.error("Error fetching admin venues:", error);
      res.status(500).json({ message: "Failed to fetch admin venues" });
    }
  });

  app.delete("/api/admin/venues/:id", isAuthenticated, async (req: any, res) => {
    try {
      if (!await checkIsAdmin(req)) {
        return res.status(403).json({ message: "Admin access required" });
      }
      await storage.deleteVenue(req.params.id);
      res.json({ message: "Venue deleted successfully" });
    } catch (error) {
      console.error("Error deleting venue:", error);
      res.status(500).json({ message: "Failed to delete venue" });
    }
  });

  app.get("/api/admin/venue-availability", isAuthenticated, async (req: any, res) => {
    try {
      if (!await checkIsAdmin(req)) {
        return res.status(403).json({ message: "Admin access required" });
      }
      
      // Get all venues
      const venues = await storage.getVenues({});
      
      // Get availability for all venues
      const availabilityPromises = venues.map(async (venue) => {
        const availability = await storage.getVenueAvailability(venue.id);
        return availability.map(avail => ({ ...avail, venue }));
      });
      
      const allAvailability = (await Promise.all(availabilityPromises)).flat();
      res.json(allAvailability);
    } catch (error) {
      console.error("Error fetching admin venue availability:", error);
      res.status(500).json({ message: "Failed to fetch admin venue availability" });
    }
  });

  app.get("/api/admin/services", isAuthenticated, async (req: any, res) => {
    try {
      if (!await checkIsAdmin(req)) {
        return res.status(403).json({ message: "Admin access required" });
      }
      const services = await storage.getServiceProviders({});
      res.json(services);
    } catch (error) {
      console.error("Error fetching admin services:", error);
      res.status(500).json({ message: "Failed to fetch admin services" });
    }
  });

  // Admin Promoter Management Routes
  app.get("/api/admin/promoters", isAuthenticated, async (req: any, res) => {
    try {
      if (!await checkIsAdmin(req)) {
        return res.status(403).json({ message: "Admin access required" });
      }
      
      const promoters = await storage.getAllPromoters();
      
      // Get earnings summary for each promoter
      const promotersWithStats = await Promise.all(promoters.map(async (promoter) => {
        const earnings = await storage.getPromoterEarningsSummary(promoter.id);
        
        // Aggregate stats across currencies
        let totalBookings = 0;
        let estimatedByCurrency: Record<string, number> = {};
        let lockedByCurrency: Record<string, number> = {};
        let voidedByCurrency: Record<string, number> = {};
        
        for (const entry of earnings.byCurrency) {
          totalBookings += entry.totalBookings;
          estimatedByCurrency[entry.currency] = (estimatedByCurrency[entry.currency] || 0) + entry.estimated;
          lockedByCurrency[entry.currency] = (lockedByCurrency[entry.currency] || 0) + entry.locked;
          voidedByCurrency[entry.currency] = (voidedByCurrency[entry.currency] || 0) + entry.voided;
        }
        
        return {
          id: promoter.id,
          email: promoter.email,
          firstName: promoter.firstName,
          lastName: promoter.lastName,
          promoterCode: promoter.promoterCode,
          totalBookings,
          estimatedByCurrency,
          lockedByCurrency,
          voidedByCurrency,
        };
      }));
      
      res.json(promotersWithStats);
    } catch (error) {
      console.error("Error fetching admin promoters:", error);
      res.status(500).json({ message: "Failed to fetch promoters" });
    }
  });

  app.get("/api/admin/promoters/:promoterId", isAuthenticated, async (req: any, res) => {
    try {
      if (!await checkIsAdmin(req)) {
        return res.status(403).json({ message: "Admin access required" });
      }
      
      const promoterId = req.params.promoterId;
      const promoter = await storage.getUser(promoterId);
      
      if (!promoter) {
        return res.status(404).json({ message: "Promoter not found" });
      }
      
      // Get earnings summary
      const earnings = await storage.getPromoterEarningsSummary(promoterId);
      
      // Get all bookings with details
      const bookingsWithDetails = await storage.getPromoterBookingsWithDetails(promoterId);
      
      res.json({
        promoter: {
          id: promoter.id,
          email: promoter.email,
          firstName: promoter.firstName,
          lastName: promoter.lastName,
          promoterCode: promoter.promoterCode,
        },
        earnings,
        bookings: bookingsWithDetails.map(({ booking, experience, participant }) => ({
          id: booking.id,
          experienceId: booking.experienceId,
          experienceName: experience.title,
          ticketSkuId: booking.ticketSkuId,
          spots: booking.spots || 1,
          bookingValue: booking.totalAmount,
          commissionAmount: booking.commissionAmount,
          commissionStatus: booking.commissionStatus || 'estimated',
          currency: booking.commissionCurrency || experience.currency || 'EUR',
          participantName: participant ? `${participant.firstName || ''} ${participant.lastName || ''}`.trim() || participant.email : 'Unknown',
          createdAt: booking.createdAt,
        })),
      });
    } catch (error) {
      console.error("Error fetching admin promoter detail:", error);
      res.status(500).json({ message: "Failed to fetch promoter details" });
    }
  });

  app.patch("/api/admin/experiences/:id", isAuthenticated, async (req: any, res) => {
    try {
      if (!await checkIsAdmin(req)) {
        return res.status(403).json({ message: "Admin access required" });
      }
      const userId = req.user.claims.sub;
      const { status, reviewNotes } = req.body;
      
      let experience;
      if (status === 'approved') {
        experience = await storage.approveExperience(req.params.id, userId, reviewNotes);
        console.log(`[Admin] Experience ${req.params.id} approved by ${userId}`);
      } else if (status === 'rejected') {
        experience = await storage.rejectExperience(req.params.id, userId, reviewNotes);
        console.log(`[Admin] Experience ${req.params.id} rejected by ${userId}`);
      } else {
        return res.status(400).json({ message: "Invalid status. Use 'approved' or 'rejected'" });
      }
      
      res.json(experience);
    } catch (error) {
      console.error("Error updating experience status:", error);
      res.status(500).json({ message: "Failed to update experience status" });
    }
  });

  app.patch("/api/admin/venues/:id", isAuthenticated, async (req: any, res) => {
    try {
      if (!await checkIsAdmin(req)) {
        return res.status(403).json({ message: "Admin access required" });
      }
      const { status, reviewNotes } = req.body;
      if (status === 'approved') {
        const venue = await storage.approveVenue(req.params.id);
        res.json(venue);
      } else {
        await storage.rejectVenue(req.params.id);
        res.json({ message: "Venue rejected and removed" });
      }
    } catch (error) {
      console.error("Error updating venue status:", error);
      res.status(500).json({ message: "Failed to update venue status" });
    }
  });

  // Update venue display preferences (admin only)
  app.patch("/api/admin/venues/:id/display-prefs", isAuthenticated, async (req: any, res) => {
    try {
      if (!await checkIsAdmin(req)) {
        return res.status(403).json({ message: "Admin access required" });
      }
      
      const { displayPrefs } = req.body;
      const venue = await storage.updateVenueDisplayPrefs(req.params.id, displayPrefs);
      res.json(venue);
    } catch (error) {
      console.error("Error updating venue display preferences:", error);
      res.status(500).json({ message: "Failed to update display preferences" });
    }
  });

  app.patch("/api/admin/services/:id", isAuthenticated, async (req: any, res) => {
    try {
      if (!await checkIsAdmin(req)) {
        return res.status(403).json({ message: "Admin access required" });
      }
      const { status, reviewNotes } = req.body;
      if (status === 'approved') {
        const service = await storage.approveServiceProvider(req.params.id);
        res.json(service);
      } else {
        await storage.rejectServiceProvider(req.params.id);
        res.json({ message: "Service rejected and removed" });
      }
    } catch (error) {
      console.error("Error updating service status:", error);
      res.status(500).json({ message: "Failed to update service status" });
    }
  });

  // Duplicate endpoint removed - kept main one at line 874

  app.put("/api/creator-images", isAuthenticated, async (req: any, res) => {
    if (!req.body.imageURL) {
      return res.status(400).json({ error: "imageURL is required" });
    }

    const userId = process.env.NODE_ENV === 'development' ? "45788955" : req.user?.claims?.sub;

    try {
      const objectStorageService = new ObjectStorageService();
      const objectPath = await objectStorageService.trySetObjectEntityAclPolicy(
        req.body.imageURL,
        {
          owner: userId,
          visibility: "public",
        },
      );

      res.status(200).json({
        objectPath: objectPath,
      });
    } catch (error) {
      console.error("Error setting creator image:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // User bookings route
  app.get("/api/user/bookings", async (req: any, res) => {
    try {
      const userId = process.env.NODE_ENV === 'development' ? "45788955" : req.user.claims.sub;
      console.log(`Fetching bookings for user: ${userId}`);
      const bookings = await storage.getUserBookings(userId);
      console.log(`Found ${bookings?.length || 0} bookings for user`);
      res.json(bookings || []);
    } catch (error) {
      console.error("Error fetching user bookings:", error);
      res.status(500).json({ message: "Failed to fetch bookings" });
    }
  });

  // User reservations route (soft-hold system)
  app.get("/api/user/reservations", async (req: any, res) => {
    try {
      const userId = process.env.NODE_ENV === 'development' ? "45788955" : req.user.claims.sub;
      console.log(`Fetching reservations for user: ${userId}`);
      
      // Get reservations
      const reservations = await storage.getUserActiveReservations(userId);
      console.log(`Found ${reservations?.length || 0} active reservations`);
      
      // Enrich with experience metadata
      const enrichedReservations = await Promise.all(
        reservations.map(async (reservation) => {
          const experience = await storage.getExperience(reservation.experienceId);
          return {
            ...reservation,
            experienceTitle: experience?.title || "Unknown Experience",
            experienceStartDate: experience?.startDate,
            experienceEndDate: experience?.endDate,
            experienceLocation: experience?.location,
            experiencePrice: experience?.price,
            experienceShortDescription: experience?.shortDescription,
            expiresAtISO: reservation.expiresAt.toISOString(),
          };
        })
      );
      
      res.json(enrichedReservations);
    } catch (error) {
      console.error("Error fetching user reservations:", error);
      res.status(500).json({ message: "Failed to fetch reservations" });
    }
  });

  // Creator onboarding checklist
  app.get("/api/creator/onboard", async (req: any, res) => {
    try {
      const userId = process.env.NODE_ENV === 'development' ? "45788955" : req.user.claims.sub;
      
      // Get creator profile
      const profile = await storage.getCreatorProfileByUserId(userId);
      
      // Get creator experiences
      const experiences = await storage.getExperiencesByCreator(userId);
      
      // Get user venues (if any)
      const venues = await storage.getVenuesByCreator(userId);
      
      // Build checklist
      const checklist = {
        profile: {
          completed: !!profile && !!profile.displayName && !!profile.bio && !!profile.payoutEmail,
          data: {
            hasProfile: !!profile,
            displayName: profile?.displayName || null,
            bio: profile?.bio || null,
            payoutEmail: profile?.payoutEmail || null,
            profilePhoto: profile?.profilePhoto || null,
            termsAccepted: profile?.termsAccepted || false
          }
        },
        payout: {
          completed: !!profile?.stripeAccountId && profile?.stripeVerificationStatus === 'verified',
          data: {
            stripeConnected: !!profile?.stripeAccountId,
            stripeVerified: profile?.stripeVerificationStatus === 'verified',
            stripeStatus: profile?.stripeVerificationStatus || 'pending'
          }
        },
        venue: {
          completed: venues && venues.length > 0,
          data: {
            venuesCreated: venues?.length || 0,
            venues: venues || []
          }
        },
        firstEvent: {
          completed: experiences && experiences.length > 0,
          data: {
            experiencesCreated: experiences?.length || 0,
            hasPublishedExperience: experiences?.some(exp => exp.status === 'approved') || false,
            experiences: experiences || []
          }
        }
      };

      // Calculate overall progress
      const completedItems = Object.values(checklist).filter(item => item.completed).length;
      const totalItems = Object.keys(checklist).length;
      const overallProgress = Math.round((completedItems / totalItems) * 100);

      res.json({
        checklist,
        progress: {
          completed: completedItems,
          total: totalItems,
          percentage: overallProgress
        }
      });
    } catch (error) {
      console.error("Error fetching creator onboarding status:", error);
      res.status(500).json({ message: "Failed to fetch onboarding status" });
    }
  });

  // Update creator onboarding progress
  app.post("/api/creator/onboard", async (req: any, res) => {
    try {
      const userId = process.env.NODE_ENV === 'development' ? "45788955" : req.user.claims.sub;
      const { step, data } = req.body;

      if (!step) {
        return res.status(400).json({ message: "Step is required" });
      }

      let result;
      
      switch (step) {
        case 'profile':
          // Update or create creator profile
          if (data) {
            result = await storage.createOrUpdateCreatorProfile(userId, data);
          }
          break;
          
        case 'payout':
          // Trigger Stripe Connect setup
          if (data?.initializeStripe) {
            const user = await storage.getUser(userId);
            let account;
            const existingProfile = await storage.getCreatorProfileByUserId(userId);
            
            if (existingProfile?.stripeAccountId) {
              account = await stripe.accounts.retrieve(existingProfile.stripeAccountId);
            } else {
              account = await stripe.accounts.create({
                type: 'express',
                email: user?.email || undefined,
                metadata: { userId: userId }
              });
              
              // Update creator profile with Stripe account ID
              await storage.updateCreatorProfileStripe(userId, account.id);
            }
            
            result = { stripeAccountId: account.id };
          }
          break;
          
        case 'venue':
          // This would typically be handled by the venue creation endpoint
          // Just acknowledge the step completion
          result = { message: "Venue step acknowledged" };
          break;
          
        case 'firstEvent':
          // This would typically be handled by the experience creation endpoint
          // Just acknowledge the step completion
          result = { message: "First event step acknowledged" };
          break;
          
        default:
          return res.status(400).json({ message: "Invalid step" });
      }

      res.json({ 
        message: `${step} step updated successfully`,
        result 
      });
    } catch (error) {
      console.error("Error updating creator onboarding:", error);
      res.status(500).json({ message: "Failed to update onboarding progress" });
    }
  });

  // Creator experiences route
  app.get("/api/creator/experiences", async (req: any, res) => {
    try {
      const userId = process.env.NODE_ENV === 'development' ? "45788955" : req.user.claims.sub;
      console.log(`Fetching creator experiences for user: ${userId}`);
      const experiences = await storage.getExperiencesByCreator(userId);
      // Enrich with MVG progress from single source of truth
      const enrichedExperiences = await Promise.all(
        (experiences || []).map(async (exp) => {
          const mvgProgress = await storage.getMVGProgress(exp.id);
          const mvgMet = mvgProgress.mvg_met;
          const resolvedMvgStatus = mvgMet ? 'met' : (exp.mvgStatus || 'pending');
          return {
            ...exp,
            currentParticipants: mvgProgress.current_participants,
            participantCount: mvgProgress.current_participants,
            mvgMet,
            mvgStatus: resolvedMvgStatus,
            lifecycleStatus: computeLifecycleStatus({ ...exp, mvgStatus: resolvedMvgStatus, mvgMet }),
          };
        })
      );
      console.log(`Found ${enrichedExperiences.length} experiences for creator`);
      res.json(enrichedExperiences);
    } catch (error) {
      console.error("Error fetching creator experiences:", error);
      res.status(500).json({ message: "Failed to fetch creator experiences" });
    }
  });

  // Creator pending experiences route
  app.get("/api/creator/experiences/pending", async (req: any, res) => {
    try {
      const userId = process.env.NODE_ENV === 'development' ? "45788955" : req.user.claims.sub;
      console.log(`Fetching pending experiences for creator: ${userId}`);
      const pendingExperiences = await storage.getPendingExperiencesByCreator(userId);
      // Enrich with MVG progress from single source of truth
      const enrichedExperiences = await Promise.all(
        (pendingExperiences || []).map(async (exp) => {
          const mvgProgress = await storage.getMVGProgress(exp.id);
          const mvgMet = mvgProgress.mvg_met;
          const resolvedMvgStatus = mvgMet ? 'met' : (exp.mvgStatus || 'pending');
          return {
            ...exp,
            currentParticipants: mvgProgress.current_participants,
            participantCount: mvgProgress.current_participants,
            mvgMet,
            mvgStatus: resolvedMvgStatus,
            lifecycleStatus: computeLifecycleStatus({ ...exp, mvgStatus: resolvedMvgStatus, mvgMet }),
          };
        })
      );
      console.log(`Found ${enrichedExperiences.length} pending experiences for creator`);
      res.json(enrichedExperiences);
    } catch (error) {
      console.error("Error fetching creator pending experiences:", error);
      res.status(500).json({ message: "Failed to fetch pending experiences" });
    }
  });

  // AI Travel API health check endpoint
  app.get("/api/ai-travel/health", async (req, res) => {
    try {
      // Check if external APIs are available
      const healthStatus = {
        status: 'development',
        services: {
          amadeus: { available: false, reason: 'Integration pending' },
          getYourGuide: { available: false, reason: 'Integration pending' },
          openAI: { available: false, reason: 'Travel AI not configured' },
          platform: { available: true, reason: 'Local experiences available' }
        },
        capabilities: {
          flights: false,
          hotels: false,
          externalActivities: false,
          platformExperiences: true,
          basicItinerary: false
        },
        message: 'AI Travel Planner is in development. Platform experiences are available for browsing.'
      };
      
      res.json(healthStatus);
    } catch (error) {
      console.error("Health check error:", error);
      res.status(503).json({ 
        status: 'unavailable',
        message: 'Unable to check service status'
      });
    }
  });

  // AI Travel Planning endpoint - with intelligent fallback
  app.post("/api/ai-travel/generate-plan", async (req, res) => {
    try {
      const { destination, startDate, endDate, travelers, budget, travelStyle, interests } = req.body;
      
      // Check API availability first
      const hasOpenAI = !!process.env.OPENAI_API_KEY;
      const hasAmadeus = !!process.env.AMADEUS_API_KEY; // placeholder for future
      const hasGetYourGuide = !!process.env.GETYOURGUIDE_API_KEY; // placeholder for future
      
      // If no external APIs are available, return placeholder response
      if (!hasOpenAI && !hasAmadeus && !hasGetYourGuide) {
        return res.json({
          isPlaceholder: true,
          status: 'development',
          message: 'AI Travel Planner is in development. Explore our platform experiences while we build this feature!',
          platformExperiences: await storage.getExperiences({ status: "approved", limit: 5 }),
          fallbackOptions: {
            browsePlatform: true,
            manualPlanning: true
          }
        });
      }
      
      // If APIs are available, attempt full travel plan generation
      const mockPlan = {
        id: `plan-${Date.now()}`,
        destination,
        dates: `${startDate} to ${endDate}`,
        travelers,
        budget,
        travelStyle,
        itinerary: [
          {
            day: 1,
            activities: [
              "Arrival and hotel check-in",
              "Walking tour of city center",
              "Welcome dinner at local restaurant"
            ],
            accommodation: "Central Hotel - Premium Room",
            transportation: "Airport shuttle, walking",
            meals: ["Breakfast (hotel)", "Lunch (cafe)", "Dinner (restaurant)"]
          },
          {
            day: 2,
            activities: [
              "Visit main cultural attractions",
              "Local market exploration", 
              "Cooking class experience"
            ],
            accommodation: "Central Hotel - Premium Room",
            transportation: "Public transport, walking",
            meals: ["Breakfast (hotel)", "Street food", "Cooking class dinner"]
          },
          {
            day: 3,
            activities: [
              "Day trip to nearby attractions",
              "Scenic viewpoint visit",
              "Departure preparations"
            ],
            accommodation: "Central Hotel - Premium Room",
            transportation: "Tour bus, walking",
            meals: ["Breakfast (hotel)", "Packed lunch", "Farewell dinner"]
          }
        ],
        flights: [
          {
            airline: "Major Airlines",
            departure: "Your City - 8:00 AM",
            arrival: `${destination} - 2:00 PM`,
            price: budget === 'budget' ? 299 : budget === 'mid-range' ? 599 : 1299
          },
          {
            airline: "Major Airlines", 
            departure: `${destination} - 6:00 PM`,
            arrival: "Your City - 11:00 PM",
            price: budget === 'budget' ? 329 : budget === 'mid-range' ? 629 : 1399
          }
        ],
        hotels: [
          {
            name: "Central Hotel",
            rating: budget === 'budget' ? 3 : budget === 'mid-range' ? 4 : 5,
            price: budget === 'budget' ? 89 : budget === 'mid-range' ? 189 : 389,
            location: `Downtown ${destination}`
          },
          {
            name: "Boutique Inn",
            rating: budget === 'budget' ? 3 : budget === 'mid-range' ? 4 : 5,
            price: budget === 'budget' ? 109 : budget === 'mid-range' ? 229 : 459,
            location: `Historic District ${destination}`
          }
        ]
      };

      // Simulate AI processing time only if we have working APIs
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      res.json(mockPlan);
    } catch (error) {
      console.error("Error generating travel plan:", error);
      // Return graceful fallback instead of error
      res.json({
        isPlaceholder: true,
        status: 'error_fallback',
        message: 'Travel planning temporarily unavailable. Check out these great experiences instead!',
        platformExperiences: await storage.getExperiences({ status: "approved", limit: 5 }).catch(() => []),
        fallbackOptions: {
          browsePlatform: true,
          manualPlanning: true,
          contactSupport: true
        }
      });
    }
  });

  // AI Assistant endpoint for search queries
  app.post("/api/ai-assistant", async (req, res) => {
    try {
      const { message } = req.body;
      
      // Simple query classification for onboarding routes
      const response = classifyUserQueryForAssistant(message);
      res.json(response);
    } catch (error) {
      console.error("AI Assistant error:", error);
      res.status(500).json({ 
        message: "Let me help you explore Great. manually:",
        actions: [
          { label: "Browse Experiences", action: "navigate", route: "/experiences" },
          { label: "Create Profile", action: "navigate", route: "/participant-profile-setup" },
          { label: "Start Creating", action: "navigate", route: "/creator" }
        ]
      });
    }
  });

  // Helper function to classify user queries for AI assistant
  function classifyUserQueryForAssistant(query: string) {
    const lowerQuery = query.toLowerCase();
    
    // Creator onboarding queries
    if (lowerQuery.includes("create") && (lowerQuery.includes("experience") || lowerQuery.includes("own") || lowerQuery.includes("host"))) {
      return {
        message: "Perfect! I'll help you create your own experience. Let's start with setting up your creator profile.",
        actions: [
          { label: "Start Creator Setup", action: "navigate", route: "/creator" }
        ]
      };
    }
    
    if (lowerQuery.includes("start creating") || lowerQuery.includes("become creator") || lowerQuery.includes("host retreat")) {
      return {
        message: "Great! Let's get you set up as a creator so you can start hosting amazing experiences.",
        actions: [
          { label: "Begin Creator Onboarding", action: "navigate", route: "/creator" }
        ]
      };
    }
    
    // Participant/community onboarding queries  
    if (lowerQuery.includes("join community") || lowerQuery.includes("create profile") || lowerQuery.includes("get started")) {
      return {
        message: "Welcome to Great.! Let's set up your profile so you can start connecting with amazing experiences and people.",
        actions: [
          { label: "Create Your Profile", action: "navigate", route: "/participant-profile-setup" }
        ]
      };
    }
    
    // Journey builder queries
    if (lowerQuery.includes("organize") && lowerQuery.includes("workation")) {
      return {
        message: "Awesome! I'll help you organize the perfect workation experience.",
        actions: [
          { label: "Start Journey Builder", action: "navigate", route: "/creator" }
        ]
      };
    }
    
    // Location-based queries with filters
    if (lowerQuery.includes("beach") && (lowerQuery.includes("wifi") || lowerQuery.includes("remote"))) {
      return {
        message: "Looking for beach workations with great wifi? Here are some perfect options:",
        actions: [
          { label: "Beach Workations", action: "navigate", route: "/experiences?search=beach+wifi+workation" }
        ]
      };
    }
    
    if (lowerQuery.includes("city") && (lowerQuery.includes("coworking") || lowerQuery.includes("hub"))) {
      return {
        message: "City workations with coworking spaces coming right up!",
        actions: [
          { label: "City Coworking Spaces", action: "navigate", route: "/experiences?search=city+coworking+workation" }
        ]
      };
    }
    
    // Default fallback
    return {
      message: "I'd love to help! What are you most interested in?",
      actions: [
        { label: "Browse Experiences", action: "navigate", route: "/experiences" },
        { label: "Create My Own", action: "navigate", route: "/creator" },
        { label: "Join Community", action: "navigate", route: "/participant-profile-setup" },
        { label: "Plan Trip", action: "navigate", route: "/ai-travel" }
      ]
    };
  }

  // AI Creation Assistant endpoint
  app.post("/api/ai-creation-assistant", async (req, res) => {
    try {
      const { message, context, experienceData, userType } = req.body;

      if (!process.env.OPENAI_API_KEY) {
        throw new Error('OpenAI API key not configured');
      }

      // Determine user type context for personalized questions
      const userTypeContext = getUserTypeContext(userType);

      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
          messages: [
            {
              role: "system",
              content: `You are the AI Creation Assistant for "Great." - helping users create transformative experiences step by step.

              User Type: ${userType} - ${userTypeContext}

              Your role:
              1. Guide experience creation through conversational flow
              2. Ask the right questions based on user type (individual creator vs venue vs service provider)
              3. Collect all necessary information: title, description, category, location, pricing, dates, itinerary
              4. Help with photo upload planning and creator background
              5. Be encouraging and professional

              Current experience data: ${JSON.stringify(experienceData)}

              Response format: JSON with:
              - "message" (string): Your conversational response
              - "actions" (array): Action buttons [{label, action, data}]
              - "experienceData" (object): Updated experience data if any
              - "isComplete" (boolean): True when all required data is collected
              - "nextStep" (string): What to collect next

              Keep responses conversational and focused on the next logical step.
              `
            },
            ...context.map((msg: any) => ({
              role: msg.type === 'user' ? 'user' : 'assistant',
              content: msg.content
            })),
            {
              role: "user",
              content: message
            }
          ],
          response_format: { type: "json_object" },
          temperature: 0.7
        })
      });

      if (!response.ok) {
        throw new Error('OpenAI API request failed');
      }

      const data = await response.json();
      const aiResponse = JSON.parse(data.choices[0].message.content);

      res.json(aiResponse);
    } catch (error) {
      console.error("AI Creation Assistant error:", error);
      
      // Fallback response
      res.json({
        message: "Let's continue building your experience! What would you like to focus on next?",
        actions: [
          { label: "Add Description", action: "add_description" },
          { label: "Set Location", action: "set_location" },
          { label: "Plan Itinerary", action: "plan_itinerary" },
          { label: "Upload Photos", action: "upload_photos" }
        ]
      });
    }
  });

  // Travel API endpoint with platform-first approach
  app.post('/api/ai-travel/generate-plan', async (req, res) => {
    try {
      const { destination, startDate, endDate, travelers, budget, travelStyle, interests } = req.body;
      
      // First, get platform experiences for the destination
      const platformExperiences = await storage.getExperiences({
        status: "approved",
        limit: 10
      });
      
      // Filter platform experiences by location/destination (improved matching)
      const destinationExperiences = platformExperiences.filter(exp => {
        const searchTerms = destination.toLowerCase().split(/[\s,]+/);
        const experienceText = `${exp.location} ${exp.title} ${exp.description}`.toLowerCase();
        return searchTerms.some((term: string) => experienceText.includes(term));
      });

      // Simulate GetYourGuide API call for additional experiences when platform doesn't have enough
      const externalExperiences = destinationExperiences.length < 3 ? 
        await getExternalExperiences(destination) : [];

      // Generate base travel plan structure
      const travelPlan = {
        destination,
        duration: Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24)),
        travelers: parseInt(travelers),
        budget,
        travelStyle,
        platformExperiences: destinationExperiences.slice(0, 3), // Platform experiences prioritized
        externalExperiences: externalExperiences, // Third-party experiences as fallback
        itinerary: generateBasicItinerary(destination, startDate, endDate, interests),
        flights: await getMockFlightData(destination), // Ready for Amadeus API integration
        hotels: await getMockHotelData(destination), // Ready for Amadeus API integration
        completeTripValue: calculateTripValue(destinationExperiences, externalExperiences)
      };

      res.json(travelPlan);
    } catch (error) {
      console.error("Error generating travel plan:", error);
      res.status(500).json({ error: "Failed to generate travel plan" });
    }
  });

  // Platform settings - returns fee config for dynamic UI
  app.get('/api/platform-settings', async (_req, res) => {
    try {
      const [settings] = await db.select().from(platformSettings).limit(1);
      if (settings) {
        res.json({
          platformFeePercentage: parseFloat(settings.platformFeePercentage ?? '15.00'),
          stripeFeePercentage: parseFloat(settings.stripeFeePercentage ?? '2.90'),
          stripeFeeFixed: settings.stripeFeeFixed ?? 30,
        });
      } else {
        res.json({ platformFeePercentage: 15, stripeFeePercentage: 2.9, stripeFeeFixed: 30 });
      }
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch platform settings' });
    }
  });

  // Revenue calculation endpoint for real-time preview
  app.post('/api/calculate-revenue', async (req, res) => {
    try {
      const { 
        amount, 
        managementType, 
        services, 
        creatorRole, 
        supportLevel,
        facilitatorServices,
        influencerRevShare,
        facilitatorBaseCommission,
        venuePercentage,
        creatorPercentage,
        platformPercentage 
      } = req.body;
      
      if (!amount || amount <= 0) {
        return res.status(400).json({ error: 'Valid amount required' });
      }

      // Support new venue split API
      if (venuePercentage !== undefined && creatorPercentage !== undefined && platformPercentage !== undefined) {
        try {
          const breakdown = calculateVenueSplitRevenueBreakdown(
            Math.round(amount * 100), // Convert to cents
            venuePercentage,
            creatorPercentage,
            platformPercentage
          );
          res.json(breakdown);
        } catch (error: any) {
          return res.status(400).json({ error: error.message });
        }
      } else if (creatorRole) {
        // Support role-based API with new options structure
        const breakdown = calculateRoleBasedRevenueBreakdown(
          Math.round(amount * 100), // Convert to cents
          creatorRole,
          {
            supportLevel: supportLevel || 'custom',
            facilitatorServices: facilitatorServices || [],
            influencerRevShare: influencerRevShare || 25,
            facilitatorBaseCommission: facilitatorBaseCommission || 20,
          }
        );
        res.json(breakdown);
      } else if (services) {
        // Legacy modular pricing support - use old function temporarily
        const breakdown = calculateRevenueBreakdown(
          Math.round(amount * 100),
          'creator_managed'
        );
        res.json(breakdown);
      } else {
        // Legacy two-tier model support
        const breakdown = calculateRevenueBreakdown(
          Math.round(amount * 100),
          managementType || 'creator_managed'
        );
        res.json(breakdown);
      }
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Keep old function for backward compatibility
  function calculateRevenueBreakdown(grossAmount: number, managementType: string = 'creator_managed') {
    const stripeFeeAmount = Math.round(grossAmount * 0.029 + 30);
    
    let platformFeeAmount: number;
    let netAmount: number;
    let feeDescription: string;
    let platformFeePercentage: number;
    
    if (managementType === 'great_managed') {
      platformFeePercentage = 80;
      feeDescription = 'Revenue Share (Great manages venue & services - you get 20%)';
      netAmount = Math.round(grossAmount * 0.20);
      platformFeeAmount = grossAmount - netAmount;
    } else {
      platformFeePercentage = 20;
      feeDescription = 'Platform Fee (Creator manages venue & services)';
      platformFeeAmount = Math.round(grossAmount * 0.20);
      netAmount = grossAmount - platformFeeAmount - stripeFeeAmount;
    }
    
    return {
      grossAmount,
      platformFeeAmount,
      platformFeePercentage,
      stripeFeeAmount: managementType === 'great_managed' ? 0 : stripeFeeAmount,
      netAmount: Math.max(0, netAmount),
      currency: 'usd',
      managementType,
      feeDescription
    };
  }

  // Enhanced booking endpoint with revenue tracking
  app.post('/api/experiences/:id/book', async (req: any, res) => {
    try {
      if (process.env.NODE_ENV !== 'development' && !req.isAuthenticated()) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const { id: experienceId } = req.params;
      const userId = process.env.NODE_ENV === 'development' ? '45788955' : req.user.claims.sub;

      // Get experience details
      const experience = await storage.getExperience(experienceId);
      if (!experience) {
        return res.status(404).json({ error: 'Experience not found' });
      }

      // Check availability
      if ((experience.currentParticipants || 0) >= experience.maxParticipants) {
        return res.status(400).json({ error: 'Experience is fully booked' });
      }

      const grossAmount = Math.round(parseFloat(experience.price) * 100); // Convert to cents
      const breakdown = calculateRevenueBreakdown(grossAmount);

      // Create Stripe Payment Intent
      const paymentIntent = await stripe.paymentIntents.create({
        amount: grossAmount,
        currency: 'usd',
        metadata: {
          experienceId,
          userId,
          creatorId: experience.creatorId,
          netAmount: breakdown.netAmount.toString(),
          platformFee: breakdown.platformFeeAmount.toString(),
        },
      });

      // Create pending booking
      const booking = await storage.createBooking({
        experienceId,
        userId,
        stripePaymentIntentId: paymentIntent.id,
        amount: experience.price,
        totalPrice: experience.price,
        status: 'pending'
      });

      res.json({
        clientSecret: paymentIntent.client_secret,
        bookingId: booking.id,
        revenueBreakdown: breakdown
      });

    } catch (error: any) {
      console.error('Booking error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ============ RESERVATION ROUTES (Soft-Hold System) ============

  // Create soft-hold reservation
  app.post('/api/experiences/:id/reserve', async (req: any, res) => {
    try {
      const userId = process.env.NODE_ENV === 'development' ? "45788955" : req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const { id: experienceId } = req.params;
      const { reservationNotes } = req.body;

      // Get experience details
      const experience = await storage.getExperience(experienceId);
      if (!experience) {
        return res.status(404).json({ error: 'Experience not found' });
      }

      // Check if soft-hold is enabled
      if (!experience.softHoldEnabled) {
        return res.status(400).json({ error: 'Soft-hold reservations are not enabled for this experience' });
      }

      // Check total capacity (participants + active reservations)
      const totalOccupied = (experience.currentParticipants || 0) + (experience.currentReservations || 0);
      if (totalOccupied >= experience.maxParticipants) {
        return res.status(400).json({ error: 'Experience is fully booked (including reservations)' });
      }

      // Check if user already has an active reservation for this experience
      const userActiveReservations = await storage.getUserActiveReservations(userId);
      const existingReservation = userActiveReservations.find(r => r.experienceId === experienceId);
      if (existingReservation) {
        return res.status(400).json({ error: 'You already have an active reservation for this experience' });
      }

      // Calculate expiration time
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + (experience.softHoldDurationHours || 48));

      // Create reservation
      const reservation = await storage.createReservation({
        experienceId,
        userId,
        expiresAt,
        reservationNotes: reservationNotes || null,
        status: 'active'
      });

      res.status(201).json({
        reservation,
        message: `Spot reserved until ${safeToISOString(expiresAt)}`,
        expiresAt: safeToISOString(expiresAt)
      });

    } catch (error: any) {
      console.error('Reservation creation error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Convert reservation to paid booking
  app.post('/api/reservations/:id/convert', async (req: any, res) => {
    try {
      const userId = process.env.NODE_ENV === 'development' ? "45788955" : req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const { id: reservationId } = req.params;

      // Get reservation details
      const reservation = await storage.getReservation(reservationId);
      if (!reservation) {
        return res.status(404).json({ error: 'Reservation not found' });
      }

      // Verify ownership
      if (reservation.userId !== userId) {
        return res.status(403).json({ error: 'Not authorized to convert this reservation' });
      }

      // Check if reservation is still active
      if (reservation.status !== 'active') {
        return res.status(400).json({ error: 'Reservation is no longer active' });
      }

      // Check if reservation has expired
      if (new Date() > new Date(reservation.expiresAt)) {
        // Auto-expire the reservation
        await storage.expireReservation(reservationId);
        return res.status(400).json({ error: 'Reservation has expired' });
      }

      // Get experience details for payment processing
      const experience = await storage.getExperience(reservation.experienceId);
      if (!experience) {
        return res.status(404).json({ error: 'Experience not found' });
      }

      // Calculate amounts
      const grossAmount = Math.round(parseFloat(experience.price) * 100); // Convert to cents
      let chargeAmount = grossAmount;
      let isDepositOnly = false;

      // DATA CONTRACT: Use ticketSkus.depositPerPerson or experience.depositAmount (fixed amounts only)
      const ticketSkus = experience.ticketSkus as any[] || [];
      const fixedDeposit = ticketSkus.length > 0 && ticketSkus[0]?.depositPerPerson
        ? parseFloat(ticketSkus[0].depositPerPerson)
        : (experience.depositAmount ? parseFloat(experience.depositAmount.toString()) : 0);
      if (experience.depositEnabled && fixedDeposit > 0) {
        isDepositOnly = true;
        chargeAmount = Math.round(fixedDeposit * 100); // Convert to cents
      }

      // Create Stripe Payment Intent
      const paymentIntent = await stripe.paymentIntents.create({
        amount: chargeAmount,
        currency: 'usd',
        capture_method: 'manual',
        confirmation_method: 'automatic',
        metadata: {
          experienceId: reservation.experienceId,
          userId,
          reservationId,
          isDepositPayment: isDepositOnly.toString(),
          fullPrice: (grossAmount / 100).toString()
        },
      });

      // Create booking from reservation
      const booking = await storage.createBooking({
        experienceId: reservation.experienceId,
        userId,
        stripePaymentIntentId: paymentIntent.id,
        amount: experience.price,
        isDepositOnly,
        totalPrice: experience.price,
        depositAmount: isDepositOnly ? (chargeAmount / 100).toString() : "0.00",
        balanceAmount: isDepositOnly ? ((grossAmount - chargeAmount) / 100).toString() : "0.00",
        status: 'pending'
      });

      // Convert reservation to booking
      await storage.convertReservationToBooking(reservationId, booking.id);

      res.json({
        clientSecret: paymentIntent.client_secret,
        bookingId: booking.id,
        message: 'Reservation converted to booking',
        paymentRequired: chargeAmount / 100,
        isDepositOnly
      });

    } catch (error: any) {
      console.error('Reservation conversion error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get user's active reservations
  app.get('/api/reservations', async (req: any, res) => {
    try {
      const userId = process.env.NODE_ENV === 'development' ? "45788955" : req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const reservations = await storage.getUserActiveReservations(userId);

      // Enrich with experience details
      const enrichedReservations = await Promise.all(
        reservations.map(async (reservation) => {
          const experience = await storage.getExperience(reservation.experienceId);
          return {
            ...reservation,
            experience: experience ? {
              id: experience.id,
              title: experience.title,
              shortDescription: experience.shortDescription,
              coverImageUrl: experience.coverImageUrl,
              startDate: experience.startDate,
              endDate: experience.endDate,
              location: experience.location,
              price: experience.price
            } : null
          };
        })
      );

      res.json(enrichedReservations);

    } catch (error: any) {
      console.error('Error fetching reservations:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Cancel reservation
  app.delete('/api/reservations/:id', async (req: any, res) => {
    try {
      const userId = process.env.NODE_ENV === 'development' ? "45788955" : req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const { id: reservationId } = req.params;

      // Get reservation details
      const reservation = await storage.getReservation(reservationId);
      if (!reservation) {
        return res.status(404).json({ error: 'Reservation not found' });
      }

      // Verify ownership
      if (reservation.userId !== userId) {
        return res.status(403).json({ error: 'Not authorized to cancel this reservation' });
      }

      // Cancel reservation
      await storage.cancelReservation(reservationId);

      res.json({ message: 'Reservation cancelled successfully' });

    } catch (error: any) {
      console.error('Error cancelling reservation:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get experience availability (including reservations)
  app.get('/api/experiences/:id/availability', async (req: any, res) => {
    try {
      const { id: experienceId } = req.params;

      const experience = await storage.getExperience(experienceId);
      if (!experience) {
        return res.status(404).json({ error: 'Experience not found' });
      }

      const activeReservations = await storage.getExperienceActiveReservations(experienceId);
      const totalOccupied = (experience.currentParticipants || 0) + (experience.currentReservations || 0);
      const spotsAvailable = experience.maxParticipants - totalOccupied;

      res.json({
        maxParticipants: experience.maxParticipants,
        currentParticipants: experience.currentParticipants,
        activeReservations: experience.currentReservations || 0,
        spotsAvailable,
        softHoldEnabled: experience.softHoldEnabled || false,
        softHoldDurationHours: experience.softHoldDurationHours || 48,
        reservations: activeReservations.map(r => ({
          id: r.id,
          expiresAt: r.expiresAt,
          // Don't include user details for privacy
        }))
      });

    } catch (error: any) {
      console.error('Error fetching availability:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Background cleanup endpoint for expired reservations
  app.post('/api/reservations/cleanup-expired', async (req: any, res) => {
    try {
      const expiredReservations = await storage.getExpiredReservations();
      let expiredCount = 0;

      for (const reservation of expiredReservations) {
        await storage.expireReservation(reservation.id);
        expiredCount++;
      }

      res.json({ 
        message: `Cleaned up ${expiredCount} expired reservations`,
        expiredCount 
      });

    } catch (error: any) {
      console.error('Error cleaning up expired reservations:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Creator earnings endpoints
  app.get('/api/creator/earnings/:period', async (req: any, res) => {
    try {
      if (process.env.NODE_ENV !== 'development' && !req.isAuthenticated()) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const userId = process.env.NODE_ENV === 'development' ? '45788955' : req.user.claims.sub;
      const { period } = req.params; // 7, 30, 90 days

      // Mock data for development - in production this would come from storage
      const mockEarnings = [
        {
          id: 'earning-1',
          creatorId: userId,
          experienceId: 'exp-1',
          bookingId: 'booking-1',
          grossAmount: 12000, // $120
          platformFeeAmount: 1800, // 15%
          platformFeePercentage: 15.00,
          stripeFeeAmount: 378, // 2.9% + 30¢
          netAmount: 9822, // $98.22
          payoutStatus: 'completed',
          payoutDate: new Date('2024-01-15'),
          createdAt: new Date('2024-01-10')
        },
        {
          id: 'earning-2',
          creatorId: userId,
          experienceId: 'exp-2',
          bookingId: 'booking-2',
          grossAmount: 25000, // $250
          platformFeeAmount: 3750, // 15%
          platformFeePercentage: 15.00,
          stripeFeeAmount: 755, // 2.9% + 30¢
          netAmount: 20495, // $204.95
          payoutStatus: 'pending',
          payoutDate: null,
          createdAt: new Date('2024-01-20')
        }
      ];
      
      // Calculate summary statistics
      const summary = {
        totalEarnings: mockEarnings.reduce((sum, e) => sum + e.netAmount, 0),
        totalGross: mockEarnings.reduce((sum, e) => sum + e.grossAmount, 0),
        totalPlatformFees: mockEarnings.reduce((sum, e) => sum + e.platformFeeAmount, 0),
        totalStripeFees: mockEarnings.reduce((sum, e) => sum + e.stripeFeeAmount, 0),
        pendingPayouts: mockEarnings.filter(e => e.payoutStatus === 'pending').length,
        completedPayouts: mockEarnings.filter(e => e.payoutStatus === 'completed').length,
        bookingsCount: mockEarnings.length,
        averageBookingValue: mockEarnings.length > 0 ? 
          mockEarnings.reduce((sum, e) => sum + e.grossAmount, 0) / mockEarnings.length : 0
      };

      res.json({
        earnings: mockEarnings,
        summary,
        period: parseInt(period)
      });

    } catch (error: any) {
      console.error('Earnings fetch error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Detailed earnings breakdown for dashboard
  app.get('/api/creator/revenue-analytics', async (req: any, res) => {
    try {
      if (process.env.NODE_ENV !== 'development' && !req.isAuthenticated()) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const userId = process.env.NODE_ENV === 'development' ? '45788955' : req.user.claims.sub;

      // Mock analytics data for development
      const mockAnalytics = {
        earningsByExperience: [
          {
            experienceId: 'exp-1',
            experienceTitle: 'Mindful Retreat Weekend',
            totalBookings: 5,
            totalGross: 60000, // $600
            totalNet: 49110, // After fees
            averageBookingValue: 12000
          },
          {
            experienceId: 'exp-2', 
            experienceTitle: 'Adventure Hiking Tour',
            totalBookings: 3,
            totalGross: 75000, // $750
            totalNet: 61485, // After fees
            averageBookingValue: 25000
          }
        ],
        monthlyEarnings: [
          { month: '2024-01', grossRevenue: 135000, netRevenue: 110595, bookings: 8 },
          { month: '2023-12', grossRevenue: 98000, netRevenue: 80290, bookings: 6 },
          { month: '2023-11', grossRevenue: 156000, netRevenue: 127740, bookings: 10 }
        ],
        feeAnalysis: {
          averagePlatformFeePercentage: 15.0,
          totalPlatformFeesLastMonth: 20250,
          totalStripeFees: 4095,
          projectedMonthlyFees: 24345
        },
        currentPlatformFee: 15
      };

      res.json(mockAnalytics);

    } catch (error: any) {
      console.error('Revenue analytics error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  const httpServer = createServer(app);
  
  initializeWebSocket(httpServer);
  
  // ─── Task 4: Venue Offer Inbox (The Handshake) ────────────────────────────
  // Returns all experiences that a creator has proposed to any of this venue's
  // spaces and are awaiting acceptance (status = 'pending_venue_approval').
  app.get('/api/venue/bookings', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const userVenues = await storage.getVenuesByCreator(userId);
      if (!userVenues.length) return res.json([]);

      const venueIds = userVenues.map((venue: any) => venue.id);
      const bookings = await storage.getBookingsByVenueIds(venueIds);
      res.json(bookings);
    } catch (err: any) {
      console.error('Error fetching venue bookings:', err);
      res.status(500).json({ message: 'Failed to fetch venue bookings' });
    }
  });

  app.get('/api/venue/analytics', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const userVenues = await storage.getVenuesByCreator(userId);
      if (!userVenues.length) {
        return res.json({
          totalRevenue: 0,
          monthlyRevenue: 0,
          lastMonthRevenue: 0,
          totalBookings: 0,
          occupancyRate: 0,
          averageBookingValue: 0,
          repeatBookings: 0,
        });
      }

      const venueIds = userVenues.map((venue: any) => venue.id);
      const bookings = await storage.getBookingsByVenueIds(venueIds);
      const now = new Date();
      const thisMonth = now.getMonth();
      const thisYear = now.getFullYear();
      const lastMonthDate = new Date(thisYear, thisMonth - 1, 1);
      const lastMonth = lastMonthDate.getMonth();
      const lastMonthYear = lastMonthDate.getFullYear();
      const getAmount = (booking: any) => parseFloat(booking.totalAmount || booking.totalPrice || '0') || 0;

      const totalRevenue = bookings.reduce((sum: number, booking: any) => sum + getAmount(booking), 0);
      const monthlyRevenue = bookings.reduce((sum: number, booking: any) => {
        const date = new Date(booking.createdAt || booking.bookingDate || booking.startDate || 0);
        return date.getMonth() === thisMonth && date.getFullYear() === thisYear ? sum + getAmount(booking) : sum;
      }, 0);
      const lastMonthRevenue = bookings.reduce((sum: number, booking: any) => {
        const date = new Date(booking.createdAt || booking.bookingDate || booking.startDate || 0);
        return date.getMonth() === lastMonth && date.getFullYear() === lastMonthYear ? sum + getAmount(booking) : sum;
      }, 0);

      res.json({
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        monthlyRevenue: Math.round(monthlyRevenue * 100) / 100,
        lastMonthRevenue: Math.round(lastMonthRevenue * 100) / 100,
        totalBookings: bookings.length,
        occupancyRate: 0,
        averageBookingValue: bookings.length ? Math.round((totalRevenue / bookings.length) * 100) / 100 : 0,
        repeatBookings: 0,
      });
    } catch (err: any) {
      console.error('Error fetching venue analytics:', err);
      res.status(500).json({ message: 'Failed to fetch venue analytics' });
    }
  });

  app.get('/api/venue/pending-offers', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      // Get all venues owned by this user
      const userVenues = await storage.getVenuesByCreator(userId);
      if (!userVenues.length) return res.json([]);

      const venueIds = userVenues.map((v: any) => v.id);
      // Fetch experiences linked to any of those venues with pending handshake status
      const offers = await storage.getExperiencesByVenueIds(venueIds, 'pending_venue_approval');
      res.json(offers);
    } catch (err: any) {
      console.error('Error fetching venue offers:', err);
      res.status(500).json({ message: 'Failed to fetch pending offers' });
    }
  });

  // Accept an offer → experience goes Live (status = 'approved')
  app.post('/api/venue/offers/:experienceId/accept', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { experienceId } = req.params;

      const experience = await storage.getExperience(experienceId);
      if (!experience) return res.status(404).json({ message: 'Experience not found' });

      // Verify the experience is linked to one of this user's venues
      const userVenues = await storage.getVenuesByCreator(userId);
      const linkedToMyVenue = userVenues.some((v: any) => v.id === experience.linkedVenueId);
      if (!linkedToMyVenue) return res.status(403).json({ message: 'Access denied' });

      await storage.updateExperienceStatus(experienceId, 'approved');
      res.json({ success: true, message: 'Offer accepted — experience is now Live' });
    } catch (err: any) {
      console.error('Error accepting venue offer:', err);
      res.status(500).json({ message: 'Failed to accept offer' });
    }
  });

  // Reject an offer → experience sent back to draft
  app.post('/api/venue/offers/:experienceId/reject', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { experienceId } = req.params;
      const { reason } = req.body;

      const experience = await storage.getExperience(experienceId);
      if (!experience) return res.status(404).json({ message: 'Experience not found' });

      const userVenues = await storage.getVenuesByCreator(userId);
      const linkedToMyVenue = userVenues.some((v: any) => v.id === experience.linkedVenueId);
      if (!linkedToMyVenue) return res.status(403).json({ message: 'Access denied' });

      await storage.updateExperienceStatus(experienceId, 'draft');
      res.json({ success: true, message: 'Offer rejected — experience returned to creator' });
    } catch (err: any) {
      console.error('Error rejecting venue offer:', err);
      res.status(500).json({ message: 'Failed to reject offer' });
    }
  });

  // Venue Ledger — real sales totals broken down by the accepted split
  app.get('/api/venue/ledger', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const userVenues = await storage.getVenuesByCreator(userId);
      if (!userVenues.length) return res.json({ totalSales: 0, myShare: 0, bookingsCount: 0 });

      const venueIds = userVenues.map((v: any) => v.id);
      const bookings = await storage.getBookingsByVenueIds(venueIds);

      let totalGross = 0;
      let myShare = 0;

      for (const booking of bookings) {
        const gross = parseFloat(booking.totalAmount || booking.totalPrice || '0');
        totalGross += gross;
        // venueRevenuePercentage stored on the experience
        const venuePct = parseFloat(booking.experience?.venueRevenuePercentage || '0');
        myShare += gross * (venuePct / 100);
      }

      res.json({
        totalSales: Math.round(totalGross * 100) / 100,
        myShare: Math.round(myShare * 100) / 100,
        bookingsCount: bookings.length,
        venues: userVenues.length,
      });
    } catch (err: any) {
      console.error('Error fetching venue ledger:', err);
      res.status(500).json({ message: 'Failed to fetch ledger' });
    }
  });

  // Creator Ledger — total sales + My Share based on accepted creatorPct
  app.get('/api/creator/ledger', isAuthenticated, async (req: any, res) => {
    try {
      const userId = process.env.NODE_ENV === 'development' ? '45788955' : req.user.claims.sub;
      const bookings = await storage.getBookingsByCreator(userId);

      let totalGross = 0;
      let myShare = 0;
      let platformFees = 0;
      let spaceShare = 0;

      for (const booking of bookings) {
        const gross = parseFloat(booking.totalAmount || booking.totalPrice || '0');
        const creatorPct = parseFloat(booking.experience?.creatorPct || '85');
        const platformPct = parseFloat(booking.experience?.platformPct || '15');
        const venuePct = parseFloat(booking.experience?.venueRevenuePercentage || '0');
        totalGross += gross;
        platformFees += gross * (platformPct / 100);
        spaceShare += gross * (venuePct / 100);
        myShare += gross * (creatorPct / 100);
      }

      res.json({
        totalSales: Math.round(totalGross * 100) / 100,
        myShare: Math.round(myShare * 100) / 100,
        platformFees: Math.round(platformFees * 100) / 100,
        spaceShare: Math.round(spaceShare * 100) / 100,
        bookingsCount: bookings.length,
      });
    } catch (err: any) {
      console.error('Error fetching creator ledger:', err);
      res.status(500).json({ message: 'Failed to fetch ledger' });
    }
  });

  return httpServer;
}

// Helper function to generate itinerary suggestions based on category and type
function generateItinerarySuggestions(experienceType: string, category: string, subcategory?: string) {
  const baseActivities = {
    "Sports & Wellness": {
      "Yoga & Meditation": [
        { time: "07:00", name: "Morning Meditation", description: "Start the day with mindful breathing and centering practices" },
        { time: "08:30", name: "Sunrise Yoga Flow", description: "Energizing vinyasa flow to awaken the body" },
        { time: "10:00", name: "Breakfast & Mindful Eating", description: "Nourishing meal with conscious consumption practices" },
        { time: "14:00", name: "Yin Yoga Practice", description: "Restorative poses for deep relaxation" },
        { time: "16:00", name: "Walking Meditation", description: "Mindful movement in nature" },
        { time: "19:00", name: "Evening Reflection", description: "Journaling and gratitude practice" }
      ],
      "Fitness & Training": [
        { time: "06:30", name: "Morning Warm-up", description: "Dynamic stretching and mobility work" },
        { time: "07:00", name: "HIIT Training", description: "High-intensity interval training session" },
        { time: "09:00", name: "Nutrition Workshop", description: "Learn about optimal fuel for performance" },
        { time: "11:00", name: "Strength Training", description: "Functional movement and resistance work" },
        { time: "15:00", name: "Recovery Session", description: "Foam rolling and recovery techniques" },
        { time: "17:00", name: "Goal Setting Workshop", description: "Plan your fitness journey" }
      ]
    },
    "Retreats": {
      "Spiritual Retreats": [
        { time: "06:00", name: "Sacred Morning Ritual", description: "Connect with your spiritual practice" },
        { time: "08:00", name: "Community Breakfast", description: "Shared meal in sacred space" },
        { time: "10:00", name: "Wisdom Teaching", description: "Learning from spiritual traditions" },
        { time: "14:00", name: "Silent Contemplation", description: "Time for inner reflection" },
        { time: "16:00", name: "Nature Connection", description: "Walking meditation in natural setting" },
        { time: "19:00", name: "Evening Circle", description: "Sharing and community building" }
      ],
      "Digital Detox": [
        { time: "08:00", name: "Device Check-in", description: "Safely store all digital devices" },
        { time: "09:00", name: "Nature Immersion", description: "Forest bathing and connection" },
        { time: "11:00", name: "Analog Creative Time", description: "Art, writing, or crafts without screens" },
        { time: "14:00", name: "Mindful Movement", description: "Yoga or tai chi practice" },
        { time: "16:00", name: "Real-world Skills", description: "Gardening, cooking, or building" },
        { time: "19:00", name: "Campfire Stories", description: "Oral storytelling and connection" }
      ]
    },
    "Adventure Trips": {
      "Hiking & Trekking": [
        { time: "06:00", name: "Trail Preparation", description: "Equipment check and route briefing" },
        { time: "07:00", name: "Mountain Ascent", description: "Begin the challenging trek to summit" },
        { time: "12:00", name: "Peak Lunch", description: "Celebrate reaching the summit with mountain views" },
        { time: "14:00", name: "Descent & Photography", description: "Capture memories on the way down" },
        { time: "17:00", name: "Base Camp Return", description: "Rest and recovery at camp" },
        { time: "19:00", name: "Campfire Reflection", description: "Share stories of the day's adventure" }
      ],
      "Water Sports": [
        { time: "08:00", name: "Safety Briefing", description: "Water safety and equipment orientation" },
        { time: "09:00", name: "Skills Training", description: "Learn fundamental techniques" },
        { time: "11:00", name: "Open Water Practice", description: "Apply skills in real conditions" },
        { time: "14:00", name: "Adventure Session", description: "Explore new areas with confidence" },
        { time: "16:00", name: "Free Practice", description: "Independent exploration time" },
        { time: "18:00", name: "Equipment Care", description: "Maintenance and storage" }
      ]
    },
    "Workations": {
      "Digital Nomad": [
        { time: "08:00", name: "Co-working Setup", description: "Establish productive workspace" },
        { time: "09:00", name: "Focused Work Block", description: "Deep work session" },
        { time: "12:00", name: "Networking Lunch", description: "Connect with fellow nomads" },
        { time: "14:00", name: "Local Exploration", description: "Discover the neighborhood" },
        { time: "16:00", name: "Collaborative Work", description: "Group projects and brainstorming" },
        { time: "19:00", name: "Social Hour", description: "Unwind and build community" }
      ],
      "Creative Workspaces": [
        { time: "09:00", name: "Morning Inspiration", description: "Creative exercises and warm-ups" },
        { time: "10:00", name: "Project Development", description: "Work on individual creative projects" },
        { time: "12:00", name: "Peer Feedback", description: "Share work and get constructive input" },
        { time: "14:00", name: "Skill Building", description: "Learn new techniques or tools" },
        { time: "16:00", name: "Collaborative Creation", description: "Team projects and joint ventures" },
        { time: "18:00", name: "Showcase Prep", description: "Prepare work for evening presentation" }
      ]
    },
    "Community & Social": {
      "Networking Events": [
        { time: "18:00", name: "Welcome Reception", description: "Icebreakers and initial connections" },
        { time: "19:00", name: "Speed Networking", description: "Fast-paced professional introductions" },
        { time: "20:00", name: "Industry Insights", description: "Panel discussion with experts" },
        { time: "21:00", name: "Casual Mingling", description: "Organic conversation and connections" },
        { time: "22:00", name: "Contact Exchange", description: "Formal exchange of business information" }
      ],
      "Cultural Exchange": [
        { time: "10:00", name: "Cultural Presentations", description: "Share traditions from different backgrounds" },
        { time: "12:00", name: "International Potluck", description: "Taste dishes from around the world" },
        { time: "14:00", name: "Language Exchange", description: "Practice speaking different languages" },
        { time: "16:00", name: "Traditional Arts", description: "Learn crafts or art forms from various cultures" },
        { time: "18:00", name: "Music & Dance", description: "Experience global rhythms and movements" },
        { time: "20:00", name: "Storytelling Circle", description: "Share folk tales and personal stories" }
      ]
    },
    "Festivals & Events": {
      "Music Festivals": [
        { time: "14:00", name: "Festival Gates Open", description: "Entry and venue exploration" },
        { time: "15:00", name: "Opening Act", description: "Local artists warm up the crowd" },
        { time: "17:00", name: "Main Stage Performance", description: "Featured artist headline set" },
        { time: "19:00", name: "Food & Vendor Exploration", description: "Discover local cuisine and crafts" },
        { time: "21:00", name: "Headliner Performance", description: "Main event with top billing artist" },
        { time: "23:00", name: "After Party", description: "Continue the celebration" }
      ],
      "Art & Culture": [
        { time: "10:00", name: "Gallery Opening", description: "Preview of featured exhibitions" },
        { time: "11:30", name: "Artist Talk", description: "Meet the creators behind the work" },
        { time: "13:00", name: "Interactive Workshop", description: "Hands-on creative experience" },
        { time: "15:00", name: "Performance Art", description: "Live artistic presentations" },
        { time: "17:00", name: "Community Art Project", description: "Collaborative creation opportunity" },
        { time: "19:00", name: "Closing Reception", description: "Celebrate the day's artistic journey" }
      ]
    }
  };

  // Default to one-day experience structure
  const categoryActivities = baseActivities[category as keyof typeof baseActivities];
  const defaultSubcategory = categoryActivities ? Object.keys(categoryActivities)[0] : '';
  let suggestedActivities = (categoryActivities as any)?.[subcategory || defaultSubcategory] || [
    { time: "09:00", name: "Welcome & Introduction", description: "Meet your fellow participants and overview the experience" },
    { time: "10:00", name: "Main Activity", description: "Core experience activity" },
    { time: "12:00", name: "Lunch Break", description: "Shared meal and networking" },
    { time: "14:00", name: "Hands-on Workshop", description: "Interactive learning session" },
    { time: "16:00", name: "Group Reflection", description: "Share insights and experiences" },
    { time: "17:00", name: "Closing Circle", description: "Wrap-up and next steps" }
  ];

  if (experienceType === "multi-day") {
    // Generate variable number of days based on the experience
    const dayTitles = [
      "Welcome & Foundation",
      "Deep Dive & Practice", 
      "Integration & Mastery",
      "Advanced Exploration",
      "Specialized Focus",
      "Community Building",
      "Reflection & Growth"
    ];
    
    const dayDescriptions = [
      "Introduction and establishing the foundation for your experience",
      "Intensive learning and hands-on practice",
      "Bringing it all together and mastering new skills",
      "Exploring advanced concepts and techniques", 
      "Focusing on specialized aspects of the experience",
      "Building community connections and shared experiences",
      "Reflecting on growth and planning future steps"
    ];

    // Create 3-7 days depending on the experience
    const numDays = Math.min(Math.max(3, suggestedActivities.length > 4 ? Math.ceil(suggestedActivities.length / 2) : 3), 7);
    const days = [];
    
    for (let i = 0; i < numDays; i++) {
      const isLastDay = i === numDays - 1;
      const activitiesPerDay = Math.ceil(suggestedActivities.length / numDays);
      const startIndex = i * activitiesPerDay;
      const endIndex = Math.min(startIndex + activitiesPerDay, suggestedActivities.length);
      
      let dayActivities = suggestedActivities.slice(startIndex, endIndex);
      
      // Add special activities for the last day
      if (isLastDay) {
        dayActivities = [
          ...dayActivities,
          { time: "16:00", name: "Integration Session", description: "Reflect on learnings and create action plan" },
          { time: "17:30", name: "Farewell Ceremony", description: "Celebrate completion and say goodbyes" }
        ];
      }
      
      days.push({
        dayTitle: `Day ${i + 1}: ${dayTitles[i] || 'Continued Journey'}`,
        dayDescription: dayDescriptions[i] || 'Continuing your transformative experience',
        activities: dayActivities
      });
    }
    
    return days;
  } else {
    return [
      {
        dayTitle: "Experience Day",
        dayDescription: "Your complete single-day transformative experience",
        activities: suggestedActivities
      }
    ];
  }
}

// Helper function for user type context
function getUserTypeContext(userType: string): string {
  switch (userType) {
    case 'venue':
      return 'Venue owner/operator - focus on location capabilities, capacity, amenities, and partnership opportunities';
    case 'service_provider':
      return 'Service provider (guide, instructor, facilitator) - focus on expertise, credentials, and service offerings';
    case 'individual':
      return 'Individual creator - focus on personal passion, experience, and community building';
    default:
      return 'Unknown user type - ask clarifying questions to determine if they are a venue, service provider, or individual creator';
  }
}

// Helper functions for travel planning
function generateBasicItinerary(destination: string, startDate: string, endDate: string, interests: string[]) {
  const days = Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24));
  const itinerary = [];
  
  for (let day = 1; day <= Math.min(days, 7); day++) {
    const dayActivities = [];
    
    if (interests.includes('Photography')) {
      dayActivities.push('Photography walking tour');
    }
    if (interests.includes('Food & Dining')) {
      dayActivities.push('Local cuisine experience');
    }
    if (interests.includes('Historical Sites')) {
      dayActivities.push('Historical landmarks visit');
    }
    
    // Add default activities if none specified
    if (dayActivities.length === 0) {
      dayActivities.push('City exploration', 'Local cultural sites');
    }
    
    itinerary.push({
      day,
      activities: dayActivities,
      accommodation: `Hotel in ${destination}`,
      transportation: day === 1 ? 'Airport transfer' : 'Local transport',
      meals: ['Local breakfast', 'Lunch', 'Dinner']
    });
  }
  
  return itinerary;
}

async function getMockFlightData(destination: string) {
  // This will be replaced with Amadeus API integration
  const destinationCode = destination.toLowerCase().includes('barcelona') ? 'BCN' : 'XXX';
  
  return [
    {
      airline: "Lufthansa",
      departure: "JFK",
      arrival: destinationCode,
      price: 485,
      duration: "7h 15m",
      source: "amadeus_api_pending"
    },
    {
      airline: "Delta", 
      departure: "JFK",
      arrival: destinationCode,
      price: 520,
      duration: "8h 15m",
      source: "amadeus_api_pending"
    }
  ];
}

async function getMockHotelData(destination: string) {
  // This will be replaced with Amadeus API integration
  return [
    {
      name: `Premium Hotel ${destination}`,
      rating: 4.3,
      price: 120,
      location: `Central ${destination}`,
      amenities: ["Pool", "Spa", "Gym"],
      source: "amadeus_api_pending"
    },
    {
      name: `Luxury Resort ${destination}`,
      rating: 4.5,
      price: 280,
      location: `Beachfront ${destination}`,
      amenities: ["Beachfront", "Spa", "Restaurant"],
      source: "amadeus_api_pending"
    }
  ];
}

async function getExternalExperiences(destination: string) {
  // This will be replaced with GetYourGuide API integration
  return [
    {
      id: `external-${destination}-1`,
      title: `Guided City Tour of ${destination}`,
      provider: "GetYourGuide",
      price: "€45",
      duration: "3 hours",
      rating: 4.6,
      description: "Explore the highlights with a local guide",
      source: "getyourguide_api_pending"
    },
    {
      id: `external-${destination}-2`, 
      title: `Food & Culture Experience in ${destination}`,
      provider: "GetYourGuide",
      price: "€89",
      duration: "5 hours",
      rating: 4.8,
      description: "Taste local cuisine and learn about the culture",
      source: "getyourguide_api_pending"
    }
  ];
}

function calculateTripValue(platformExperiences: any[], externalExperiences: any[]) {
  const platformCount = platformExperiences.length;
  const externalCount = externalExperiences.length;
  
  return {
    platformExperiences: platformCount,
    externalExperiences: externalCount,
    totalOptions: platformCount + externalCount,
    platformFirst: platformCount > 0,
    completeCoverage: (platformCount + externalCount) >= 3
  };
}
