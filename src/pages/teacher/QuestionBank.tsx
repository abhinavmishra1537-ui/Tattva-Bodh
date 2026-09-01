import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Library, Pencil, Plus } from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import { difficultyLabel } from "../../lib/utils";
import type { Chapter, HydratedQuestion, MisconceptionTag, Option, Subject } from "../../lib/types";
import { Badge, Button, EmptyState, PageHeader, PageLoading, Select } from "../../components/ui";
import QuestionEditor from "./QuestionEditor";

const DIFF_FILTERS = [
  { value: 0, label: "All levels" },
  { value: 1, label: "Easy" },
  { value: 2, label: "Medium" },
  { value: 3, label: "Hard" },
];

export default function QuestionBank() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [subjectId, setSubjectId] = useState<string>("");
  const [chapterId, setChapterId] = useState<string>("");
  const [difficulty, setDifficulty] = useState(0);

  const [questions, setQuestions] = useState<HydratedQuestion[]>([]);
  const [tags, setTags] = useState<Map<string, MisconceptionTag>>(new Map());
  const [loading, setLoading] = useState(true);
  const [listLoading, setListLoading] = useState(false);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<HydratedQuestion | null>(null);

  /* Subjects on mount */
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from("subjects").select("*").order("name");
      if (error) console.error("subjects:", error.message);
      const rows = (data ?? []) as Subject[];
      setSubjects(rows);
      if (rows.length > 0) setSubjectId(rows[0].id);
      setLoading(false);
    })();
  }, []);

  /* Chapters when subject changes */
  useEffect(() => {
    if (!subjectId) return;
    (async () => {
      const { data, error } = await supabase
        .from("chapters")
        .select("*")
        .eq("subject_id", subjectId)
        .order("name");
      if (error) console.error("chapters:", error.message);
      const rows = (data ?? []) as Chapter[];
      setChapters(rows);
      setChapterId(rows[0]?.id ?? "");
    })();
  }, [subjectId]);

  /* Questions + options + tags when chapter changes */
  const loadQuestions = useCallback(async () => {
    if (!chapterId) {
      setQuestions([]);
      return;
    }
    setListLoading(true);

    let query = supabase
      .from("questions")
      .select("*")
      .eq("chapter_id", chapterId)
      .order("difficulty", { ascending: true })
      .limit(60);
    if (difficulty > 0) query = query.eq("difficulty", difficulty);

    const [{ data: qs, error: qErr }, { data: tagData, error: tErr }] = await Promise.all([
      query,
      supabase.from("misconception_tags").select("*").eq("chapter_id", chapterId),
    ]);
    if (qErr) console.error("questions:", qErr.message);
    if (tErr) console.error("tags:", tErr.message);

    setTags(new Map(((tagData ?? []) as MisconceptionTag[]).map((t) => [t.id, t])));

    const questionRows = qs ?? [];
    let optionRows: Option[] = [];
    if (questionRows.length > 0) {
      const { data: opts, error: oErr } = await supabase
        .from("options")
        .select("*")
        .in(
          "question_id",
          questionRows.map((q) => q.id)
        );
      if (oErr) console.error("options:", oErr.message);
      optionRows = (opts ?? []) as Option[];
    }

    const byQuestion = new Map<string, Option[]>();
    for (const o of optionRows) {
      byQuestion.set(o.question_id, [...(byQuestion.get(o.question_id) ?? []), o]);
    }
    setQuestions(
      (questionRows as HydratedQuestion[]).map((q) => ({ ...q, options: byQuestion.get(q.id) ?? [] }))
    );
    setListLoading(false);
  }, [chapterId, difficulty]);

  useEffect(() => {
    loadQuestions();
  }, [loadQuestions]);

  const activeChapter = useMemo(
    () => chapters.find((c) => c.id === chapterId),
    [chapters, chapterId]
  );

  return (
    <div className="mx-auto max-w-6xl px-6 py-8 lg:px-10">
      <PageHeader
        kicker="Reference & authoring"
        title="Question bank"
        sub="The pre-verified bank that powers diagnosis. Every distractor is hand-tagged with the misconception it reveals — wrong options are the diagnostic instrument. Click any question to edit it."
        actions={
          <Button
            variant="accent"
            onClick={() => {
              setEditingQuestion(null);
              setEditorOpen(true);
            }}
          >
            <Plus className="h-4 w-4" /> New question
          </Button>
        }
      />

      {/* Filters */}
      <div className="surface mb-6 grid gap-3 p-4 md:grid-cols-[1fr_1fr_auto]">
        <div>
          <p className="label-caps mb-1.5">Subject</p>
          <Select value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <p className="label-caps mb-1.5">Chapter</p>
          <Select value={chapterId} onChange={(e) => setChapterId(e.target.value)}>
            {chapters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <p className="label-caps mb-1.5">Difficulty</p>
          <div className="flex overflow-hidden rounded-md border border-line-strong">
            {DIFF_FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setDifficulty(f.value)}
                className={`px-3.5 py-2.5 text-[12.5px] font-semibold transition-colors duration-150 ${
                  difficulty === f.value
                    ? "bg-ink-900 text-cream"
                    : "bg-white/60 text-ink-500 hover:bg-cream"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* List */}
      {loading || listLoading ? (
        <PageLoading label="Loading questions" />
      ) : questions.length === 0 ? (
        <EmptyState
          icon={<Library className="h-8 w-8" strokeWidth={1.4} />}
          title="No questions match"
          body="Try a different chapter or difficulty filter."
        />
      ) : (
        <div className="space-y-4">
          <p className="text-[12.5px] font-medium text-ink-400">
            {questions.length} question{questions.length === 1 ? "" : "s"}
            {activeChapter ? ` · ${activeChapter.name}` : ""}
            {difficulty > 0 ? ` · ${difficultyLabel(difficulty)}` : ""}
          </p>
          {questions.map((q, qi) => (
            <article
              key={q.id}
              onClick={() => {
                setEditingQuestion(q);
                setEditorOpen(true);
              }}
              className="surface group animate-rise cursor-pointer p-5 transition-shadow duration-150 hover:shadow-lifted"
              style={{ animationDelay: `${Math.min(qi, 8) * 30}ms` }}
            >
              <div className="flex items-start justify-between gap-3">
                <h3 className="flex-1 text-[15px] font-medium leading-relaxed text-ink-900">
                  <span className="mr-2 font-display text-[13px] font-semibold text-ink-300">
                    {String(qi + 1).padStart(2, "0")}
                  </span>
                  {q.question_text}
                </h3>
                <div className="flex shrink-0 items-center gap-2">
                  <Pencil className="h-3.5 w-3.5 text-ink-300 opacity-0 transition-opacity duration-150 group-hover:opacity-100" />
                  <Badge tone={q.difficulty === 3 ? "alert" : q.difficulty === 2 ? "brass" : "ink"}>
                    {difficultyLabel(q.difficulty)}
                  </Badge>
                </div>
              </div>
              <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                {q.options.map((o) => {
                  const tag = o.misconception_tag_id ? tags.get(o.misconception_tag_id) : undefined;
                  return (
                    <li
                      key={o.id}
                      className={`rounded-md border px-3.5 py-2.5 text-[13px] leading-snug ${
                        o.is_correct
                          ? "border-pine-100 bg-pine-50 text-pine-700"
                          : "border-line bg-paper text-ink-600"
                      }`}
                    >
                      <span className="flex items-start gap-2">
                        {o.is_correct && <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
                        <span>{o.option_text}</span>
                      </span>
                      {tag && (
                        <span className="mt-1.5 inline-flex items-center gap-1.5 rounded-full border border-brass-200 bg-brass-50 px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-brass-700">
                          {tag.tag_code} · {tag.label}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </article>
          ))}
        </div>
      )}

      <QuestionEditor
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        question={editingQuestion}
        subjects={subjects}
        defaultSubjectId={subjectId}
        defaultChapterId={chapterId}
        onSaved={loadQuestions}
      />
    </div>
  );
}
