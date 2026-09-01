import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import type { Assignment, AssignmentSubmission, Classroom } from "../lib/types";
import { getCountdown } from "../lib/utils";

/** Classrooms a student is enrolled in (usually exactly one). */
export function useMyClassrooms(studentId: string | undefined) {
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!studentId) return;
    const { data, error } = await supabase
      .from("classroom_students")
      .select("classroom_id, classrooms(*)")
      .eq("student_id", studentId);
    if (error) {
      console.error("[Tattva Bodh] student classroom list fetch failed:", error.message);
      setClassrooms([]);
    } else {
      const rows = (data ?? []) as unknown as { classrooms: Classroom }[];
      setClassrooms(rows.map((r) => r.classrooms).filter(Boolean));
    }
    setLoading(false);
  }, [studentId]);

  useEffect(() => {
    load();
  }, [load]);

  return { classrooms, loading, refresh: load };
}

export interface StudentAssignment extends Assignment {
  classroomName: string;
  submission: AssignmentSubmission | null;
  urgent: boolean;
}

/** Assignments across the student's classrooms, merged with their submissions. */
export function useStudentAssignments(studentId: string | undefined) {
  const [items, setItems] = useState<StudentAssignment[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!studentId) return;
    const { data: enrol, error: enrolErr } = await supabase
      .from("classroom_students")
      .select("classroom_id, classrooms(name)")
      .eq("student_id", studentId);
    if (enrolErr) {
      console.error("student assignments enrol:", enrolErr.message);
      setItems([]);
      setLoading(false);
      return;
    }
    const rows = (enrol ?? []) as unknown as {
      classroom_id: string;
      classrooms: { name: string } | null;
    }[];
    const ids = rows.map((r) => r.classroom_id);
    const nameOf = new Map(rows.map((r) => [r.classroom_id, r.classrooms?.name ?? "Class"]));

    if (ids.length === 0) {
      setItems([]);
      setLoading(false);
      return;
    }

    const [{ data: assigns, error: aErr }, { data: subs, error: sErr }] = await Promise.all([
      supabase
        .from("assignments")
        .select("*")
        .in("classroom_id", ids)
        .order("deadline", { ascending: true }),
      supabase.from("assignment_submissions").select("*").eq("student_id", studentId),
    ]);
    if (aErr) console.error("assignments:", aErr.message);
    if (sErr) console.error("submissions:", sErr.message);

    const subByAssignment = new Map(
      ((subs ?? []) as AssignmentSubmission[]).map((s) => [s.assignment_id, s])
    );

    const merged: StudentAssignment[] = ((assigns ?? []) as Assignment[]).map((a) => {
      const submission = subByAssignment.get(a.id) ?? null;
      const cd = getCountdown(a.deadline);
      const urgent = !submission && cd.state !== "safe";
      return {
        ...a,
        classroomName: nameOf.get(a.classroom_id) ?? "Class",
        submission,
        urgent,
      };
    });
    setItems(merged);
    setLoading(false);
  }, [studentId]);

  useEffect(() => {
    load();
    const t = window.setInterval(load, 60_000);
    return () => window.clearInterval(t);
  }, [load]);

  const urgentCount = items.filter((i) => i.urgent).length;
  return { items, loading, refresh: load, urgentCount };
}
