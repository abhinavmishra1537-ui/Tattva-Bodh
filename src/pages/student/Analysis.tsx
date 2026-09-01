import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BookMarked, CheckCircle2, Leaf, ListChecks, Sprout, Sunrise } from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../contexts/AuthContext";
import { pct } from "../../lib/utils";
import { EmptyState, PageHeader, PageLoading, StatTile } from "../../components/ui";

/* ------------------------------------------------------------------ */
/* Student-facing progress. Never shows misconception codes or labels. */
/* ------------------------------------------------------------------ */

type ChapterStatus = "fresh" | "steady" | "practice" | "revisit";

interface ChapterRow {
  chapter: string;
  subject: string;
  attempts: number;
  correct: number;
  accuracy: number;
  status: ChapterStatus;
}

const STATUS_META: Record<
  ChapterStatus,
  { label: string; hint: string; chip: string; dot: string; icon: typeof Leaf }
> = {
  steady: {
    label: "Steady",
    hint: "You're consistent here. Keep revisiting occasionally.",
    chip: "bg-pine-100 text-pine-700 border-pine-100",
    dot: "#28724c",
    icon: Leaf,
  },
  practice: {
    label: "Needs practice",
    hint: "Nearly there — another quiet set or two will settle it.",
    chip: "bg-brass-100 text-brass-700 border-brass-200",
    dot: "#bd7f22",
    icon: Sprout,
  },
  revisit: {
    label: "Let's revisit together",
    hint: "This one's being stubborn. Try a set slowly, and ask your teacher if something feels unclear.",
    chip: "bg-alert-100 text-alert-700 border-alert-100",
    dot: "#a92b22",
    icon: Sunrise,
  },
  fresh: {
    label: "Just getting started",
    hint: "Too early to say — a few more questions will paint the picture.",
    chip: "bg-ink-100 text-ink-600 border-ink-200",
    dot: "#848ca8",
    icon: BookMarked,
  },
};

interface ResponseRow {
  is_correct: boolean;
  questions: {
    chapter_id: string;
    chapters: { name: string; subjects: { name: string } | null } | null;
  } | null;
}

interface ScoreRow {
  confidence_level: "low" | "medium" | "high";
  misconception_tags: { chapters: { name: string } | null } | null;
}

export default function StudentAnalysis() {
  const { profile } = useAuth();
  const [rows, setRows] = useState<ChapterRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);

    const [{ data: responses, error: rErr }, { data: scores, error: sErr }] = await Promise.all([
      supabase
        .from("student_responses")
        .select("is_correct, questions(chapter_id, chapters(name, subjects(name)))")
        .eq("student_id", profile.id)
        .limit(2000),
      supabase
        .from("confidence_scores")
        .select("confidence_level, misconception_tags(chapters(name))")
        .eq("student_id", profile.id),
    ]);
    if (rErr) console.error("analysis responses:", rErr.message);
    if (sErr) console.error("analysis scores:", sErr.message);

    /* Aggregate attempts per chapter */
    const byChapter = new Map<string, ChapterRow>();
    for (const r of (responses ?? []) as unknown as ResponseRow[]) {
      const chapterName = r.questions?.chapters?.name ?? "General";
      const subjectName = r.questions?.chapters?.subjects?.name ?? "";
      const key = `${subjectName}::${chapterName}`;
      const row =
        byChapter.get(key) ??
        ({ chapter: chapterName, subject: subjectName, attempts: 0, correct: 0, accuracy: 0, status: "fresh" } as ChapterRow);
      row.attempts += 1;
      if (r.is_correct) row.correct += 1;
      byChapter.set(key, row);
    }

    /* Severity per chapter from confidence engine (names only — never codes) */
    const severity = new Map<string, number>(); // chapter key -> max severity 1..3
    for (const s of (scores ?? []) as unknown as ScoreRow[]) {
      const chapterName = s.misconception_tags?.chapters?.name;
      if (!chapterName) continue;
      const sev = s.confidence_level === "high" ? 3 : s.confidence_level === "medium" ? 2 : 1;
      for (const key of byChapter.keys()) {
        if (key.endsWith(`::${chapterName}`)) {
          severity.set(key, Math.max(severity.get(key) ?? 0, sev));
        }
      }
    }

    const merged = [...byChapter.entries()].map(([key, row]) => {
      const accuracy = pct(row.correct, row.attempts);
      const sev = severity.get(key) ?? 0;
      let status: ChapterStatus;
      if (row.attempts < 4) status = "fresh";
      else if (sev === 3 || accuracy < 55) status = "revisit";
      else if (sev === 2 || accuracy < 80) status = "practice";
      else status = "steady";
      return { ...row, accuracy, status };
    });

    merged.sort((a, b) => {
      const order: Record<ChapterStatus, number> = { revisit: 0, practice: 1, fresh: 2, steady: 3 };
      return order[a.status] - order[b.status] || b.attempts - a.attempts;
    });

    setRows(merged);
    setLoading(false);
  }, [profile]);

  useEffect(() => {
    load();
  }, [load]);

  const totals = useMemo(() => {
    const attempts = rows.reduce((n, r) => n + r.attempts, 0);
    const correct = rows.reduce((n, r) => n + r.correct, 0);
    const steady = rows.filter((r) => r.status === "steady").length;
    return { attempts, correct, steady, accuracy: pct(correct, attempts) };
  }, [rows]);

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-8 lg:px-10">
        <PageLoading label="Reading your progress" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-8 lg:px-10">
      <PageHeader
        kicker="My Analysis"
        title="How you're growing"
        sub="A plain-words mirror of your practice — what feels steady, what needs a little more time. Your teacher sees the detail; you see the direction."
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={<ListChecks className="h-8 w-8" strokeWidth={1.4} />}
          title="No practice logged yet"
          body="Finish your first practice set and this page becomes your personal progress map."
        />
      ) : (
        <>
          <div className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-3">
            <StatTile label="Questions practised" value={totals.attempts} icon={<ListChecks className="h-4 w-4" />} />
            <StatTile label="Overall accuracy" value={`${totals.accuracy}%`} icon={<CheckCircle2 className="h-4 w-4" />} />
            <StatTile label="Chapters steady" value={totals.steady} foot={`of ${rows.length} touched`} icon={<Leaf className="h-4 w-4" />} />
          </div>

          {/* Accuracy chart */}
          <section className="surface mb-8">
            <div className="border-b border-line px-5 py-3.5">
              <h2 className="font-display text-[16px] font-semibold text-ink-900">Accuracy by chapter</h2>
              <p className="mt-0.5 text-[12.5px] text-ink-400">
                Colour shows how each chapter is feeling right now.
              </p>
            </div>
            <div className="px-3 py-4">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={rows} margin={{ top: 8, right: 16, bottom: 4, left: -16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2dccb" vertical={false} />
                  <XAxis
                    dataKey="chapter"
                    tick={{ fontSize: 10.5, fill: "#606a8e" }}
                    axisLine={{ stroke: "#e2dccb" }}
                    tickLine={false}
                    interval={0}
                    angle={-18}
                    textAnchor="end"
                    height={56}
                    tickFormatter={(v: string) => (v.length > 14 ? `${v.slice(0, 13)}…` : v)}
                  />
                  <YAxis
                    domain={[0, 100]}
                    tick={{ fontSize: 11, fill: "#848ca8" }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v: number) => `${v}%`}
                  />
                  <Tooltip
                    cursor={{ fill: "rgba(27,35,66,0.04)" }}
                    formatter={(value) => [`${value ?? 0}%`, "Accuracy"]}
                    contentStyle={{
                      background: "#fbf9f3",
                      border: "1px solid #e2dccb",
                      borderRadius: 8,
                      fontSize: 12.5,
                    }}
                  />
                  <Bar dataKey="accuracy" radius={[4, 4, 0, 0]} barSize={30}>
                    {rows.map((r) => (
                      <Cell key={r.chapter + r.subject} fill={STATUS_META[r.status].dot} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          {/* Chapter cards */}
          <div className="grid gap-3 sm:grid-cols-2">
            {rows.map((r) => {
              const meta = STATUS_META[r.status];
              const Icon = meta.icon;
              return (
                <div key={r.chapter + r.subject} className="surface p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="label-caps">{r.subject || "Chapter"}</p>
                      <h3 className="mt-1 font-display text-[16.5px] font-semibold leading-snug text-ink-900">
                        {r.chapter}
                      </h3>
                    </div>
                    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] ${meta.chip}`}>
                      <Icon className="h-3 w-3" />
                      {meta.label}
                    </span>
                  </div>
                  <p className="mt-2 text-[13px] leading-relaxed text-ink-500">{meta.hint}</p>
                  <div className="mt-4 flex items-center gap-3">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-paper-deep">
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{ width: `${r.accuracy}%`, background: meta.dot }}
                      />
                    </div>
                    <span className="text-[12px] font-semibold text-ink-500">
                      {r.correct}/{r.attempts}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
