// Verbesserungsschleife: Der Algorithmus plant, die KI schlägt Änderungen vor, jede Änderung wird
// gegen die harten Regeln geprüft und nur übernommen, wenn die Planqualität messbar steigt.
import {
  generateAutoPlanSlots,
  type AutoPlanResult,
} from "@/app/tools/dienstplaner/utils";

type PlanParams = Parameters<typeof generateAutoPlanSlots>[0];

export type ImproveRequest = {
  round: number;
  score: number;
  assignments: { slot_id: number; employee_id: number }[];
  unfilled: { slot_id: number; reason: string }[];
};

export type ImproveResponse = {
  changes: { slot_id: number; employee_id: number; reason?: string }[];
  notes?: string;
};

export type ImproveOutcome = {
  result: AutoPlanResult;
  base: AutoPlanResult;
  /** Wie viele Runden die KI tatsächlich befragt wurde */
  roundsAsked: number;
  /** Runden, deren Vorschläge übernommen wurden */
  roundsApplied: number;
  /** Slot-IDs, deren Besetzung sich gegenüber dem Algorithmus geändert hat */
  changedSlotIds: number[];
  scoreBefore: number;
  scoreAfter: number;
  notes: string[];
  error?: string;
};

export async function improvePlanWithAi(
  params: Omit<PlanParams, "fixedAssignments">,
  ask: (request: ImproveRequest) => Promise<ImproveResponse>,
  maxRounds: number
): Promise<ImproveOutcome> {
  const base = generateAutoPlanSlots(params);
  const knownSlotIds = new Set(params.slots.map((slot) => slot.id).filter((id): id is number => id !== undefined));

  const evaluate = (assignments: Map<number, number>) =>
    generateAutoPlanSlots({
      ...params,
      fixedAssignments: Array.from(assignments, ([slot_id, employee_id]) => ({ slot_id, employee_id })),
    });

  const original = new Map<number, number>();
  for (const shift of base.plannedShifts) {
    if (typeof shift.slot_id === "number") original.set(shift.slot_id, shift.employee_id);
  }

  let current = new Map(original);
  let result = base;
  let score = base.score ?? 0;
  const scoreBefore = score;
  const notes: string[] = [];
  let roundsAsked = 0;
  let roundsApplied = 0;
  let error: string | undefined;

  for (let round = 1; round <= Math.max(0, maxRounds); round += 1) {
    let response: ImproveResponse;
    try {
      roundsAsked += 1;
      response = await ask({
        round,
        score,
        assignments: Array.from(current, ([slot_id, employee_id]) => ({ slot_id, employee_id })),
        unfilled: result.unfilledSlots
          .filter((slot) => typeof slot.slot_id === "number")
          .map((slot) => ({ slot_id: slot.slot_id as number, reason: slot.reason })),
      });
    } catch (err) {
      error = err instanceof Error ? err.message : "KI-Anfrage fehlgeschlagen";
      break;
    }
    if (response.notes) notes.push(response.notes);

    const candidate = new Map(current);
    let moved = 0;
    for (const change of response.changes) {
      if (!knownSlotIds.has(change.slot_id)) continue;
      if (candidate.get(change.slot_id) === change.employee_id) continue;
      candidate.set(change.slot_id, change.employee_id);
      moved += 1;
    }
    if (moved === 0) break;

    // Regelverstöße einzeln zurücknehmen (nicht die ganze Runde verwerfen)
    let evaluated = evaluate(candidate);
    for (let attempt = 0; attempt < 4 && (evaluated.rejected?.length ?? 0) > 0; attempt += 1) {
      for (const rejection of evaluated.rejected ?? []) {
        const previous = current.get(rejection.slot_id);
        if (previous === undefined) candidate.delete(rejection.slot_id);
        else candidate.set(rejection.slot_id, previous);
      }
      evaluated = evaluate(candidate);
    }

    const improved = (evaluated.rejected?.length ?? 0) === 0 && (evaluated.score ?? Infinity) < score - 0.5;
    if (!improved) break;

    current = candidate;
    result = evaluated;
    score = evaluated.score ?? score;
    roundsApplied += 1;
  }

  const changedSlotIds: number[] = [];
  for (const [slotId, employeeId] of current) {
    if (original.get(slotId) !== employeeId) changedSlotIds.push(slotId);
  }

  return { result, base, roundsAsked, roundsApplied, changedSlotIds, scoreBefore, scoreAfter: score, notes, error };
}
