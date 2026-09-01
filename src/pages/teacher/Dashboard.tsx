import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Flame, Grid3x3, MessagesSquare, Users, X } from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import { useClassrooms } from "../../contexts/ClassroomContext";
import { cn, difficultyLabel, formatDateTime, timeAgo } from "../../lib/utils";
import type { ConfidenceLevel, ConfidenceScore, MisconceptionTag } from "../../lib/types";
import { Badge, EmptyState, PageHeader, PageLoading, StatTile } from "../../components/ui";

/* ------------------------------------------------------------------ */

interface RosterStudent {
  id: string;
  name: string;
}

interface HeatTag extends MisconceptionTag {
  chapterName: string;
  subjectName: string;
}

interface CellDatum {
  level: ConfidenceLevel;
  repeat: number;
}

interface DrillResponse {
  id: string;
  attempted_at: string;
  is_correct: boolean;
  questions: { question_text: string; difficulty: number } | null;
  options: { option_text: string } | null;
}

const LEVEL_STYLE: Record<ConfidenceLevel, string> = {
  low: "bg-brass-200 text-brass-700 hover:bg-brass-300",
  medium: "bg-brass-500 text-cream hover:bg-brass-600",
  high: "bg-alert-600 text-cream hover:bg-alert-700",
};

export default function TeacherDashboard() {
  const { selected, loading: classroomLoading } = useClassrooms();

  const [students, setStudents] = useState<RosterStudent[]>([]);
  const [tags, setTags] = useState<HeatTag[]>([]);
  const [cells, setCells] = useState<Map<string, CellDatum>>(new Map());
  const [loading, setLoading] = useState(true);

  const [drill, setDrill] = useState<{ student: RosterStudent; tag: HeatTag } | null>(null);
  const [drillRows, setDrillRows] = useState<DrillResponse[]>([]);
  const [drillLoading, setDrillLoading] = useState(false);

  const load = useCallback(async () => {
    if (!selected) {
      setStudents([]);
      setTags([]);
      setCells(new Map());
      setLoading(false);
      return;
    }
    setLoading(true);

    /* 1. Roster */
    const { data: roster, error: rosterErr } = await supabase
      .from("classroom_students")
      .select("student_id, profiles(full_name)")
      .eq("classroom_id", selected.id)
      .order("joined_at", { ascending: true });
    if (rosterErr) console.error("roster:", rosterErr.message);
    const rosterRows = (roster ?? []) as unknown as {
      student_id: string;
      profiles: { full_name: string } | null;
    }[];
    const studentList: RosterStudent[] = rosterRows.map((r) => ({
      id: r.student_id,
      name: r.profiles?.full_name ?? "Student",
    }));

    /* 2. Misconception tags (scoped to the classroom's subject when it matches a seeded subject) */
    const { data: tagData, error: tagErr } = await supabase
      .from("misconception_tags")
      .select("*, chapters(name, subjects(name))")
      .order("tag_code", { ascending: true });
    if (tagErr) console.error("tags:", tagErr.message);
    const allTags = ((tagData ?? []) as unknown as (MisconceptionTag & {
      chapters: { name: string; subjects: { name: string } | null } | null;
    })[]).map((t) => ({
      ...t,
      chapterName: t.chapters?.name ?? "—",
      subjectName: t.chapters?.subjects?.name ?? "",
    }));
    const subjectMatch = allTags.filter(
      (t) => t.subjectName.toLowerCase() === (selected.subject ?? "").toLowerCase()
    );
    const scopedTags = subjectMatch.length > 0 ? subjectMatch : allTags;

    /* 3. Confidence scores for the roster */
    let cellMap = new Map<string, CellDatum>();
    if (studentList.length > 0) {
      const { data: scores, error: scoreErr } = await supabase
        .from("confidence_scores")
        .select("*")
        .in(
          "student_id",
          studentList.map((s) => s.id)
        );
      if (scoreErr) console.error("scores:", scoreErr.message);
      cellMap = new Map(
        ((scores ?? []) as ConfidenceScore[]).map((s) => [
          `${s.student_id}:${s.misconception_tag_id}`,
          { level: s.confidence_level, repeat: s.repeat_count },
        ])
      );
    }

    setStudents(studentList);
    setTags(scopedTags);
    setCells(cellMap);
    setLoading(false);
  }, [selected]);

  useEffect(() => {
    load();
  }, [load]);

  /* ---------------- Realtime: live heatmap ---------------- */
  const [liveAt, setLiveAt] = useState<Date | null>(null);
  const [liveOn, setLiveOn] = useState(false);
  const studentIdSet = useMemo(() => new Set(students.map((s) => s.id)), [students]);

  useEffect(() => {
    if (!selected || students.length === 0) return;

    // One channel per classroom; torn down on unmount / classroom switch so
    // subscriptions can never stack up across visits.
    const channel = supabase
      .channel(`confidence-scores:${selected.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "confidence_scores" },
        (payload) => {
          const row = (payload.new ?? payload.old) as ConfidenceScore | undefined;
          // Filter client-side to students on THIS classroom's roster.
          if (!row?.student_id || !studentIdSet.has(row.student_id)) return;

          console.debug(
            `[Tattva Bodh] realtime ${payload.eventType} for student=${row.student_id} tag=${row.misconception_tag_id}`
          );
          setCells((prev) => {
            const next = new Map(prev);
            const key = `${row.student_id}:${row.misconception_tag_id}`;
            if (payload.eventType === "DELETE") next.delete(key);
            else next.set(key, { level: row.confidence_level, repeat: row.repeat_count });
            return next;
          });
          setLiveAt(new Date());
        }
      )
      .subscribe((status) => {
        setLiveOn(status === "SUBSCRIBED");
        console.debug(`[Tattva Bodh] heatmap realtime channel: ${status}`);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selected, students.length, studentIdSet]);

  /* Drill into a cell: the response history for student × tag */
  const openDrill = useCallback(async (student: RosterStudent, tag: HeatTag) => {
    setDrill({ student, tag });
    setDrillLoading(true);
    const { data, error } = await supabase
      .from("student_responses")
      .select("id, attempted_at, is_correct, questions(question_text, difficulty), options(option_text)")
      .eq("student_id", student.id)
      .eq("misconception_tag_id", tag.id)
      .order("attempted_at", { ascending: false })
      .limit(30);
    if (error) console.error("drill:", error.message);
    setDrillRows((data ?? []) as unknown as DrillResponse[]);
    setDrillLoading(false);
  }, []);

  /* ---------- derived ---------- */
  const flaggedStudents = useMemo(
    () => new Set([...cells.keys()].map((k) => k.split(":")[0])).size,
    [cells]
  );
  const highFlags = useMemo(
    () => [...cells.values()].filter((c) => c.level === "high").length,
    [cells]
  );
  const mediumFlags = useMemo(
    () => [...cells.values()].filter((c) => c.level === "medium").length,
    [cells]
  );

  const chartData = useMemo(
    () =>
      tags
        .map((tag) => {
          const row = { tag: tag.tag_code, low: 0, medium: 0, high: 0 };
          for (const s of students) {
            const c = cells.get(`${s.id}:${tag.id}`);
            if (c) row[c.level] += 1;
          }
          return row;
        })
        .filter((r) => r.low + r.medium + r.high > 0),
    [tags, students, cells]
  );

  if (classroomLoading || loading) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-8 lg:px-10">
        <PageLoading label="Assembling the class heatmap" />
      </div>
    );
  }

  if (!selected) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-8 lg:px-10">
        <EmptyState
          icon={<Grid3x3 className="h-8 w-8" strokeWidth={1.4} />}
          title="No classroom yet"
          body="Create a classroom from the Roster & Credentials tab, then this dashboard becomes a live misconception heatmap."
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-8 lg:px-10">
      <PageHeader
        kicker={selected.name}
        title="Misconception heatmap"
        sub={`One row per student, one column per misconception pattern in ${selected.subject}. Colour depth is the engine's confidence — a single miss only ever appears as the palest cell.`}
      />

      {/* Stats */}
      <div className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Roster" value={students.length} foot="students with seats" icon={<Users className="h-4 w-4" />} />
        <StatTile label="Flagged" value={flaggedStudents} foot="students with ≥1 pattern" icon={<Grid3x3 className="h-4 w-4" />} />
        <StatTile label="Follow-ups live" value={mediumFlags} foot="medium-confidence cells" icon={<MessagesSquare className="h-4 w-4" />} />
        <StatTile label="High confidence" value={highFlags} foot="students seeing remediation" icon={<Flame className="h-4 w-4" />} />
      </div>

      {students.length === 0 ? (
        <EmptyState
          icon={<Users className="h-8 w-8" strokeWidth={1.4} />}
          title="No students have joined yet"
          body="Issue login codes from Roster & Credentials. As students practise, their misconception evidence will surface here."
        />
      ) : (
        <>
          {/* Heatmap */}
          <section className="surface mb-8 overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3.5">
              <div className="flex items-center gap-3">
                <h2 className="font-display text-[16px] font-semibold text-ink-900">
                  {selected.name} · {selected.subject}
                </h2>
                <span
                  title={
                    liveOn
                      ? "Streaming updates from confidence_scores in real time."
                      : "Realtime is connecting. Enable Realtime for the confidence_scores table in Supabase if this persists."
                  }
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.1em]",
                    liveOn
                      ? "border-pine-100 bg-pine-50 text-pine-700"
                      : "border-line bg-paper text-ink-400"
                  )}
                >
                  <span
                    className={cn(
                      "h-1.5 w-1.5 rounded-full",
                      liveOn ? "bg-pine-600 animate-pulse-ring" : "bg-ink-300"
                    )}
                  />
                  {liveOn ? "Live" : "Connecting"}
                </span>
                {liveAt && (
                  <span className="text-[11px] text-ink-300">
                    updated {liveAt.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", second: "2-digit" })}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-4 text-[11.5px] font-medium text-ink-400">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-3 w-3 rounded-[3px] border border-line-strong bg-paper" /> None
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-3 w-3 rounded-[3px] bg-brass-200" /> Low
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-3 w-3 rounded-[3px] bg-brass-500" /> Medium
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-3 w-3 rounded-[3px] bg-alert-600" /> High
                </span>
              </div>
            </div>

            {tags.length === 0 ? (
              <p className="px-5 py-10 text-center text-[13px] text-ink-400">
                No misconception tags are seeded for this subject yet.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <div className="inline-block min-w-full px-5 pb-5 pt-4">
                  {/* Column headers */}
                  <div
                    className="grid items-end gap-1.5"
                    style={{ gridTemplateColumns: `200px repeat(${tags.length}, minmax(38px, 1fr))` }}
                  >
                    <div />
                    {tags.map((tag) => (
                      <div key={tag.id} className="flex h-28 items-end justify-center" title={`${tag.tag_code} — ${tag.label} (${tag.chapterName})`}>
                        <span
                          className="text-[10.5px] font-semibold tracking-wide text-ink-400"
                          style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
                        >
                          {tag.tag_code}
                        </span>
                      </div>
                    ))}

                    {/* Rows */}
                    {students.map((student) => (
                      <div key={student.id} className="contents">
                        <div className="flex h-10 items-center pr-4">
                          <p className="truncate text-[13px] font-medium text-ink-800">{student.name}</p>
                        </div>
                        {tags.map((tag) => {
                          const cell = cells.get(`${student.id}:${tag.id}`);
                          return (
                            <button
                              key={tag.id}
                              onClick={() => cell && openDrill(student, tag)}
                              disabled={!cell}
                              title={
                                cell
                                  ? `${student.name} × ${tag.label} — ${cell.level} (${cell.repeat} misses). Click for history.`
                                  : `${student.name} × ${tag.tag_code} — no evidence`
                              }
                              className={cn(
                                "flex h-10 items-center justify-center rounded-[4px] border text-[11px] font-semibold transition-all duration-150",
                                cell
                                  ? cn("border-transparent hover:ring-2 hover:ring-ink-900/25", LEVEL_STYLE[cell.level])
                                  : "border-dashed border-line bg-paper/60"
                              )}
                            >
                              {cell && cell.repeat > 1 ? cell.repeat : ""}
                            </button>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* Pressure chart */}
          <section className="surface">
            <div className="border-b border-line px-5 py-3.5">
              <h2 className="font-display text-[16px] font-semibold text-ink-900">
                Where the class is under pressure
              </h2>
              <p className="mt-0.5 text-[12.5px] text-ink-400">
                Students per misconception tag, stacked by engine confidence.
              </p>
            </div>
            <div className="px-3 py-4">
              {chartData.length === 0 ? (
                <p className="px-2 py-8 text-center text-[13px] text-ink-400">
                  No misconception evidence yet — cells will appear after the first practice sessions.
                </p>
              ) : (
                <ResponsiveContainer width="100%" height={Math.max(220, chartData.length * 52)}>
                  <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2dccb" horizontal={false} />
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: "#848ca8" }} axisLine={{ stroke: "#e2dccb" }} tickLine={false} />
                    <YAxis
                      type="category"
                      dataKey="tag"
                      width={86}
                      tick={{ fontSize: 11.5, fill: "#3a4470", fontWeight: 600, fontFamily: "monospace" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      cursor={{ fill: "rgba(27,35,66,0.04)" }}
                      contentStyle={{
                        background: "#fbf9f3",
                        border: "1px solid #e2dccb",
                        borderRadius: 8,
                        fontSize: 12.5,
                        boxShadow: "0 8px 24px -12px rgba(23,28,51,0.3)",
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                    <Bar dataKey="low" name="Low (1 miss)" stackId="a" fill="#ddbb7e" radius={[0, 0, 0, 0]} barSize={16} />
                    <Bar dataKey="medium" name="Medium (2–3)" stackId="a" fill="#bd7f22" barSize={16} />
                    <Bar dataKey="high" name="High (4+)" stackId="a" fill="#a92b22" radius={[0, 3, 3, 0]} barSize={16} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </section>
        </>
      )}

      {/* Drill drawer */}
      {drill && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-ink-950/45 backdrop-blur-[2px] animate-fade" onClick={() => setDrill(null)} />
          <aside className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col border-l border-line bg-cream shadow-pop animate-rise">
            <div className="border-b border-line px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="label-caps mb-1">Response history</p>
                  <h3 className="font-display text-[17px] font-semibold leading-snug text-ink-900">
                    {drill.student.name}
                  </h3>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Badge tone="alert">{drill.tag.tag_code}</Badge>
                    <span className="text-[12.5px] font-medium text-ink-600">{drill.tag.label}</span>
                  </div>
                  {drill.tag.description && (
                    <p className="mt-2 text-[12.5px] leading-relaxed text-ink-400">{drill.tag.description}</p>
                  )}
                </div>
                <button
                  onClick={() => setDrill(null)}
                  className="rounded-md p-1.5 text-ink-400 hover:bg-ink-100/60 hover:text-ink-800"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {drillLoading ? (
                <PageLoading label="Fetching responses" />
              ) : drillRows.length === 0 ? (
                <p className="py-8 text-center text-[13px] text-ink-400">No recorded responses for this pair.</p>
              ) : (
                <ol className="space-y-3">
                  {drillRows.map((row, i) => (
                    <li key={row.id ?? i} className="rounded-md border border-line bg-paper p-3.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-300">
                          {formatDateTime(row.attempted_at)}
                        </span>
                        {row.questions && (
                          <Badge tone={row.questions.difficulty === 3 ? "alert" : row.questions.difficulty === 2 ? "brass" : "ink"}>
                            {difficultyLabel(row.questions.difficulty)}
                          </Badge>
                        )}
                      </div>
                      <p className="mt-2 text-[13.5px] font-medium leading-snug text-ink-800">
                        {row.questions?.question_text ?? "Question"}
                      </p>
                      <p className="mt-1.5 text-[12.5px] text-ink-400">
                        Chose: <span className="font-semibold text-alert-600">{row.options?.option_text ?? "—"}</span>
                        <span className="text-ink-300"> · {timeAgo(row.attempted_at)}</span>
                      </p>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
