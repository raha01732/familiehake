import { createClient } from "@supabase/supabase-js";

// Nur Server (Service Role Key) – NIE ins Browser-Bundle!
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!url || !serviceKey) {
    throw new Error("Supabase Admin-Client: URL oder SERVICE_ROLE_KEY fehlt.");
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
}
