import { createClient } from "@supabase/supabase-js";
import type { RequestHandler } from "express";

// Admin client — server only, never exposed to browser
function getAdminClient() {
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

export const isAuthenticated: RequestHandler = async (req: any, res, next) => {
  // Dev bypass: if Supabase is not configured, use hardcoded dev user.
  if (process.env.NODE_ENV === "development" && !process.env.SUPABASE_URL) {
    req.user = makeUserShape("45788955", "dev@voyagebuilder.com");
    return next();
  }

  const authHeader = req.headers.authorization as string | undefined;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const token = authHeader.slice(7);
  const admin = getAdminClient();

  if (!admin) {
    return res
      .status(500)
      .json({ message: "Auth not configured on server" });
  }

  const {
    data: { user },
    error,
  } = await admin.auth.getUser(token);

  if (error || !user) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  req.user = makeUserShape(user.id, user.email, user.user_metadata ?? {});
  next();
};
