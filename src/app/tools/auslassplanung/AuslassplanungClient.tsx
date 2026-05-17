"use client";

import type { FormEvent, ReactNode } from "react";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Brush,
  CalendarRange,
  CheckCircle2,
  Clapperboard,
  Eraser,
  FileImage,
  ListChecks,
  Lock,
  Pencil,
  Plus,
  ScanLine,
  Sparkles,
  Trash2,
  Upload,
  UserPlus,
  Users,
  XCircle,
} from "lucide-react";
import {
  INTENSITY_OPTIONS,
  PREFERENCE_OPTIONS,
  STAFF_COLORS,
  getInitials,
  formatTimeRange,
  recommendStaffCount,
  type CleaningAssignment,
  type CleaningFeedback,
  type CleaningPreference,
  type CleaningShow,
  type CleaningStaff,
  type ShowIntensity,
  type ShowPlanStatus,
} from "./utils";

type ActionFn = (_fd: FormData) => Promise<void>;
type PlanFn = (_fd: FormData) => Promise<{
  showId: number;
  recommendedCount: number;
  assignments: { staff_id: number; reason: string | null }[];
  source: "ai" | "heuristic";
  aiNote: string | null;
  unmet?: string;
} | null>;

type BulkPlanSummary = {
  total: number;
  planned: number;
  empty: number;
  failed: number;
  bySource: { ai: number; heuristic: number };
  results: Array<{
    showId: number;
    hallNumber: number | null;
    showDate: string | null;
    endTime: string | null;
    ok: boolean;
    source: "ai" | "heuristic" | null;
    assignedCount: number;
    recommendedCount: number;
    unmet?: string;
    error?: string;
  }>;
};

type PlanManyFn = (_fd: FormData) => Promise<BulkPlanSummary>;

type ParsedFupShow = {
  hall_number: number;
  credit_offset: string;
  cleanup_minutes: number;
  movie_title: string | null;
  intensity_hint: "light" | "standard" | "intense";
  fsk: number | null;
};
type FupParseResult = {
  date: string | null;
  shows: ParsedFupShow[];
  warning?: string;
};
type FupParseActionResult =
  | { ok: true; result: FupParseResult }
  | { ok: false; error: string };

type ParseFupFn = (_fd: FormData) => Promise<FupParseActionResult>;
type CreateFromFupFn = (_fd: FormData) => Promise<{ created: number }>;

type Props = {
  initialStaff: CleaningStaff[];
  initialShows: CleaningShow[];
  initialAssignments: CleaningAssignment[];
  initialFeedback: CleaningFeedback[];
  canEdit: boolean;
  aiEnabled: boolean;
  fupImportEnabled: boolean;
  createStaffAction: ActionFn;
  updateStaffAction: ActionFn;
  deleteStaffAction: ActionFn;
  createShowAction: ActionFn;
  updateShowAction: ActionFn;
  deleteShowAction: ActionFn;
  planShowAction: PlanFn;
  planManyShowsAction: PlanManyFn;
  setManualAssignmentsAction: ActionFn;
  clearAssignmentsAction: ActionFn;
  parseFupAction: ParseFupFn;
  createShowsFromFupAction: CreateFromFupFn;
  saveFeedbackAction: ActionFn;
};

type Tab = "shows" | "staff";

const STATUS_LABELS: Record<ShowPlanStatus, { label: string; cls: string }> = {
  open:       { label: "Offen",     cls: "bg-amber-500/15 text-amber-600 border-amber-500/30" },
  planned:    { label: "Geplant",   cls: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30" },
  completed:  { label: "Erledigt",  cls: "bg-sky-500/15 text-sky-600 border-sky-500/30" },
  cancelled:  { label: "Abgesagt",  cls: "bg-zinc-500/15 text-zinc-600 border-zinc-500/30" },
};

const INTENSITY_LABEL: Record<ShowIntensity, string> = {
  light: "Leicht",
  standard: "Standard",
  intense: "Intensiv",
};

const inputCls =
  "w-full bg-[hsl(var(--background))] border border-[hsl(var(--border))] rounded-lg px-3 py-2 text-[hsl(var(--foreground))] text-sm focus:outline-none focus:border-[hsl(var(--ring))] focus:ring-2 focus:ring-[hsl(var(--ring)/0.2)] placeholder:text-[hsl(var(--muted-foreground)/0.6)]";

export default function AuslassplanungClient({
  initialStaff,
  initialShows,
  initialAssignments,
  initialFeedback,
  canEdit,
  aiEnabled,
  fupImportEnabled,
  createStaffAction,
  updateStaffAction,
  deleteStaffAction,
  createShowAction,
  updateShowAction,
  deleteShowAction,
  planShowAction,
  planManyShowsAction,
  setManualAssignmentsAction,
  clearAssignmentsAction,
  parseFupAction,
  createShowsFromFupAction,
  saveFeedbackAction,
}: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("shows");
  const [staffModal, setStaffModal] = useState<CleaningStaff | null | undefined>(undefined);
  const [showModal, setShowModal] = useState<CleaningShow | null | undefined>(undefined);
  const [feedbackShow, setFeedbackShow] = useState<CleaningShow | null>(null);
  const [planNotice, setPlanNotice] = useState<{
    show: CleaningShow;
    source: "ai" | "heuristic";
    recommended: number;
    aiNote: string | null;
    unmet?: string;
  } | null>(null);
  const [planningShowId, setPlanningShowId] = useState<number | null>(null);
  const [isPlanning, startPlanning] = useTransition();
  const [bulkPickerOpen, setBulkPickerOpen] = useState(false);
  const [bulkSummary, setBulkSummary] = useState<BulkPlanSummary | null>(null);
  const [isBulkPlanning, startBulkPlanning] = useTransition();
  const [assignmentsModal, setAssignmentsModal] = useState<CleaningShow | null>(null);
  const [confirmClearShow, setConfirmClearShow] = useState<CleaningShow | null>(null);
  const [isClearing, startClearing] = useTransition();
  const [fupModalOpen, setFupModalOpen] = useState(false);

  const staffById = useMemo(() => {
    const m = new Map<number, CleaningStaff>();
    for (const s of initialStaff) m.set(s.id, s);
    return m;
  }, [initialStaff]);

  const assignmentsByShow = useMemo(() => {
    const m = new Map<number, CleaningAssignment[]>();
    for (const a of initialAssignments) {
      const list = m.get(a.show_id) ?? [];
      list.push(a);
      m.set(a.show_id, list);
    }
    return m;
  }, [initialAssignments]);

  const feedbackByShow = useMemo(() => {
    const m = new Map<number, CleaningFeedback>();
    for (const f of initialFeedback) m.set(f.show_id, f);
    return m;
  }, [initialFeedback]);

  const activeStaffCount = initialStaff.filter((s) => s.is_active).length;
  const preferredCount = initialStaff.filter((s) => s.is_active && s.preference === "preferred").length;

  async function handlePlan(show: CleaningShow) {
    setPlanningShowId(show.id);
    startPlanning(async () => {
      try {
        const fd = new FormData();
        fd.set("show_id", String(show.id));
        const result = await planShowAction(fd);
        if (result) {
          setPlanNotice({
            show,
            source: result.source,
            recommended: result.recommendedCount,
            aiNote: result.aiNote,
            unmet: result.unmet,
          });
        }
        router.refresh();
      } finally {
        setPlanningShowId(null);
      }
    });
  }

  function handleBulkPlan(showIds: number[]) {
    if (showIds.length === 0) return;
    startBulkPlanning(async () => {
      const fd = new FormData();
      for (const id of showIds) fd.append("show_id", String(id));
      const summary = await planManyShowsAction(fd);
      setBulkPickerOpen(false);
      setBulkSummary(summary);
      router.refresh();
    });
  }

  function handleClear(show: CleaningShow) {
    startClearing(async () => {
      const fd = new FormData();
      fd.set("show_id", String(show.id));
      await clearAssignmentsAction(fd);
      setConfirmClearShow(null);
      router.refresh();
    });
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 flex flex-col gap-6 animate-fade-up">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex flex-col gap-2">
          <div
            className="shimmer-badge inline-flex w-fit items-center gap-2 rounded-full px-3 py-1"
            style={{ border: "1px solid hsl(var(--primary) / 0.3)" }}
          >
            <Clapperboard size={11} style={{ color: "hsl(var(--primary))" }} aria-hidden />
            <span className="text-[10px] font-semibold uppercase tracking-[0.2em]" style={{ color: "hsl(var(--primary))" }}>
              Kino-Workspace
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">
            <span className="gradient-text">Auslassplanung</span>
          </h1>
          <p className="text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
            Reinigung pro Vorstellung — KI-gestützt, lernt aus Feedback.
            {aiEnabled ? null : " (KI-Service nicht konfiguriert — Heuristik aktiv.)"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <TabButton active={tab === "shows"} onClick={() => setTab("shows")}>
            <CalendarRange size={14} aria-hidden /> Vorstellungen
            <span className="ml-1 text-[10px] opacity-70">{initialShows.length}</span>
          </TabButton>
          <TabButton active={tab === "staff"} onClick={() => setTab("staff")}>
            <Users size={14} aria-hidden /> Reinigungskräfte
            <span className="ml-1 text-[10px] opacity-70">{activeStaffCount}</span>
          </TabButton>
        </div>
      </div>

      {tab === "shows" ? (
        <ShowsTab
          shows={initialShows}
          staffById={staffById}
          assignmentsByShow={assignmentsByShow}
          feedbackByShow={feedbackByShow}
          canEdit={canEdit}
          activeStaffCount={activeStaffCount}
          preferredCount={preferredCount}
          aiEnabled={aiEnabled}
          isPlanning={isPlanning}
          planningShowId={planningShowId}
          isBulkPlanning={isBulkPlanning}
          isClearing={isClearing}
          fupImportEnabled={fupImportEnabled}
          onAdd={() => setShowModal(null)}
          onEdit={(s) => setShowModal(s)}
          onPlan={handlePlan}
          onAssign={(s) => setAssignmentsModal(s)}
          onClear={(s) => setConfirmClearShow(s)}
          onBulkPlanOpen={() => setBulkPickerOpen(true)}
          onFupOpen={() => setFupModalOpen(true)}
          onFeedback={(s) => setFeedbackShow(s)}
        />
      ) : (
        <StaffTab
          staff={initialStaff}
          canEdit={canEdit}
          onAdd={() => setStaffModal(null)}
          onEdit={(s) => setStaffModal(s)}
        />
      )}

      {staffModal !== undefined && (
        <StaffModal
          staff={staffModal}
          canEdit={canEdit}
          onClose={() => setStaffModal(undefined)}
          createAction={createStaffAction}
          updateAction={updateStaffAction}
          deleteAction={deleteStaffAction}
        />
      )}

      {showModal !== undefined && (
        <ShowModal
          show={showModal}
          canEdit={canEdit}
          onClose={() => setShowModal(undefined)}
          createAction={createShowAction}
          updateAction={updateShowAction}
          deleteAction={deleteShowAction}
        />
      )}

      {feedbackShow && (
        <FeedbackModal
          show={feedbackShow}
          assignments={assignmentsByShow.get(feedbackShow.id) ?? []}
          existing={feedbackByShow.get(feedbackShow.id) ?? null}
          onClose={() => setFeedbackShow(null)}
          saveAction={saveFeedbackAction}
        />
      )}

      {planNotice && (
        <PlanResultModal notice={planNotice} staffById={staffById} onClose={() => setPlanNotice(null)} />
      )}

      {bulkPickerOpen && (
        <BulkPlanPickerModal
          shows={initialShows}
          isPlanning={isBulkPlanning}
          aiEnabled={aiEnabled}
          onClose={() => setBulkPickerOpen(false)}
          onPlan={handleBulkPlan}
        />
      )}

      {bulkSummary && (
        <BulkPlanResultModal summary={bulkSummary} onClose={() => setBulkSummary(null)} />
      )}

      {assignmentsModal && (
        <AssignmentsEditorModal
          show={assignmentsModal}
          staff={initialStaff}
          assignments={assignmentsByShow.get(assignmentsModal.id) ?? []}
          onClose={() => setAssignmentsModal(null)}
          saveAction={setManualAssignmentsAction}
        />
      )}

      {confirmClearShow && (
        <ConfirmClearModal
          show={confirmClearShow}
          assignmentCount={(assignmentsByShow.get(confirmClearShow.id) ?? []).length}
          isClearing={isClearing}
          onCancel={() => setConfirmClearShow(null)}
          onConfirm={() => handleClear(confirmClearShow)}
        />
      )}

      {fupModalOpen && (
        <FupUploadModal
          onClose={() => setFupModalOpen(false)}
          parseAction={parseFupAction}
          createAction={createShowsFromFupAction}
          onCreated={() => router.refresh()}
        />
      )}

      {/* overrideAction ist als Prop verfügbar — reserviert für ein
          späteres manuelles Override-UI. Aktuell nicht in der UI angeboten. */}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold border transition-colors ${
        active
          ? "bg-[hsl(var(--primary)/0.12)] border-[hsl(var(--primary)/0.4)] text-[hsl(var(--primary))]"
          : "bg-[hsl(var(--secondary))] border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]"
      }`}
    >
      {children}
    </button>
  );
}

// ── Tab: Vorstellungen ────────────────────────────────────────────────

function ShowsTab({
  shows,
  staffById,
  assignmentsByShow,
  feedbackByShow,
  canEdit,
  activeStaffCount,
  preferredCount,
  aiEnabled,
  isPlanning,
  planningShowId,
  isBulkPlanning,
  isClearing,
  fupImportEnabled,
  onAdd,
  onEdit,
  onPlan,
  onAssign,
  onClear,
  onBulkPlanOpen,
  onFupOpen,
  onFeedback,
}: {
  shows: CleaningShow[];
  staffById: Map<number, CleaningStaff>;
  assignmentsByShow: Map<number, CleaningAssignment[]>;
  feedbackByShow: Map<number, CleaningFeedback>;
  canEdit: boolean;
  activeStaffCount: number;
  preferredCount: number;
  aiEnabled: boolean;
  isPlanning: boolean;
  planningShowId: number | null;
  isBulkPlanning: boolean;
  isClearing: boolean;
  fupImportEnabled: boolean;
  onAdd: () => void;
  onEdit: (show: CleaningShow) => void;
  onPlan: (show: CleaningShow) => void;
  onAssign: (show: CleaningShow) => void;
  onClear: (show: CleaningShow) => void;
  onBulkPlanOpen: () => void;
  onFupOpen: () => void;
  onFeedback: (show: CleaningShow) => void;
}) {
  void isClearing;
  const hasBulkable = shows.some(
    (s) => s.plan_status === "open" || s.plan_status === "planned",
  );
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
          {activeStaffCount} aktive Reinigungskräfte ({preferredCount} bevorzugt,{" "}
          {activeStaffCount - preferredCount} im Zweifelsfall).
          {aiEnabled ? " KI-Plan steht zur Verfügung." : " Heuristik wird verwendet (kein GEMINI_API_KEY)."}
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          {canEdit && fupImportEnabled && (
            <button
              onClick={onFupOpen}
              className="inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold border border-[hsl(var(--border))] bg-[hsl(var(--secondary))] hover:bg-[hsl(var(--muted))] text-[hsl(var(--foreground))]"
              title="Foto eines Filmübersichtsplans hochladen — Vorstellungen werden automatisch ausgelesen."
            >
              <ScanLine size={14} /> FÜP einlesen…
            </button>
          )}
          {canEdit && hasBulkable && (
            <button
              onClick={onBulkPlanOpen}
              disabled={isBulkPlanning}
              className="inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold border border-[hsl(var(--primary)/0.4)] bg-[hsl(var(--primary)/0.1)] text-[hsl(var(--primary))] hover:bg-[hsl(var(--primary)/0.18)] disabled:opacity-50"
              title="Mehrere Vorstellungen gleichzeitig planen — berücksichtigt MA, die parallel in einem anderen Saal eingeteilt sind."
            >
              <ListChecks size={14} />
              {isBulkPlanning ? "Plane…" : aiEnabled ? "KI-Plan für mehrere…" : "Plan für mehrere…"}
            </button>
          )}
          {canEdit && (
            <button
              onClick={onAdd}
              className="brand-button inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold"
            >
              <Plus size={14} /> Neue Vorstellung
            </button>
          )}
        </div>
      </div>

      {shows.length === 0 ? (
        <div className="feature-card text-center p-10" style={{ color: "hsl(var(--muted-foreground))" }}>
          Noch keine Vorstellungen angelegt. Lege deine erste an, dann kann die KI planen.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {shows.map((show) => {
            const assignments = assignmentsByShow.get(show.id) ?? [];
            const feedback = feedbackByShow.get(show.id) ?? null;
            const status = STATUS_LABELS[show.plan_status];
            const planning = planningShowId === show.id && isPlanning;
            const recommended =
              show.ai_recommended_staff_count ?? recommendStaffCount(show.attendees, show.intensity);
            const dateLabel = new Date(`${show.show_date}T00:00:00Z`).toLocaleDateString("de-DE", {
              timeZone: "Europe/Berlin",
              weekday: "short",
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
            });
            return (
              <div key={show.id} className="feature-card p-4 flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold" style={{ color: "hsl(var(--foreground))" }}>
                        Saal {show.hall_number}
                        {show.hall_label ? ` – ${show.hall_label}` : ""}
                      </span>
                      <span className={`text-[10px] font-semibold uppercase tracking-wide rounded-full px-2 py-0.5 border ${status.cls}`}>
                        {status.label}
                      </span>
                      <span className="text-[10px] uppercase tracking-wide rounded-full px-2 py-0.5 border border-[hsl(var(--border))]" style={{ color: "hsl(var(--muted-foreground))" }}>
                        {INTENSITY_LABEL[show.intensity]}
                      </span>
                    </div>
                    <div className="mt-1 text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
                      {dateLabel} · {formatTimeRange(show.end_time, show.cleanup_minutes)}
                    </div>
                    {show.movie_title && (
                      <div className="mt-0.5 text-xs italic" style={{ color: "hsl(var(--muted-foreground))" }}>
                        „{show.movie_title}"
                      </div>
                    )}
                    <div className="mt-1 text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
                      {show.attendees} Besucher · {show.cleanup_minutes} min Reinigung
                    </div>
                  </div>
                  {canEdit && (
                    <button
                      onClick={() => onEdit(show)}
                      className="p-1 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
                      title="Bearbeiten"
                    >
                      <Pencil size={14} />
                    </button>
                  )}
                </div>

                <div className="border-t border-[hsl(var(--border))] pt-3 flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-[11px] uppercase font-semibold tracking-wide" style={{ color: "hsl(var(--muted-foreground))" }}>
                      Empfehlung: {recommended} {recommended === 1 ? "Mitarbeiter" : "Mitarbeiter"}
                    </span>
                    {canEdit && (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <button
                          onClick={() => onAssign(show)}
                          className="inline-flex items-center gap-1 text-xs font-medium rounded-lg px-2.5 py-1 bg-[hsl(var(--secondary))] hover:bg-[hsl(var(--muted))] text-[hsl(var(--foreground))] border border-[hsl(var(--border))]"
                          title="Mitarbeiter manuell zuweisen — werden von KI nicht überschrieben"
                        >
                          <UserPlus size={12} /> Zuweisen
                        </button>
                        <button
                          onClick={() => onPlan(show)}
                          disabled={planning || isBulkPlanning}
                          className="inline-flex items-center gap-1 text-xs font-semibold rounded-lg px-2.5 py-1 bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90 disabled:opacity-50"
                          title={
                            (assignments.some((a) => a.assigned_by === "manual" || a.assigned_by === "override"))
                              ? "Manuelle Zuweisungen bleiben fest — KI füllt nur auf"
                              : undefined
                          }
                        >
                          <Sparkles size={12} /> {planning ? "Plane…" : aiEnabled ? "KI-Plan" : "Plan erstellen"}
                        </button>
                        {assignments.length > 0 && (
                          <button
                            onClick={() => onClear(show)}
                            className="inline-flex items-center gap-1 text-xs font-medium rounded-lg px-2.5 py-1 bg-[hsl(var(--destructive)/0.1)] hover:bg-[hsl(var(--destructive)/0.2)] text-[hsl(var(--destructive))] border border-[hsl(var(--destructive)/0.3)]"
                            title="Alle Zuweisungen entfernen"
                          >
                            <Eraser size={12} /> Leeren
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {assignments.length === 0 ? (
                    <p className="text-xs italic" style={{ color: "hsl(var(--muted-foreground))" }}>
                      Noch keine Zuweisungen.
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {assignments.map((a) => {
                        const staff = staffById.get(a.staff_id);
                        if (!staff) return null;
                        const isManual = a.assigned_by === "manual" || a.assigned_by === "override";
                        return (
                          <span
                            key={a.id}
                            className="inline-flex items-center gap-1.5 rounded-full pl-1 pr-2 py-0.5 text-xs"
                            style={{
                              backgroundColor: `${staff.color}1f`,
                              color: staff.color,
                              border: `1px solid ${staff.color}${isManual ? "aa" : "55"}`,
                            }}
                            title={`${a.reason ?? ""}${isManual ? " (Manuell — KI überschreibt nicht)" : ""}`.trim()}
                          >
                            <span
                              className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white"
                              style={{ backgroundColor: staff.color }}
                            >
                              {getInitials(staff.name)}
                            </span>
                            <span>{staff.name}</span>
                            {isManual ? (
                              <Lock size={9} style={{ opacity: 0.85 }} aria-label="Manuell" />
                            ) : (
                              <Brush size={9} style={{ opacity: 0.6 }} aria-label="KI" />
                            )}
                          </span>
                        );
                      })}
                    </div>
                  )}

                  {show.ai_notes && (
                    <p className="text-[11px] italic" style={{ color: "hsl(var(--muted-foreground))" }}>
                      KI: {show.ai_notes}
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-[hsl(var(--border))]">
                  <div className="text-[11px]" style={{ color: "hsl(var(--muted-foreground))" }}>
                    {feedback
                      ? `Feedback: ${feedback.actual_staff_count} MA tatsächlich${
                          feedback.rating ? ` · ${feedback.rating}/5` : ""
                        }`
                      : "Noch kein Feedback"}
                  </div>
                  {canEdit && (
                    <button
                      onClick={() => onFeedback(show)}
                      className="text-xs font-medium text-[hsl(var(--primary))] hover:underline"
                    >
                      {feedback ? "Feedback bearbeiten" : "Feedback erfassen"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Tab: Reinigungskräfte ─────────────────────────────────────────────

function StaffTab({
  staff,
  canEdit,
  onAdd,
  onEdit,
}: {
  staff: CleaningStaff[];
  canEdit: boolean;
  onAdd: () => void;
  onEdit: (s: CleaningStaff) => void;
}) {
  const preferred = staff.filter((s) => s.preference === "preferred");
  const backup = staff.filter((s) => s.preference === "backup");
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
          {preferred.length} bevorzugt · {backup.length} im Zweifelsfall.
        </p>
        {canEdit && (
          <button onClick={onAdd} className="brand-button inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold">
            <Plus size={14} /> Neuer Mitarbeiter
          </button>
        )}
      </div>
      <StaffGroup title="Bevorzugt" list={preferred} onEdit={onEdit} canEdit={canEdit} />
      <StaffGroup title="Im Zweifelsfall" list={backup} onEdit={onEdit} canEdit={canEdit} muted />
    </div>
  );
}

function StaffGroup({
  title,
  list,
  onEdit,
  canEdit,
  muted = false,
}: {
  title: string;
  list: CleaningStaff[];
  onEdit: (s: CleaningStaff) => void;
  canEdit: boolean;
  muted?: boolean;
}) {
  if (list.length === 0) return null;
  return (
    <div>
      <p
        className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em]"
        style={{ color: muted ? "hsl(var(--muted-foreground) / 0.7)" : "hsl(var(--muted-foreground))" }}
      >
        {title} ({list.length})
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {list.map((s) => (
          <div
            key={s.id}
            className="feature-card p-3 flex items-center gap-3"
            style={{ opacity: s.is_active ? 1 : 0.55 }}
          >
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
              style={{ backgroundColor: s.color }}
            >
              {getInitials(s.name)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold truncate" style={{ color: "hsl(var(--foreground))" }}>
                {s.name}
              </div>
              {s.notes && (
                <div className="text-[11px] truncate" style={{ color: "hsl(var(--muted-foreground))" }}>
                  {s.notes}
                </div>
              )}
            </div>
            {canEdit && (
              <button
                onClick={() => onEdit(s)}
                className="p-1 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
                title="Bearbeiten"
              >
                <Pencil size={14} />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Staff-Modal ───────────────────────────────────────────────────────

function StaffModal({
  staff,
  canEdit,
  onClose,
  createAction,
  updateAction,
  deleteAction,
}: {
  staff: CleaningStaff | null;
  canEdit: boolean;
  onClose: () => void;
  createAction: ActionFn;
  updateAction: ActionFn;
  deleteAction: ActionFn;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [color, setColor] = useState(staff?.color ?? STAFF_COLORS[0]);
  const [preference, setPreference] = useState<CleaningPreference>(staff?.preference ?? "preferred");
  const isEdit = Boolean(staff);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("color", color);
    fd.set("preference", preference);
    startTransition(async () => {
      if (isEdit && staff) {
        fd.set("id", String(staff.id));
        await updateAction(fd);
      } else {
        await createAction(fd);
      }
      router.refresh();
      onClose();
    });
  }

  function handleDelete() {
    if (!staff) return;
    const fd = new FormData();
    fd.set("id", String(staff.id));
    startTransition(async () => {
      await deleteAction(fd);
      router.refresh();
      onClose();
    });
  }

  return (
    <ModalShell title={isEdit ? "Mitarbeiter bearbeiten" : "Neuer Mitarbeiter"} onClose={onClose}>
      <form onSubmit={onSubmit} className="p-5 space-y-4">
        <div>
          <label className="block text-xs text-[hsl(var(--muted-foreground))] mb-1.5">
            Name <span className="text-[hsl(var(--destructive))]">*</span>
          </label>
          <input name="name" required defaultValue={staff?.name ?? ""} className={inputCls} disabled={!canEdit} />
        </div>

        <div>
          <label className="block text-xs text-[hsl(var(--muted-foreground))] mb-1.5">Einsatz-Präferenz</label>
          <div className="grid grid-cols-2 gap-2">
            {PREFERENCE_OPTIONS.map((p) => (
              <button
                type="button"
                key={p.value}
                onClick={() => setPreference(p.value)}
                disabled={!canEdit}
                className={`text-left rounded-lg border p-2.5 text-xs transition-colors ${
                  preference === p.value
                    ? "border-[hsl(var(--primary)/0.6)] bg-[hsl(var(--primary)/0.08)]"
                    : "border-[hsl(var(--border))] bg-[hsl(var(--background))]"
                }`}
              >
                <div className="font-semibold" style={{ color: "hsl(var(--foreground))" }}>{p.label}</div>
                <div style={{ color: "hsl(var(--muted-foreground))" }}>{p.description}</div>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs text-[hsl(var(--muted-foreground))] mb-1.5">Notiz (optional)</label>
          <input name="notes" defaultValue={staff?.notes ?? ""} className={inputCls} disabled={!canEdit} />
        </div>

        <div>
          <label className="block text-xs text-[hsl(var(--muted-foreground))] mb-2">Farbe</label>
          <div className="flex flex-wrap gap-2">
            {STAFF_COLORS.map((c) => (
              <button
                type="button"
                key={c}
                onClick={() => setColor(c)}
                disabled={!canEdit}
                className="w-8 h-8 rounded-full transition-transform hover:scale-110"
                style={{
                  backgroundColor: c,
                  outline: c === color ? "3px solid hsl(var(--ring))" : "none",
                  outlineOffset: "2px",
                }}
                title={c}
              />
            ))}
          </div>
        </div>

        {isEdit && (
          <label className="flex items-center gap-2 text-sm">
            <input type="hidden" name="is_active" value={staff?.is_active ? "true" : "false"} />
            <span style={{ color: "hsl(var(--foreground))" }}>
              {staff?.is_active ? "Aktiv" : "Inaktiv"} —
              <button
                type="button"
                onClick={(ev) => {
                  const form = (ev.target as HTMLButtonElement).closest("form");
                  const hidden = form?.querySelector<HTMLInputElement>('input[name="is_active"]');
                  if (hidden) hidden.value = hidden.value === "true" ? "false" : "true";
                }}
                className="ml-1 text-xs underline text-[hsl(var(--primary))]"
              >
                umschalten
              </button>
            </span>
          </label>
        )}

        <div className="flex gap-2 pt-2 border-t border-[hsl(var(--border))]">
          {isEdit && canEdit && (
            confirmDelete ? (
              <div className="flex gap-1.5 items-center">
                <button
                  type="button"
                  onClick={handleDelete}
                  className="px-3 py-1.5 bg-[hsl(var(--destructive)/0.15)] border border-[hsl(var(--destructive)/0.4)] text-[hsl(var(--destructive))] text-xs rounded-lg"
                >
                  Wirklich löschen
                </button>
                <button type="button" onClick={() => setConfirmDelete(false)} className="px-3 py-1.5 text-xs rounded-lg bg-[hsl(var(--secondary))]">
                  Nein
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="inline-flex items-center gap-1 px-3 py-2 text-sm bg-[hsl(var(--destructive)/0.1)] hover:bg-[hsl(var(--destructive)/0.2)] border border-[hsl(var(--destructive)/0.4)] text-[hsl(var(--destructive))] rounded-lg"
              >
                <Trash2 size={14} /> Löschen
              </button>
            )
          )}
          <button type="button" onClick={onClose} className="ml-auto px-4 py-2 bg-[hsl(var(--secondary))] hover:bg-[hsl(var(--muted))] text-sm rounded-lg">
            Abbrechen
          </button>
          {canEdit && (
            <button
              type="submit"
              disabled={isPending}
              className="px-4 py-2 bg-[hsl(var(--primary))] hover:opacity-90 text-[hsl(var(--primary-foreground))] text-sm font-medium rounded-lg disabled:opacity-50"
            >
              {isPending ? "Speichern…" : isEdit ? "Speichern" : "Anlegen"}
            </button>
          )}
        </div>
      </form>
    </ModalShell>
  );
}

// ── Show-Modal ────────────────────────────────────────────────────────

function ShowModal({
  show,
  canEdit,
  onClose,
  createAction,
  updateAction,
  deleteAction,
}: {
  show: CleaningShow | null;
  canEdit: boolean;
  onClose: () => void;
  createAction: ActionFn;
  updateAction: ActionFn;
  deleteAction: ActionFn;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [intensity, setIntensity] = useState<ShowIntensity>(show?.intensity ?? "standard");
  const isEdit = Boolean(show);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("intensity", intensity);
    startTransition(async () => {
      if (isEdit && show) {
        fd.set("id", String(show.id));
        await updateAction(fd);
      } else {
        await createAction(fd);
      }
      router.refresh();
      onClose();
    });
  }

  function handleDelete() {
    if (!show) return;
    const fd = new FormData();
    fd.set("id", String(show.id));
    startTransition(async () => {
      await deleteAction(fd);
      router.refresh();
      onClose();
    });
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <ModalShell title={isEdit ? "Vorstellung bearbeiten" : "Neue Vorstellung"} onClose={onClose}>
      <form onSubmit={onSubmit} className="p-5 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-[hsl(var(--muted-foreground))] mb-1.5">
              Datum <span className="text-[hsl(var(--destructive))]">*</span>
            </label>
            <input type="date" name="show_date" required defaultValue={show?.show_date ?? today} className={inputCls} disabled={!canEdit} />
          </div>
          <div>
            <label className="block text-xs text-[hsl(var(--muted-foreground))] mb-1.5">
              Endzeit <span className="text-[hsl(var(--destructive))]">*</span>
            </label>
            <input type="time" name="end_time" required defaultValue={show?.end_time?.slice(0, 5) ?? "20:00"} className={inputCls} disabled={!canEdit} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-[hsl(var(--muted-foreground))] mb-1.5">
              Saal-Nr. <span className="text-[hsl(var(--destructive))]">*</span>
            </label>
            <input type="number" name="hall_number" min={1} required defaultValue={show?.hall_number ?? 1} className={inputCls} disabled={!canEdit} />
          </div>
          <div>
            <label className="block text-xs text-[hsl(var(--muted-foreground))] mb-1.5">Saalname (optional)</label>
            <input name="hall_label" defaultValue={show?.hall_label ?? ""} className={inputCls} disabled={!canEdit} placeholder="z.B. Roter Saal" />
          </div>
        </div>
        <div>
          <label className="block text-xs text-[hsl(var(--muted-foreground))] mb-1.5">Filmtitel (optional)</label>
          <input name="movie_title" defaultValue={show?.movie_title ?? ""} className={inputCls} disabled={!canEdit} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-[hsl(var(--muted-foreground))] mb-1.5">Besucher</label>
            <input type="number" name="attendees" min={0} defaultValue={show?.attendees ?? 0} className={inputCls} disabled={!canEdit} />
          </div>
          <div>
            <label className="block text-xs text-[hsl(var(--muted-foreground))] mb-1.5">Aufräumzeit (Minuten)</label>
            <input type="number" name="cleanup_minutes" min={1} defaultValue={show?.cleanup_minutes ?? 15} className={inputCls} disabled={!canEdit} />
          </div>
        </div>
        <div>
          <label className="block text-xs text-[hsl(var(--muted-foreground))] mb-1.5">Reinigungsintensität</label>
          <div className="grid grid-cols-3 gap-2">
            {INTENSITY_OPTIONS.map((opt) => (
              <button
                type="button"
                key={opt.value}
                onClick={() => setIntensity(opt.value)}
                disabled={!canEdit}
                className={`text-left rounded-lg border p-2 text-xs transition-colors ${
                  intensity === opt.value
                    ? "border-[hsl(var(--primary)/0.6)] bg-[hsl(var(--primary)/0.08)]"
                    : "border-[hsl(var(--border))] bg-[hsl(var(--background))]"
                }`}
              >
                <div className="font-semibold" style={{ color: "hsl(var(--foreground))" }}>{opt.label}</div>
                <div style={{ color: "hsl(var(--muted-foreground))" }}>{opt.description}</div>
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-xs text-[hsl(var(--muted-foreground))] mb-1.5">Interne Notiz (optional)</label>
          <input name="notes" defaultValue={show?.notes ?? ""} className={inputCls} disabled={!canEdit} />
        </div>
        <div className="flex gap-2 pt-2 border-t border-[hsl(var(--border))]">
          {isEdit && canEdit && (
            confirmDelete ? (
              <div className="flex gap-1.5 items-center">
                <button type="button" onClick={handleDelete} className="px-3 py-1.5 bg-[hsl(var(--destructive)/0.15)] border border-[hsl(var(--destructive)/0.4)] text-[hsl(var(--destructive))] text-xs rounded-lg">
                  Wirklich löschen
                </button>
                <button type="button" onClick={() => setConfirmDelete(false)} className="px-3 py-1.5 text-xs rounded-lg bg-[hsl(var(--secondary))]">
                  Nein
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => setConfirmDelete(true)} className="inline-flex items-center gap-1 px-3 py-2 text-sm bg-[hsl(var(--destructive)/0.1)] hover:bg-[hsl(var(--destructive)/0.2)] border border-[hsl(var(--destructive)/0.4)] text-[hsl(var(--destructive))] rounded-lg">
                <Trash2 size={14} /> Löschen
              </button>
            )
          )}
          <button type="button" onClick={onClose} className="ml-auto px-4 py-2 bg-[hsl(var(--secondary))] hover:bg-[hsl(var(--muted))] text-sm rounded-lg">
            Abbrechen
          </button>
          {canEdit && (
            <button type="submit" disabled={isPending} className="px-4 py-2 bg-[hsl(var(--primary))] hover:opacity-90 text-[hsl(var(--primary-foreground))] text-sm font-medium rounded-lg disabled:opacity-50">
              {isPending ? "Speichern…" : isEdit ? "Speichern" : "Anlegen"}
            </button>
          )}
        </div>
      </form>
    </ModalShell>
  );
}

// ── Feedback-Modal ───────────────────────────────────────────────────

function FeedbackModal({
  show,
  assignments,
  existing,
  onClose,
  saveAction,
}: {
  show: CleaningShow;
  assignments: CleaningAssignment[];
  existing: CleaningFeedback | null;
  onClose: () => void;
  saveAction: ActionFn;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("show_id", String(show.id));
    startTransition(async () => {
      await saveAction(fd);
      router.refresh();
      onClose();
    });
  }

  return (
    <ModalShell title="Feedback erfassen" onClose={onClose}>
      <form onSubmit={onSubmit} className="p-5 space-y-4">
        <p className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
          Saal {show.hall_number} · {show.attendees} Besucher · {INTENSITY_LABEL[show.intensity]} —
          {" "}geplante MA: {assignments.length}. Wieviele waren tatsächlich nötig? Wie ist es gelaufen?
          Diese Daten fließen in zukünftige KI-Pläne.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-[hsl(var(--muted-foreground))] mb-1.5">
              Tatsächliche MA-Anzahl <span className="text-[hsl(var(--destructive))]">*</span>
            </label>
            <input
              type="number"
              name="actual_staff_count"
              min={0}
              required
              defaultValue={existing?.actual_staff_count ?? assignments.length}
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-xs text-[hsl(var(--muted-foreground))] mb-1.5">Tatsächliche Dauer (Min, optional)</label>
            <input
              type="number"
              name="actual_duration_minutes"
              min={0}
              defaultValue={existing?.actual_duration_minutes ?? ""}
              className={inputCls}
              placeholder={String(show.cleanup_minutes)}
            />
          </div>
        </div>
        <div>
          <label className="block text-xs text-[hsl(var(--muted-foreground))] mb-1.5">Bewertung (1=schlecht, 5=super)</label>
          <select name="rating" defaultValue={existing?.rating ?? ""} className={inputCls}>
            <option value="">— ohne Bewertung —</option>
            <option value="1">1 — zu wenig Personal/zu langsam</option>
            <option value="2">2</option>
            <option value="3">3 — passend</option>
            <option value="4">4</option>
            <option value="5">5 — top, evtl. zu viel Personal</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-[hsl(var(--muted-foreground))] mb-1.5">Notiz (optional)</label>
          <textarea
            name="notes"
            rows={3}
            defaultValue={existing?.notes ?? ""}
            className={inputCls}
            placeholder="z.B. Familienfilm, sehr klebrige Sitze"
          />
        </div>
        <div className="flex gap-2 pt-2 border-t border-[hsl(var(--border))]">
          <button type="button" onClick={onClose} className="ml-auto px-4 py-2 bg-[hsl(var(--secondary))] hover:bg-[hsl(var(--muted))] text-sm rounded-lg">
            Abbrechen
          </button>
          <button type="submit" disabled={isPending} className="px-4 py-2 bg-[hsl(var(--primary))] hover:opacity-90 text-[hsl(var(--primary-foreground))] text-sm font-medium rounded-lg disabled:opacity-50">
            {isPending ? "Speichern…" : "Feedback speichern"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

// ── Plan-Result-Modal ────────────────────────────────────────────────

function PlanResultModal({
  notice,
  staffById,
  onClose,
}: {
  notice: {
    show: CleaningShow;
    source: "ai" | "heuristic";
    recommended: number;
    aiNote: string | null;
    unmet?: string;
  };
  staffById: Map<number, CleaningStaff>;
  onClose: () => void;
}) {
  void staffById;
  return (
    <ModalShell title={`Plan für Saal ${notice.show.hall_number}`} onClose={onClose}>
      <div className="p-5 space-y-3">
        <p className="text-sm" style={{ color: "hsl(var(--foreground))" }}>
          <span className="font-semibold">{notice.source === "ai" ? "KI-Vorschlag:" : "Heuristik-Vorschlag:"}</span>{" "}
          {notice.recommended} {notice.recommended === 1 ? "Mitarbeiter" : "Mitarbeiter"} empfohlen.
        </p>
        {notice.aiNote && (
          <p className="text-xs italic" style={{ color: "hsl(var(--muted-foreground))" }}>
            Begründung: {notice.aiNote}
          </p>
        )}
        {notice.unmet && (
          <p className="text-xs" style={{ color: "hsl(32 95% 55%)" }}>
            ⚠ {notice.unmet}
          </p>
        )}
        <div className="flex justify-end pt-2">
          <button onClick={onClose} className="px-4 py-2 bg-[hsl(var(--primary))] hover:opacity-90 text-[hsl(var(--primary-foreground))] text-sm font-medium rounded-lg">
            OK
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

// ── Bulk-Plan-Picker ─────────────────────────────────────────────────

function formatShowDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("de-DE", {
    timeZone: "Europe/Berlin",
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function BulkPlanPickerModal({
  shows,
  isPlanning,
  aiEnabled,
  onClose,
  onPlan,
}: {
  shows: CleaningShow[];
  isPlanning: boolean;
  aiEnabled: boolean;
  onClose: () => void;
  onPlan: (showIds: number[]) => void;
}) {
  // Erledigte/abgesagte Vorstellungen sind nicht sinnvoll auswählbar
  const eligible = useMemo(
    () => shows.filter((s) => s.plan_status === "open" || s.plan_status === "planned"),
    [shows],
  );

  // Chronologisch sortiert (älteste zuerst), damit die Bulk-Verarbeitung später passend funktioniert
  const sorted = useMemo(
    () =>
      [...eligible].sort((a, b) => {
        if (a.show_date !== b.show_date) return a.show_date.localeCompare(b.show_date);
        return a.end_time.localeCompare(b.end_time);
      }),
    [eligible],
  );

  // Default: alle "offenen" angehakt
  const [selected, setSelected] = useState<Set<number>>(
    () => new Set(sorted.filter((s) => s.plan_status === "open").map((s) => s.id)),
  );

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(sorted.map((s) => s.id)));
  }
  function selectOpen() {
    setSelected(new Set(sorted.filter((s) => s.plan_status === "open").map((s) => s.id)));
  }
  function selectNone() {
    setSelected(new Set());
  }

  const count = selected.size;
  const allCount = sorted.length;
  const openCount = sorted.filter((s) => s.plan_status === "open").length;

  return (
    <ModalShell title={aiEnabled ? "KI-Plan für mehrere Vorstellungen" : "Plan für mehrere Vorstellungen"} onClose={onClose} size="wide">
      <div className="p-5 space-y-4">
        <p className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
          Wähle die Vorstellungen aus, die geplant werden sollen. Es werden chronologisch
          nacheinander geplant — Mitarbeiter, die zur gleichen Zeit in einem anderen Saal
          eingeteilt sind, werden automatisch übersprungen.
        </p>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={selectOpen}
            className="text-xs px-2.5 py-1 rounded-lg bg-[hsl(var(--secondary))] hover:bg-[hsl(var(--muted))]"
          >
            Nur offene ({openCount})
          </button>
          <button
            type="button"
            onClick={selectAll}
            className="text-xs px-2.5 py-1 rounded-lg bg-[hsl(var(--secondary))] hover:bg-[hsl(var(--muted))]"
          >
            Alle ({allCount})
          </button>
          <button
            type="button"
            onClick={selectNone}
            className="text-xs px-2.5 py-1 rounded-lg bg-[hsl(var(--secondary))] hover:bg-[hsl(var(--muted))]"
          >
            Keine
          </button>
          <span className="ml-auto text-xs font-semibold" style={{ color: "hsl(var(--foreground))" }}>
            {count} ausgewählt
          </span>
        </div>

        {sorted.length === 0 ? (
          <p className="text-sm italic" style={{ color: "hsl(var(--muted-foreground))" }}>
            Keine offenen oder bereits geplanten Vorstellungen vorhanden.
          </p>
        ) : (
          <div className="border border-[hsl(var(--border))] rounded-xl max-h-[50vh] overflow-y-auto divide-y divide-[hsl(var(--border))]">
            {sorted.map((s) => {
              const status = STATUS_LABELS[s.plan_status];
              const checked = selected.has(s.id);
              return (
                <label
                  key={s.id}
                  className="flex items-start gap-3 p-3 cursor-pointer hover:bg-[hsl(var(--secondary)/0.4)]"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(s.id)}
                    className="mt-0.5 h-4 w-4 accent-[hsl(var(--primary))]"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap text-xs">
                      <span className="font-semibold" style={{ color: "hsl(var(--foreground))" }}>
                        Saal {s.hall_number}
                        {s.hall_label ? ` – ${s.hall_label}` : ""}
                      </span>
                      <span className={`text-[10px] font-semibold uppercase tracking-wide rounded-full px-2 py-0.5 border ${status.cls}`}>
                        {status.label}
                      </span>
                      <span className="text-[10px] uppercase tracking-wide rounded-full px-2 py-0.5 border border-[hsl(var(--border))]" style={{ color: "hsl(var(--muted-foreground))" }}>
                        {INTENSITY_LABEL[s.intensity]}
                      </span>
                    </div>
                    <div className="mt-0.5 text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
                      {formatShowDate(s.show_date)} · {formatTimeRange(s.end_time, s.cleanup_minutes)}
                    </div>
                    {s.movie_title && (
                      <div className="text-[11px] italic truncate" style={{ color: "hsl(var(--muted-foreground))" }}>
                        „{s.movie_title}"
                      </div>
                    )}
                  </div>
                </label>
              );
            })}
          </div>
        )}

        <div className="flex gap-2 pt-2 border-t border-[hsl(var(--border))]">
          <button
            type="button"
            onClick={onClose}
            className="ml-auto px-4 py-2 bg-[hsl(var(--secondary))] hover:bg-[hsl(var(--muted))] text-sm rounded-lg"
            disabled={isPlanning}
          >
            Abbrechen
          </button>
          <button
            type="button"
            onClick={() => onPlan(Array.from(selected))}
            disabled={isPlanning || count === 0}
            className="inline-flex items-center gap-2 px-4 py-2 bg-[hsl(var(--primary))] hover:opacity-90 text-[hsl(var(--primary-foreground))] text-sm font-medium rounded-lg disabled:opacity-50"
          >
            <Sparkles size={14} />
            {isPlanning ? `Plane ${count}…` : `${count} planen`}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

function BulkPlanResultModal({
  summary,
  onClose,
}: {
  summary: BulkPlanSummary;
  onClose: () => void;
}) {
  return (
    <ModalShell title="Bulk-Plan-Ergebnis" onClose={onClose} size="wide">
      <div className="p-5 space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Stat label="Geplant" value={summary.planned} tone="ok" />
          <Stat label="Leer" value={summary.empty} tone="warn" />
          <Stat label="Fehler" value={summary.failed} tone="err" />
          <Stat label="Gesamt" value={summary.total} tone="neutral" />
        </div>
        <p className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
          Quellen: {summary.bySource.ai} per KI · {summary.bySource.heuristic} per Heuristik.
        </p>
        <div className="border border-[hsl(var(--border))] rounded-xl max-h-[50vh] overflow-y-auto divide-y divide-[hsl(var(--border))]">
          {summary.results.map((r) => (
            <div key={r.showId} className="flex items-start gap-2 p-3 text-xs">
              {r.ok ? (
                <CheckCircle2 size={14} className="mt-0.5 flex-shrink-0" style={{ color: "hsl(142 70% 45%)" }} />
              ) : (
                <XCircle size={14} className="mt-0.5 flex-shrink-0" style={{ color: "hsl(32 95% 55%)" }} />
              )}
              <div className="flex-1 min-w-0">
                <div className="font-semibold" style={{ color: "hsl(var(--foreground))" }}>
                  Saal {r.hallNumber ?? "?"} · {r.showDate ? formatShowDate(r.showDate) : ""}
                  {r.endTime ? ` · ${r.endTime.slice(0, 5)}` : ""}
                </div>
                <div style={{ color: "hsl(var(--muted-foreground))" }}>
                  {r.ok
                    ? `${r.assignedCount}/${r.recommendedCount} MA eingeteilt${r.source ? ` (${r.source === "ai" ? "KI" : "Heuristik"})` : ""}.`
                    : r.error
                    ? r.error
                    : "Keine Zuweisung möglich."}
                  {r.unmet && <span> {r.unmet}</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="flex justify-end pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-[hsl(var(--primary))] hover:opacity-90 text-[hsl(var(--primary-foreground))] text-sm font-medium rounded-lg"
          >
            OK
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "ok" | "warn" | "err" | "neutral";
}) {
  const cls =
    tone === "ok"
      ? "bg-emerald-500/15 text-emerald-600 border-emerald-500/30"
      : tone === "warn"
      ? "bg-amber-500/15 text-amber-600 border-amber-500/30"
      : tone === "err"
      ? "bg-rose-500/15 text-rose-600 border-rose-500/30"
      : "bg-[hsl(var(--secondary))] text-[hsl(var(--foreground))] border-[hsl(var(--border))]";
  return (
    <div className={`rounded-lg border px-3 py-2 ${cls}`}>
      <div className="text-[10px] uppercase tracking-wide opacity-80">{label}</div>
      <div className="text-lg font-bold leading-tight">{value}</div>
    </div>
  );
}

// ── Zuweisen-Modal ───────────────────────────────────────────────────

function AssignmentsEditorModal({
  show,
  staff,
  assignments,
  onClose,
  saveAction,
}: {
  show: CleaningShow;
  staff: CleaningStaff[];
  assignments: CleaningAssignment[];
  onClose: () => void;
  saveAction: ActionFn;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const activeStaff = useMemo(
    () => staff.filter((s) => s.is_active),
    [staff],
  );

  // Vorbelegung: alle aktuell zugewiesenen MA (egal ob manuell oder KI)
  const initialIds = useMemo(
    () => new Set(assignments.filter((a) => activeStaff.some((s) => s.id === a.staff_id)).map((a) => a.staff_id)),
    [assignments, activeStaff],
  );
  const [selected, setSelected] = useState<Set<number>>(() => new Set(initialIds));

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function onSubmit() {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("show_id", String(show.id));
      for (const id of selected) fd.append("staff_id", String(id));
      await saveAction(fd);
      router.refresh();
      onClose();
    });
  }

  const preferred = activeStaff.filter((s) => s.preference === "preferred");
  const backup = activeStaff.filter((s) => s.preference === "backup");
  const aiAssignedIds = new Set(
    assignments
      .filter((a) => a.assigned_by !== "manual" && a.assigned_by !== "override")
      .map((a) => a.staff_id),
  );
  const manualAssignedIds = new Set(
    assignments
      .filter((a) => a.assigned_by === "manual" || a.assigned_by === "override")
      .map((a) => a.staff_id),
  );

  return (
    <ModalShell title={`Manuelle Zuweisung — Saal ${show.hall_number}`} onClose={onClose} size="wide">
      <div className="p-5 space-y-4">
        <p className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
          Hier ausgewählte Mitarbeiter werden <strong>fest</strong> für diesen Auslass eingeplant.
          Beim nächsten KI-Plan werden sie nicht überschrieben — die KI füllt nur auf, wenn die
          Empfehlung höher liegt.
        </p>

        <StaffPickerGroup
          title="Bevorzugt"
          list={preferred}
          selected={selected}
          onToggle={toggle}
          aiAssignedIds={aiAssignedIds}
          manualAssignedIds={manualAssignedIds}
        />
        <StaffPickerGroup
          title="Im Zweifelsfall"
          list={backup}
          selected={selected}
          onToggle={toggle}
          aiAssignedIds={aiAssignedIds}
          manualAssignedIds={manualAssignedIds}
          muted
        />

        {activeStaff.length === 0 && (
          <p className="text-sm italic" style={{ color: "hsl(var(--muted-foreground))" }}>
            Keine aktiven Mitarbeiter vorhanden.
          </p>
        )}

        <div className="flex items-center gap-2 pt-2 border-t border-[hsl(var(--border))]">
          <span className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
            {selected.size} ausgewählt
          </span>
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="ml-auto px-4 py-2 bg-[hsl(var(--secondary))] hover:bg-[hsl(var(--muted))] text-sm rounded-lg"
          >
            Abbrechen
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={isPending}
            className="px-4 py-2 bg-[hsl(var(--primary))] hover:opacity-90 text-[hsl(var(--primary-foreground))] text-sm font-medium rounded-lg disabled:opacity-50"
          >
            {isPending ? "Speichern…" : "Übernehmen"}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

function StaffPickerGroup({
  title,
  list,
  selected,
  onToggle,
  aiAssignedIds,
  manualAssignedIds,
  muted = false,
}: {
  title: string;
  list: CleaningStaff[];
  selected: Set<number>;
  onToggle: (id: number) => void;
  aiAssignedIds: Set<number>;
  manualAssignedIds: Set<number>;
  muted?: boolean;
}) {
  if (list.length === 0) return null;
  return (
    <div>
      <p
        className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em]"
        style={{ color: muted ? "hsl(var(--muted-foreground) / 0.7)" : "hsl(var(--muted-foreground))" }}
      >
        {title} ({list.length})
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
        {list.map((s) => {
          const checked = selected.has(s.id);
          const wasAi = aiAssignedIds.has(s.id);
          const wasManual = manualAssignedIds.has(s.id);
          return (
            <label
              key={s.id}
              className={`flex items-center gap-2.5 rounded-lg border p-2 text-sm cursor-pointer transition-colors ${
                checked
                  ? "border-[hsl(var(--primary)/0.5)] bg-[hsl(var(--primary)/0.08)]"
                  : "border-[hsl(var(--border))] bg-[hsl(var(--background))] hover:bg-[hsl(var(--secondary)/0.4)]"
              }`}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => onToggle(s.id)}
                className="h-4 w-4 accent-[hsl(var(--primary))]"
              />
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0"
                style={{ backgroundColor: s.color }}
              >
                {getInitials(s.name)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium" style={{ color: "hsl(var(--foreground))" }}>
                  {s.name}
                </div>
                <div className="text-[10px] flex items-center gap-1" style={{ color: "hsl(var(--muted-foreground))" }}>
                  {wasManual ? (
                    <span className="inline-flex items-center gap-0.5">
                      <Lock size={8} /> aktuell manuell
                    </span>
                  ) : wasAi ? (
                    <span className="inline-flex items-center gap-0.5">
                      <Brush size={8} /> aktuell durch KI
                    </span>
                  ) : (
                    <span>nicht eingeplant</span>
                  )}
                </div>
              </div>
            </label>
          );
        })}
      </div>
    </div>
  );
}

function ConfirmClearModal({
  show,
  assignmentCount,
  isClearing,
  onCancel,
  onConfirm,
}: {
  show: CleaningShow;
  assignmentCount: number;
  isClearing: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <ModalShell title="Planung leeren?" onClose={onCancel}>
      <div className="p-5 space-y-4">
        <p className="text-sm" style={{ color: "hsl(var(--foreground))" }}>
          Sollen alle {assignmentCount}{" "}
          {assignmentCount === 1 ? "Zuweisung" : "Zuweisungen"} für Saal {show.hall_number}
          {show.hall_label ? ` – ${show.hall_label}` : ""} entfernt werden?
        </p>
        <p className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
          Sowohl manuelle als auch KI-generierte Zuweisungen werden gelöscht. Die Vorstellung
          wechselt zurück in den Status „Offen".
        </p>
        <div className="flex gap-2 pt-2 border-t border-[hsl(var(--border))]">
          <button
            type="button"
            onClick={onCancel}
            disabled={isClearing}
            className="ml-auto px-4 py-2 bg-[hsl(var(--secondary))] hover:bg-[hsl(var(--muted))] text-sm rounded-lg"
          >
            Abbrechen
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isClearing}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-[hsl(var(--destructive))] hover:opacity-90 text-white text-sm font-medium rounded-lg disabled:opacity-50"
          >
            <Eraser size={14} />
            {isClearing ? "Leere…" : "Ja, leeren"}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

// ── FÜP-Upload-Modal ─────────────────────────────────────────────────

type FupEditableRow = {
  selected: boolean;
  hall_number: number;
  end_time: string;
  cleanup_minutes: number;
  movie_title: string;
  intensity: "light" | "standard" | "intense";
  attendees: number;
  fsk: number | null;
};

async function compressImageForUpload(file: File): Promise<File> {
  const MAX_DIM = 1800;
  const QUALITY = 0.85;
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const longest = Math.max(img.width, img.height);
      const scale = longest > MAX_DIM ? MAX_DIM / longest : 1;
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error("Canvas-Context nicht verfügbar"));
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(url);
          if (!blob) {
            reject(new Error("Komprimierung fehlgeschlagen"));
            return;
          }
          resolve(new File([blob], "fup.jpg", { type: "image/jpeg" }));
        },
        "image/jpeg",
        QUALITY,
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Bild konnte nicht gelesen werden"));
    };
    img.src = url;
  });
}

function FupUploadModal({
  onClose,
  parseAction,
  createAction,
  onCreated,
}: {
  onClose: () => void;
  parseAction: ParseFupFn;
  createAction: CreateFromFupFn;
  onCreated: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [stage, setStage] = useState<"pick" | "parsing" | "review">("pick");
  const [error, setError] = useState<string | null>(null);
  const [showDate, setShowDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [rows, setRows] = useState<FupEditableRow[]>([]);
  const [isCreating, startCreating] = useTransition();
  const [created, setCreated] = useState<number | null>(null);

  function onFileChange(ev: React.ChangeEvent<HTMLInputElement>) {
    const f = ev.target.files?.[0] ?? null;
    setFile(f);
    setError(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(f ? URL.createObjectURL(f) : null);
  }

  async function onParse() {
    if (!file) {
      setError("Bitte ein Bild auswählen.");
      return;
    }
    setError(null);
    setStage("parsing");
    try {
      const compressed = await compressImageForUpload(file);
      const fd = new FormData();
      fd.set("image", compressed);
      const result = await parseAction(fd);
      if (!result.ok) {
        setError(result.error);
        setStage("pick");
        return;
      }
      if (result.result.date) setShowDate(result.result.date);
      const editable: FupEditableRow[] = result.result.shows.map((s) => ({
        selected: true,
        hall_number: s.hall_number,
        end_time: s.credit_offset,
        cleanup_minutes: s.cleanup_minutes,
        movie_title: s.movie_title ?? "",
        intensity: s.intensity_hint,
        attendees: 0,
        fsk: s.fsk,
      }));
      // Chronologisch sortieren
      editable.sort((a, b) => {
        if (a.end_time !== b.end_time) return a.end_time.localeCompare(b.end_time);
        return a.hall_number - b.hall_number;
      });
      setRows(editable);
      setStage("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bild konnte nicht ausgewertet werden.");
      setStage("pick");
    }
  }

  function updateRow(index: number, patch: Partial<FupEditableRow>) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function onSubmit() {
    const toCreate = rows.filter((r) => r.selected);
    if (toCreate.length === 0 || !/^\d{4}-\d{2}-\d{2}$/.test(showDate)) return;
    startCreating(async () => {
      const fd = new FormData();
      fd.set("show_date", showDate);
      fd.set(
        "shows",
        JSON.stringify(
          toCreate.map((r) => ({
            hall_number: r.hall_number,
            end_time: r.end_time,
            cleanup_minutes: r.cleanup_minutes,
            movie_title: r.movie_title || null,
            intensity: r.intensity,
            attendees: r.attendees,
          })),
        ),
      );
      const res = await createAction(fd);
      setCreated(res.created);
      onCreated();
    });
  }

  const selectedCount = rows.filter((r) => r.selected).length;

  return (
    <ModalShell title="FÜP einlesen" onClose={onClose} size="xl">
      <div className="p-5 space-y-4">
        {stage === "pick" && (
          <>
            <p className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
              Lade ein Foto des Filmübersichtsplans hoch. Die KI liest Saal, Credit-Offset (Beginn
              Auslass), Aufräumzeit und Filmtitel pro Zeile aus. Du kannst alles vor dem Anlegen
              prüfen und anpassen.
            </p>
            <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-[hsl(var(--border))] rounded-xl p-6 cursor-pointer hover:bg-[hsl(var(--secondary)/0.4)] transition-colors">
              <Upload size={28} className="text-[hsl(var(--muted-foreground))]" />
              <span className="text-sm font-medium" style={{ color: "hsl(var(--foreground))" }}>
                {file ? file.name : "Bild auswählen (oder hier ablegen)"}
              </span>
              {file && (
                <span className="text-[11px]" style={{ color: "hsl(var(--muted-foreground))" }}>
                  {(file.size / 1024 / 1024).toFixed(1)} MB
                </span>
              )}
              <input
                type="file"
                accept="image/*"
                onChange={onFileChange}
                className="hidden"
              />
            </label>
            {previewUrl && (
              <div className="rounded-lg overflow-hidden border border-[hsl(var(--border))] max-h-60 flex items-center justify-center bg-[hsl(var(--background))]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={previewUrl} alt="Vorschau" className="max-h-60 object-contain" />
              </div>
            )}
            {error && (
              <p className="text-xs" style={{ color: "hsl(var(--destructive))" }}>
                {error}
              </p>
            )}
            <div className="flex gap-2 pt-2 border-t border-[hsl(var(--border))]">
              <button
                type="button"
                onClick={onClose}
                className="ml-auto px-4 py-2 bg-[hsl(var(--secondary))] hover:bg-[hsl(var(--muted))] text-sm rounded-lg"
              >
                Abbrechen
              </button>
              <button
                type="button"
                onClick={onParse}
                disabled={!file}
                className="inline-flex items-center gap-2 px-4 py-2 bg-[hsl(var(--primary))] hover:opacity-90 text-[hsl(var(--primary-foreground))] text-sm font-medium rounded-lg disabled:opacity-50"
              >
                <FileImage size={14} />
                Auswerten
              </button>
            </div>
          </>
        )}

        {stage === "parsing" && (
          <div className="flex flex-col items-center gap-3 py-10">
            <div className="w-10 h-10 border-2 border-[hsl(var(--primary))] border-t-transparent rounded-full animate-spin" />
            <p className="text-sm font-medium" style={{ color: "hsl(var(--foreground))" }}>
              KI liest den FÜP aus…
            </p>
            <p className="text-xs text-center max-w-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
              Das kann je nach Größe und Detailgrad 5–20 Sekunden dauern.
            </p>
          </div>
        )}

        {stage === "review" && created === null && (
          <>
            <div className="flex items-end gap-3 flex-wrap">
              <div>
                <label className="block text-xs text-[hsl(var(--muted-foreground))] mb-1.5">
                  Datum für alle Vorstellungen
                </label>
                <input
                  type="date"
                  value={showDate}
                  onChange={(e) => setShowDate(e.target.value)}
                  className={inputCls}
                  style={{ width: "auto" }}
                />
              </div>
              <p className="text-xs ml-auto" style={{ color: "hsl(var(--muted-foreground))" }}>
                {rows.length} erkannt · {selectedCount} ausgewählt
              </p>
            </div>

            {rows.length === 0 ? (
              <p className="text-sm italic" style={{ color: "hsl(var(--muted-foreground))" }}>
                Keine Vorstellungen erkannt. Möglicherweise war das Bild zu unscharf — versuche
                ein klareres Foto.
              </p>
            ) : (
              <div className="border border-[hsl(var(--border))] rounded-xl overflow-auto max-h-[55vh]">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-[hsl(var(--card))] border-b border-[hsl(var(--border))]">
                    <tr className="text-left" style={{ color: "hsl(var(--muted-foreground))" }}>
                      <th className="p-2 w-8"></th>
                      <th className="p-2">Saal</th>
                      <th className="p-2">Auslass-Start</th>
                      <th className="p-2">Reinigung (min)</th>
                      <th className="p-2">Titel</th>
                      <th className="p-2">Intensität</th>
                      <th className="p-2">Besucher</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr
                        key={i}
                        className="border-t border-[hsl(var(--border))]"
                        style={{ opacity: r.selected ? 1 : 0.5 }}
                      >
                        <td className="p-2">
                          <input
                            type="checkbox"
                            checked={r.selected}
                            onChange={(e) => updateRow(i, { selected: e.target.checked })}
                            className="h-4 w-4 accent-[hsl(var(--primary))]"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="number"
                            min={1}
                            value={r.hall_number}
                            onChange={(e) =>
                              updateRow(i, { hall_number: Math.max(1, Number(e.target.value) || 1) })
                            }
                            className={`${inputCls} !w-16 !py-1`}
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="time"
                            value={r.end_time}
                            onChange={(e) => updateRow(i, { end_time: e.target.value })}
                            className={`${inputCls} !w-24 !py-1`}
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="number"
                            min={1}
                            value={r.cleanup_minutes}
                            onChange={(e) =>
                              updateRow(i, {
                                cleanup_minutes: Math.max(1, Number(e.target.value) || 1),
                              })
                            }
                            className={`${inputCls} !w-20 !py-1`}
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="text"
                            value={r.movie_title}
                            onChange={(e) => updateRow(i, { movie_title: e.target.value })}
                            className={`${inputCls} !py-1 min-w-[180px]`}
                          />
                          {r.fsk !== null && (
                            <span className="ml-1 inline-block text-[9px] px-1 py-0.5 rounded bg-[hsl(var(--secondary))] text-[hsl(var(--muted-foreground))]">
                              FSK {r.fsk}
                            </span>
                          )}
                        </td>
                        <td className="p-2">
                          <select
                            value={r.intensity}
                            onChange={(e) =>
                              updateRow(i, {
                                intensity: e.target.value as "light" | "standard" | "intense",
                              })
                            }
                            className={`${inputCls} !py-1`}
                          >
                            <option value="light">Leicht</option>
                            <option value="standard">Standard</option>
                            <option value="intense">Intensiv</option>
                          </select>
                        </td>
                        <td className="p-2">
                          <input
                            type="number"
                            min={0}
                            value={r.attendees}
                            onChange={(e) =>
                              updateRow(i, { attendees: Math.max(0, Number(e.target.value) || 0) })
                            }
                            className={`${inputCls} !w-20 !py-1`}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex gap-2 pt-2 border-t border-[hsl(var(--border))]">
              <button
                type="button"
                onClick={() => {
                  setStage("pick");
                  setRows([]);
                }}
                disabled={isCreating}
                className="px-4 py-2 bg-[hsl(var(--secondary))] hover:bg-[hsl(var(--muted))] text-sm rounded-lg"
              >
                Zurück
              </button>
              <button
                type="button"
                onClick={onClose}
                disabled={isCreating}
                className="ml-auto px-4 py-2 bg-[hsl(var(--secondary))] hover:bg-[hsl(var(--muted))] text-sm rounded-lg"
              >
                Abbrechen
              </button>
              <button
                type="button"
                onClick={onSubmit}
                disabled={isCreating || selectedCount === 0}
                className="inline-flex items-center gap-2 px-4 py-2 bg-[hsl(var(--primary))] hover:opacity-90 text-[hsl(var(--primary-foreground))] text-sm font-medium rounded-lg disabled:opacity-50"
              >
                <Plus size={14} />
                {isCreating ? "Lege an…" : `${selectedCount} Vorstellungen anlegen`}
              </button>
            </div>
          </>
        )}

        {stage === "review" && created !== null && (
          <div className="flex flex-col items-center gap-3 py-8">
            <CheckCircle2 size={36} style={{ color: "hsl(142 70% 45%)" }} />
            <p className="text-sm font-medium" style={{ color: "hsl(var(--foreground))" }}>
              {created} {created === 1 ? "Vorstellung" : "Vorstellungen"} angelegt.
            </p>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-[hsl(var(--primary))] hover:opacity-90 text-[hsl(var(--primary-foreground))] text-sm font-medium rounded-lg"
            >
              Fertig
            </button>
          </div>
        )}
      </div>
    </ModalShell>
  );
}

// ── Modal-Hülle ──────────────────────────────────────────────────────

function ModalShell({
  title,
  onClose,
  children,
  size = "default",
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  size?: "default" | "wide" | "xl";
}) {
  const maxWidthCls =
    size === "xl" ? "max-w-6xl" : size === "wide" ? "max-w-3xl" : "max-w-lg";
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative min-h-full flex items-start justify-center p-4 sm:p-6">
        <div className={`relative w-full ${maxWidthCls} my-auto bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-2xl shadow-2xl`}>
          <div className="flex items-center gap-3 p-5 border-b border-[hsl(var(--border))] rounded-t-2xl sticky top-0 bg-[hsl(var(--card))] z-10">
            <h2 className="font-semibold text-[hsl(var(--foreground))]">{title}</h2>
            <button
              onClick={onClose}
              className="ml-auto text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] p-1 rounded-lg hover:bg-[hsl(var(--secondary))]"
              aria-label="Schließen"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
