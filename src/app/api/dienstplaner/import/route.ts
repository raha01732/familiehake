// src/app/api/dienstplaner/import/route.ts
// Nimmt einen PDF-Altdienstplan oder eine Excel-Verfügbarkeitsliste entgegen,
// parst sie und legt einen dienstplan_imports-Datensatz (Status "parsed") an.
// Als Route-Handler umgesetzt, weil Server Actions auf 2 MB Body begrenzt sind.
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { applyRateLimit } from "@/lib/ratelimit";
import { logAudit, actorFromUser } from "@/lib/audit";
import { assertDienstplanImportAdmin } from "@/lib/dienstplaner/import-guard";
import { extractScheduleFromPdf, schedulePdfImportEnabled } from "@/lib/dienstplaner/schedule-pdf";
import { parseAvailabilityWorkbook } from "@/lib/dienstplaner/availability-xlsx";
import type { ImportKind } from "@/lib/dienstplaner/import-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 12 * 1024 * 1024; // 12 MB — deckt typische Monats-PDFs ab

function safeFileName(name: string) {
  return (name || "upload").replace(/[/\\]/g, "_").replace(/\s+/g, " ").trim().slice(0, 180) || "upload";
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "unbekannter Fehler";
}

export async function POST(req: Request) {
  const rl = await applyRateLimit(req as unknown as Parameters<typeof applyRateLimit>[0], "api:dienstplaner-import");
  if (rl instanceof NextResponse) return rl;

  let user: Awaited<ReturnType<typeof assertDienstplanImportAdmin>>;
  try {
    user = await assertDienstplanImportAdmin();
  } catch (err) {
    const message = errorMessage(err);
    const status = message.startsWith("UNAUTHORIZED") ? 401 : 403;
    return NextResponse.json({ ok: false, error: message }, { status });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_form" }, { status: 400 });
  }

  const fileEntry = form.get("file");
  const kindRaw = String(form.get("kind") || "");
  const month = String(form.get("month") || "").trim();
  const kind: ImportKind | null =
    kindRaw === "schedule_pdf" || kindRaw === "availability_xlsx" ? kindRaw : null;

  if (!kind) {
    return NextResponse.json({ ok: false, error: "invalid_kind" }, { status: 400 });
  }
  if (
    !fileEntry ||
    typeof fileEntry === "string" ||
    typeof (fileEntry as Blob).arrayBuffer !== "function"
  ) {
    return NextResponse.json({ ok: false, error: "missing_file" }, { status: 400 });
  }
  const file = fileEntry as File;
  if (file.size === 0) {
    return NextResponse.json({ ok: false, error: "empty_file" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { ok: false, error: `Datei zu groß (${(file.size / 1024 / 1024).toFixed(1)} MB, max. 12 MB).` },
      { status: 413 }
    );
  }
  if (kind === "schedule_pdf" && !schedulePdfImportEnabled()) {
    return NextResponse.json(
      { ok: false, error: "PDF-Auslesen ist nicht verfügbar (GEMINI_API_KEY fehlt)." },
      { status: 503 }
    );
  }

  const fileName = safeFileName(file.name);
  const buffer = Buffer.from(await file.arrayBuffer());
  const sb = createAdminClient();

  const { data: employees } = await sb
    .from("dienstplan_employees")
    .select("id, name")
    .eq("is_active", true)
    .order("name");
  const employeeList = (employees ?? []) as { id: number; name: string }[];

  // Datei best-effort in den Storage legen (für spätere Nachvollziehbarkeit).
  let storagePath: string | null = null;
  try {
    const path = `${user.id}/dienstplan-imports/${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${fileName}`;
    const { error: upErr } = await sb.storage.from("files").upload(path, buffer, {
      contentType: file.type || (kind === "schedule_pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
      upsert: false,
    });
    if (!upErr) storagePath = path;
  } catch {
    // Storage ist optional — Parsing läuft trotzdem.
  }

  try {
    if (kind === "schedule_pdf") {
      const fallbackYear = /^\d{4}-\d{2}$/.test(month) ? Number(month.slice(0, 4)) : new Date().getFullYear();
      const result = await extractScheduleFromPdf({
        pdf: buffer,
        employees: employeeList,
        fallbackYear,
      });

      const { data: inserted, error: insErr } = await sb
        .from("dienstplan_imports")
        .insert({
          kind,
          file_name: fileName,
          storage_path: storagePath,
          status: "parsed",
          period_start: result.periodStart,
          period_end: result.periodEnd,
          parsed_rows: result.rows,
          parse_notes: result.notes.join("\n") || null,
          row_count: result.rows.length,
          created_by: user.id,
        })
        .select("id")
        .single();
      if (insErr) throw new Error(`DB-Fehler: ${insErr.message}`);

      await logAudit({
        action: "dienstplan_import_parse",
        ...actorFromUser(user),
        target: `import:${inserted.id}`,
        detail: { kind, fileName, rows: result.rows.length },
      });

      return NextResponse.json({
        ok: true,
        importId: inserted.id,
        kind,
        fileName,
        periodStart: result.periodStart,
        periodEnd: result.periodEnd,
        notes: result.notes,
        employees: employeeList,
        scheduleRows: result.rows,
      });
    }

    // availability_xlsx
    const result = await parseAvailabilityWorkbook(buffer, employeeList, {
      fallbackMonth: /^\d{4}-\d{2}$/.test(month) ? month : null,
    });

    const { data: inserted, error: insErr } = await sb
      .from("dienstplan_imports")
      .insert({
        kind,
        file_name: fileName,
        storage_path: storagePath,
        status: "parsed",
        period_start: result.periodStart,
        period_end: result.periodEnd,
        parsed_rows: result.rows,
        parse_notes: result.notes.join("\n") || null,
        row_count: result.rows.length,
        created_by: user.id,
      })
      .select("id")
      .single();
    if (insErr) throw new Error(`DB-Fehler: ${insErr.message}`);

    await logAudit({
      action: "dienstplan_import_parse",
      ...actorFromUser(user),
      target: `import:${inserted.id}`,
      detail: { kind, fileName, rows: result.rows.length },
    });

    return NextResponse.json({
      ok: true,
      importId: inserted.id,
      kind,
      fileName,
      periodStart: result.periodStart,
      periodEnd: result.periodEnd,
      notes: result.notes,
      employees: employeeList,
      availabilityRows: result.rows,
    });
  } catch (err) {
    const message = errorMessage(err);
    await sb.from("dienstplan_imports").insert({
      kind,
      file_name: fileName,
      storage_path: storagePath,
      status: "error",
      error_message: message.slice(0, 800),
      row_count: 0,
      created_by: user.id,
    });
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
