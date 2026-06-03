import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

// Will throw at runtime if env vars are missing in production
export const supabase = createClient(supabaseUrl ?? "", supabaseAnonKey ?? "");
