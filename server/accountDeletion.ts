import type { Express } from "express";
import { eq } from "drizzle-orm";
import { users } from "@shared/schema";
import { db } from "./db";
import { storage } from "./storage";
import { getSupabaseAdminClient, isAuthenticated } from "./supabaseAuth";

/**
 * DELETE /api/auth/account — the in-app "Delete account" that Apple (5.1.1(v))
 * and Google Play require for any app where people can sign up.
 *
 * 1. The users row is deleted outright when nothing else points at it. Rows
 *    with ON DELETE CASCADE (profiles, roles, and so on) go with it.
 * 2. When bookings, payouts or other records still reference the account, a
 *    hard delete would break them, so the row is anonymised instead: email,
 *    names, photo, city, promoter code and Stripe ids are cleared. Bookings
 *    stay for the creator's and the platform's records, with no personal data.
 * 3. The Supabase auth user is deleted either way, so the login (email,
 *    Google or Apple) is gone and the address can sign up again from scratch.
 */
export function registerAccountDeletionRoutes(app: Express) {
  app.delete("/api/auth/account", isAuthenticated, async (req: any, res) => {
    const authUserId: string = req.user.claims.sub;
    const email = typeof req.user.email === "string" ? req.user.email.trim().toLowerCase() : "";

    try {
      // Older accounts can have a DB id that differs from the Supabase id;
      // /api/auth/user matches those by email, so do the same here.
      const dbUser = (await storage.getUser(authUserId)) ?? (email ? await storage.getUserByEmail(email) : undefined);

      let outcome: "deleted" | "anonymised" | "no-profile" = "no-profile";
      if (dbUser) {
        try {
          await db.transaction(async (tx) => {
            await tx.delete(users).where(eq(users.id, dbUser.id));
          });
          outcome = "deleted";
        } catch (error: any) {
          // 23503: foreign_key_violation — other records still point here.
          if (error?.code !== "23503" && error?.cause?.code !== "23503") throw error;
          await db
            .update(users)
            .set({
              email: `deleted+${dbUser.id}@users.invalid`,
              firstName: null,
              lastName: null,
              profileImageUrl: null,
              preferredCity: null,
              promoterCode: null,
              stripeCustomerId: null,
              stripeSubscriptionId: null,
              updatedAt: new Date(),
            })
            .where(eq(users.id, dbUser.id));
          outcome = "anonymised";
        }
      }

      const admin = getSupabaseAdminClient();
      if (!admin) throw new Error("Supabase admin client is not configured");
      const { error: authError } = await admin.auth.admin.deleteUser(authUserId);
      if (authError && !/not found/i.test(authError.message)) throw authError;

      console.log(`[account-deletion] ${authUserId}: profile ${outcome}, auth user deleted`);
      res.json({ deleted: true });
    } catch (error) {
      console.error("[account-deletion] failed:", error);
      res.status(500).json({ message: "We couldn't delete your account. Please try again or contact support." });
    }
  });
}
