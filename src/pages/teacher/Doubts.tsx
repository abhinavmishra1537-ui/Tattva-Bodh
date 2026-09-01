import { useCallback, useEffect, useState } from "react";
import { CircleAlert, MessageCircleQuestion, Quote, Send } from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import { useClassrooms } from "../../contexts/ClassroomContext";
import { formatDateTime, timeAgo } from "../../lib/utils";
import type { Doubt } from "../../lib/types";
import { Badge, Button, EmptyState, PageHeader, PageLoading, Spinner, Textarea } from "../../components/ui";

interface DoubtRow extends Doubt {
  studentName: string;
  questionText: string | null;
}

type StatusFilter = "open" | "answered" | "all";

export default function Doubts() {
  const { selected, loading: classroomLoading } = useClassrooms();
  const [doubts, setDoubts] = useState<DoubtRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<StatusFilter>("open");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [replying, setReplying] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!selected) {
      setDoubts([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    let query = supabase
      .from("doubts")
      .select("*, profiles(full_name), questions(question_text)")
      .eq("classroom_id", selected.id)
      .order("created_at", { ascending: false })
      .limit(100);
    if (filter !== "all") query = query.eq("status", filter);
    const { data, error: err } = await query;
    if (err) console.error("doubts:", err.message);
    setDoubts(
      ((data ?? []) as unknown as (Doubt & {
        profiles: { full_name: string } | null;
        questions: { question_text: string } | null;
      })[]).map((d) => ({
        ...d,
        studentName: d.profiles?.full_name ?? "Student",
        questionText: d.questions?.question_text ?? null,
      }))
    );
    setLoading(false);
  }, [selected, filter]);

  useEffect(() => {
    load();
  }, [load]);

  const reply = async (doubt: DoubtRow) => {
    const text = (drafts[doubt.id] ?? "").trim();
    if (!text) return;
    setError(null);
    setReplying(doubt.id);
    try {
      const { error: err } = await supabase
        .from("doubts")
        .update({
          teacher_reply: text,
          status: "answered",
          replied_at: new Date().toISOString(),
        })
        .eq("id", doubt.id);
      if (err) throw err;
      setDrafts((d) => ({ ...d, [doubt.id]: "" }));
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setReplying(null);
    }
  };

  const openCount = doubts.filter((d) => d.status === "open").length;

  return (
    <div className="mx-auto max-w-4xl px-6 py-8 lg:px-10">
      <PageHeader
        kicker={selected?.name ?? "Doubts"}
        title="Doubts inbox"
        sub="Questions students raise mid-practice, with the original question attached for context. Answering a doubt closes the loop — the student sees your reply in their practice flow."
      />

      {/* Filter */}
      <div className="mb-5 inline-flex overflow-hidden rounded-md border border-line-strong">
        {(["open", "answered", "all"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 text-[12.5px] font-semibold capitalize transition-colors duration-150 ${
              filter === f ? "bg-ink-900 text-cream" : "bg-white/60 text-ink-500 hover:bg-cream"
            }`}
          >
            {f === "open" ? `Open${filter === "open" && openCount ? ` (${openCount})` : ""}` : f}
          </button>
        ))}
      </div>

      {error && (
        <p className="mb-4 flex items-start gap-2 rounded-md border border-alert-100 bg-alert-50 px-3.5 py-2.5 text-[13px] text-alert-700">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" /> {error}
        </p>
      )}

      {classroomLoading || loading ? (
        <PageLoading label="Loading doubts" />
      ) : !selected ? (
        <EmptyState
          icon={<MessageCircleQuestion className="h-8 w-8" strokeWidth={1.4} />}
          title="No classroom selected"
          body="Create a classroom first — doubts arrive per classroom."
        />
      ) : doubts.length === 0 ? (
        <EmptyState
          icon={<MessageCircleQuestion className="h-8 w-8" strokeWidth={1.4} />}
          title={filter === "open" ? "Inbox zero" : "Nothing here yet"}
          body={
            filter === "open"
              ? "No open doubts. When a student taps “Ask my teacher” during practice, it lands here with the question attached."
              : "No doubts match this filter."
          }
        />
      ) : (
        <ul className="space-y-4">
          {doubts.map((d) => (
            <li key={d.id} className="surface p-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[14px] font-semibold text-ink-900">{d.studentName}</span>
                <span className="text-[12px] text-ink-300">{timeAgo(d.created_at)}</span>
                <span className="ml-auto">
                  {d.status === "open" ? <Badge tone="brass">Open</Badge> : <Badge tone="pine">Answered</Badge>}
                </span>
              </div>

              <p className="mt-3 text-[14px] leading-relaxed text-ink-800">{d.message}</p>

              {d.questionText && (
                <blockquote className="mt-3 flex gap-2.5 rounded-md border-l-2 border-brass-400 bg-paper px-3.5 py-2.5">
                  <Quote className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brass-500" />
                  <p className="text-[12.5px] italic leading-relaxed text-ink-500">{d.questionText}</p>
                </blockquote>
              )}

              {d.status === "answered" && d.teacher_reply ? (
                <div className="mt-3 rounded-md border border-pine-100 bg-pine-50 px-3.5 py-3">
                  <p className="label-caps mb-1 text-pine-700">Your reply · {formatDateTime(d.replied_at)}</p>
                  <p className="text-[13.5px] leading-relaxed text-pine-700">{d.teacher_reply}</p>
                </div>
              ) : (
                <div className="mt-4">
                  <Textarea
                    value={drafts[d.id] ?? ""}
                    onChange={(e) => setDrafts((dr) => ({ ...dr, [d.id]: e.target.value }))}
                    placeholder="Write your reply — keep it encouraging and specific…"
                    className="min-h-[76px]"
                  />
                  <div className="mt-2 flex justify-end">
                    <Button
                      size="sm"
                      disabled={replying === d.id || !(drafts[d.id] ?? "").trim()}
                      onClick={() => reply(d)}
                    >
                      {replying === d.id ? (
                        <Spinner className="border-ink-400 border-t-cream" />
                      ) : (
                        <Send className="h-3.5 w-3.5" />
                      )}
                      Send reply
                    </Button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
