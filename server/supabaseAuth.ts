import { createClient } from "@supabase/supabase-js";
import type { RequestHandler } from "express";

// Admin client — server only, never exposed to browser
export function getSupabaseAdminClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// Shape req.user to match the existing req.user.claims.sub pattern so every
// existing route works without changes.
function makeUserShape(id: string, email: string | undefined, userMetadata: Record<string, any> = {}) {
  return {
    claims: { sub: id, email: email ?? "" },
    id,
    email: email ?? "",
    userMetadata,
    signupRole: userMetadata.selected_role,
  };
}

// Resolve req.user from the Bearer token (if any). Idempotent: if req.user is
// already populated (e.g. by optionalAuth running earlier) it does nothing, so
// the Supabase lookup happens at most once per request.
async function resolveUserFromToken(req: any): Promise<void> {
  if (req.user) return;

  // Dev bypass: if Supabase is not configured, use a hardcoded dev user.
  if (process.env.NODE_ENV === "development" && !process.env.SUPABASE_URL) {
    req.user = makeUserShape("45788955", "dev@voyagebuilder.com");
    return;
  }

  const authHeader = req.headers.authorization as string | undefined;
  if (!authHeader?.startsWith("Bearer ")) return;

  const token = authHeader.slice(7);
  const admin = getSupabaseAdminClient();
  if (!admin) return;

  const {
    data: { user },
    error,
  } = await admin.auth.getUser(token);

  if (error || !user) return;

  req.user = makeUserShape(user.id, user.email, user.user_metadata ?? {});
}

// Non-blocking: populates req.user when a valid token is present, otherwise
// continues anonymously. Applied globally so no route crashes on req.user.claims.
export const optionalAuth: RequestHandler = async (req: any, _res, next) => {
  try {
    await resolveUserFromToken(req);
  } catch {
    // ignore — treat as anonymous
  }
  next();
};

// Blocking: requires a valid authenticated user, otherwise 401.
export const isAuthenticated: RequestHandler = async (req: any, res, next) => {
  try {
    await resolveUserFromToken(req);
  } catch {
    // fall through to the 401 below
  }
  if (!req.user) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  next();
};
