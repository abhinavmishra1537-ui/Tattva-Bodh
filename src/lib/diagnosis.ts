import { supabase } from "./supabaseClient";
import type { ConfidenceLevel, HydratedQuestion, Option } from "./types";

/* ------------------------------------------------------------------ */
/* Confidence-gated escalation state machine.                          */
/* A single miss NEVER escalates:                                      */
/*   1 miss   -> low     : silently flagged on the teacher heatmap     */
/*   2-3 miss -> medium  : serve one diagnostic follow-up question     */
/*   4+ miss  -> high    : serve a static remedial explainer + retest  */
/* Correct answers carry no misconception tag and do not touch scores. */
/* ------------------------------------------------------------------ */

export type Escalation = "none" | "flagged" | "followup" | "remedial";

export interface DiagnosisOutcome {
  correct: boolean;
  misconceptionTagId: string | null;
  repeatCount: number;
  confidenceLevel: ConfidenceLevel | null;
  escalation: Escalation;
}

export function levelForRepeatCount(n: number): ConfidenceLevel {
  if (n <= 1) return "low";
  if (n <= 3) return "medium";
  return "high";
}

function escalationFor(level: ConfidenceLevel): Escalation {
  if (level === "low") return "flagged";
  if (level === "medium") return "followup";
  return "remedial";
}

/**
 * Records a student attempt and runs the confidence state machine.
 * All diagnosis is deterministic — from the pre-tagged option bank only.
 */
export async function recordAttempt(
  studentId: string,
  questionId: string,
  option: Option
): Promise<DiagnosisOutcome> {
  const correct = option.is_correct;
  const tagId = correct ? null : option.misconception_tag_id;

  const { error: insertErr } = await supabase.from("student_responses").insert({
    student_id: studentId,
    question_id: questionId,
    selected_option_id: option.id,
    is_correct: correct,
    misconception_tag_id: tagId,
  });
  if (insertErr) throw new Error(insertErr.message);

  if (correct || !tagId) {
    return {
      correct: true,
      misconceptionTagId: null,
      repeatCount: 0,
      confidenceLevel: null,
      escalation: "none",
    };
  }

  const { data: existing, error: readErr } = await supabase
    .from("confidence_scores")
    .select("*")
    .eq("student_id", studentId)
    .eq("misconception_tag_id", tagId)
    .maybeSingle();
  if (readErr) throw new Error(readErr.message);

  const repeatCount = (existing?.repeat_count ?? 0) + 1;
  const confidenceLevel = levelForRepeatCount(repeatCount);

  const { error: writeErr } = await supabase
    .from("confidence_scores")
    .upsert(
      {
        student_id: studentId,
        misconception_tag_id: tagId,
        repeat_count: repeatCount,
        confidence_level: confidenceLevel,
        last_updated: new Date().toISOString(),
      },
      { onConflict: "student_id,misconception_tag_id" }
    );
  if (writeErr) throw new Error(writeErr.message);

  return {
    correct: false,
    misconceptionTagId: tagId,
    repeatCount,
    confidenceLevel,
    escalation: escalationFor(confidenceLevel),
  };
}

/**
 * Finds an unasked question that diagnostically targets the given
 * misconception tag (one of its wrong options carries the tag). Used for
 * medium-gate follow-ups and high-gate retests.
 */
export function pickTaggedQuestion(
  pool: HydratedQuestion[],
  tagId: string,
  askedIds: Set<string>
): HydratedQuestion | null {
  return (
    pool.find(
      (q) =>
        !askedIds.has(q.id) &&
        q.options.some((o) => !o.is_correct && o.misconception_tag_id === tagId)
    ) ?? null
  );
}
