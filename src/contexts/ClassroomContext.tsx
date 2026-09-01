import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "../lib/supabaseClient";
import { generateJoinCode } from "../lib/utils";
import type { Classroom } from "../lib/types";
import { useAuth } from "./AuthContext";

const LOG = "[Tattva Bodh]";

interface CreateResult {
  classroom: Classroom | null;
  error: string | null;
}

interface ClassroomState {
  classrooms: Classroom[];
  selected: Classroom | null;
  selectedId: string | null;
  select: (id: string) => void;
  loading: boolean;
  /** Last fetch error — surfaced in the UI, never swallowed. */
  error: string | null;
  refresh: () => Promise<void>;
  createClassroom: (name: string, subject: string) => Promise<CreateResult>;
}

const ClassroomContext = createContext<ClassroomState | null>(null);
const STORAGE_KEY = "tb:selected-classroom";

/** The teacher_id used for queries: always read from the LIVE auth session. */
async function liveAuthUserId(): Promise<string | null> {
  const { data, error } = await supabase.auth.getUser();
  if (error) console.error(`${LOG} auth.getUser() failed:`, error.message);
  return data.user?.id ?? null;
}

export function ClassroomProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(
    () => localStorage.getItem(STORAGE_KEY)
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    // Use the live session id (fall back to the loaded profile id) so the
    // teacher_id filter can never go stale between renders.
    const teacherId = (await liveAuthUserId()) ?? profile?.id ?? null;
    console.debug(`${LOG} refreshing classrooms with .eq('teacher_id', ${teacherId})`);
    if (!teacherId) {
      setError(null);
      setLoading(false);
      return;
    }
    const { data, error: fetchErr } = await supabase
      .from("classrooms")
      .select("*")
      .eq("teacher_id", teacherId)
      .order("created_at", { ascending: true });

    if (fetchErr) {
      console.error(
        `${LOG} classroom list fetch failed:`,
        fetchErr.message,
        fetchErr.details ?? "",
        fetchErr.hint ?? ""
      );
      setError(fetchErr.message);
      // Keep whatever we already have — do NOT blank a good list on a
      // transient failure; the error banner tells the teacher to retry.
    } else {
      console.debug(
        `${LOG} classroom list returned ${data?.length ?? 0} row(s) for teacher_id=${teacherId}`
      );
      setError(null);
      setClassrooms((data as Classroom[]) ?? []);
    }
    setLoading(false);
  }, [profile?.id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const select = useCallback((id: string) => {
    setSelectedId(id);
    localStorage.setItem(STORAGE_KEY, id);
  }, []);

  const createClassroom = useCallback(
    async (name: string, subject: string): Promise<CreateResult> => {
      const teacherId = (await liveAuthUserId()) ?? profile?.id ?? null;
      if (!teacherId) {
        return { classroom: null, error: "You're not signed in — please log in again." };
      }

      let lastError: string | null = null;
      // A few attempts, purely to survive a freak join_code unique collision.
      for (let attempt = 1; attempt <= 3; attempt++) {
        const payload = {
          teacher_id: teacherId,
          name: name.trim(),
          subject,
          join_code: generateJoinCode(),
        };
        const { data, error: insertErr } = await supabase
          .from("classrooms")
          .insert(payload)
          .select("*")
          .single();

        if (!insertErr && data) {
          const row = data as Classroom;
          console.debug(
            `${LOG} classroom created: id=${row.id} teacher_id=${row.teacher_id} join_code=${row.join_code}`
          );
          // (a) Append the returned row to local state IMMEDIATELY — the new
          // classroom shows up even if the reconciliation fetch below fails.
          setClassrooms((prev) =>
            prev.some((c) => c.id === row.id) ? prev : [...prev, row]
          );
          select(row.id);
          // (b) Then re-fetch the authoritative list and surface any error.
          await refresh();
          return { classroom: row, error: null };
        }

        lastError = insertErr?.message ?? "The insert returned no row.";
        console.error(`${LOG} classroom insert failed (attempt ${attempt}):`, insertErr);
        if (insertErr?.code !== "23505") break; // only retry unique collisions
      }
      return { classroom: null, error: lastError ?? "Could not create the classroom." };
    },
    [profile?.id, refresh, select]
  );

  const selected = useMemo(() => {
    if (classrooms.length === 0) return null;
    return classrooms.find((c) => c.id === selectedId) ?? classrooms[0];
  }, [classrooms, selectedId]);

  const value = useMemo(
    () => ({
      classrooms,
      selected,
      selectedId: selected?.id ?? null,
      select,
      loading,
      error,
      refresh,
      createClassroom,
    }),
    [classrooms, selected, select, loading, error, refresh, createClassroom]
  );

  return <ClassroomContext.Provider value={value}>{children}</ClassroomContext.Provider>;
}

export function useClassrooms(): ClassroomState {
  const ctx = useContext(ClassroomContext);
  if (!ctx) throw new Error("useClassrooms must be used inside <ClassroomProvider>");
  return ctx;
}
