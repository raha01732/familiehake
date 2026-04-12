// src/lib/supabase/admin.ts
import { createClient } from "@supabase/supabase-js";
import { wrapPreviewWriteGuard } from "@/lib/supabase/preview-guard";

// Nur Server (Service Role Key) – NIE ins Browser-Bundle!
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!url || !serviceKey) {
    throw new Error("Supabase Admin-Client: URL oder SERVICE_ROLE_KEY fehlt.");
  }
  const client = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
  return wrapPreviewWriteGuard(client);
}
