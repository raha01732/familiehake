diff --git a/src/app/api/shares/create/route.ts b/src/app/api/shares/create/route.ts
index 814f5fefe34fed1843d6d65d5b189325082fb2cd..a2b9aeb92c89fab1f6646ef61e25b8d857ef793c 100644
--- a/src/app/api/shares/create/route.ts
+++ b/src/app/api/shares/create/route.ts
@@ -1,40 +1,38 @@
 import { NextResponse } from "next/server";
 import { auth } from "@clerk/nextjs/server";
 import { createAdminClient } from "@/lib/supabase/admin";
 import { generateShareToken, hashPasswordScrypt } from "@/lib/share";
 import { logAudit } from "@/lib/audit";
-import { getSessionInfo } from "@/lib/auth";
 
 export const dynamic = "force-dynamic";
 export const runtime = "nodejs";
 
 export async function POST(req: Request) {
   const { userId } = auth();
   if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
 
-  const { role } = await getSessionInfo(); // falls du später Admin-only-Regeln willst
   const body = await req.json().catch(() => ({}));
   const { fileId, expiresInMinutes, password, maxDownloads } = body as {
     fileId: string;
     expiresInMinutes?: number;
     password?: string;
     maxDownloads?: number;
   };
   if (!fileId) return NextResponse.json({ ok: false, error: "missing fileId" }, { status: 400 });
 
   const sb = createAdminClient();
 
   // Ownership prüfen
   const { data: file } = await sb
     .from("files_meta")
     .select("id, user_id, storage_path, file_name, file_size, mime_type, created_at")
     .eq("id", fileId)
     .single();
 
   if (!file || file.user_id !== userId) {
     return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
   }
 
   const token = generateShareToken();
   const expires_at =
     expiresInMinutes && expiresInMinutes > 0
