import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, CircleAlert, Circle, Save, Trash2, TriangleAlert } from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import { slugifyTagCode } from "../../lib/utils";
import type { Chapter, HydratedQuestion, MisconceptionTag, Subject } from "../../lib/types";
import { Button, Field, Input, Modal, Select, Spinner, Textarea } from "../../components/ui";

const NEW_CHAPTER = "__new_chapter__";
const NEW_TAG = "__new_tag__";
const NO_TAG = "";

interface DraftOption {
  /** Existing options row id, when editing. */
  id?: string;
  text: string;
  isCorrect: boolean;
  /** Existing tag id, NEW_TAG, or "" for none. */
  tagChoice: string;
  newTagLabel: string;
}

const blankOptions = (): DraftOption[] =>
  Array.from({ length: 4 }, () => ({ text: "", isCorrect: false, tagChoice: NO_TAG, newTagLabel: "" }));

export interface QuestionEditorProps {
  open: boolean;
  onClose: () => void;
  /** Null = create mode. */
  question: HydratedQuestion | null;
  subjects: Subject[];
  /** Chapter the bank is currently filtered to — used as the default. */
  defaultSubjectId: string;
  defaultChapterId: string;
  onSaved: (result: { text: string; action: "created" | "updated" | "deleted" }) => void;
}

export default function QuestionEditor({
  open,
  onClose,
  question,
  subjects,
  defaultSubjectId,
  defaultChapterId,
  onSaved,
}: QuestionEditorProps) {
  const [subjectId, setSubjectId] = useState(defaultSubjectId);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [chapterChoice, setChapterChoice] = useState(defaultChapterId);
  const [newChapterName, setNewChapterName] = useState("");
  const [questionText, setQuestionText] = useState("");
  const [difficulty, setDifficulty] = useState(1);
  const [options, setOptions] = useState<DraftOption[]>(blankOptions);
  const [tags, setTags] = useState<MisconceptionTag[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const isEdit = !!question;

  /* Hydrate the form whenever it opens */
  useEffect(() => {
    if (!open) return;
    setError(null);
    setShowErrors(false);
    setConfirmDelete(false);
    if (question) {
      setQuestionText(question.question_text);
      setDifficulty(question.difficulty);
      setChapterChoice(question.chapter_id);
      setOptions(
        question.options.slice(0, 4).map((o) => ({
          id: o.id,
          text: o.option_text,
          isCorrect: o.is_correct,
          tagChoice: o.misconception_tag_id ?? NO_TAG,
          newTagLabel: "",
        }))
      );
    } else {
      setQuestionText("");
      setDifficulty(1);
      setSubjectId(defaultSubjectId);
      setChapterChoice(defaultChapterId);
      setNewChapterName("");
      setOptions(blankOptions());
    }
  }, [open, question, defaultSubjectId, defaultChapterId]);

  /* Resolve the subject that owns the question being edited */
  useEffect(() => {
    if (!open || !question) return;
    (async () => {
      const { data } = await supabase
        .from("chapters")
        .select("subject_id")
        .eq("id", question.chapter_id)
        .maybeSingle();
      if (data?.subject_id) setSubjectId(data.subject_id as string);
    })();
  }, [open, question]);

  /* Chapters for the chosen subject */
  useEffect(() => {
    if (!subjectId) return;
    (async () => {
      const { data, error: err } = await supabase
        .from("chapters")
        .select("*")
        .eq("subject_id", subjectId)
        .order("name");
      if (err) {
        console.error("[Tattva Bodh] chapters fetch failed:", err);
        return;
      }
      setChapters((data ?? []) as Chapter[]);
    })();
  }, [subjectId]);

  /* Misconception tags scoped to the chosen chapter */
  useEffect(() => {
    if (!chapterChoice || chapterChoice === NEW_CHAPTER) {
      setTags([]);
      return;
    }
    (async () => {
      const { data, error: err } = await supabase
        .from("misconception_tags")
        .select("*")
        .eq("chapter_id", chapterChoice)
        .order("label");
      if (err) {
        console.error("[Tattva Bodh] tags fetch failed:", err);
        return;
      }
      setTags((data ?? []) as MisconceptionTag[]);
    })();
  }, [chapterChoice]);

  const chapterName = useMemo(
    () =>
      chapterChoice === NEW_CHAPTER
        ? newChapterName
        : (chapters.find((c) => c.id === chapterChoice)?.name ?? ""),
    [chapterChoice, chapters, newChapterName]
  );

  const setOption = (i: number, patch: Partial<DraftOption>) =>
    setOptions((prev) => prev.map((o, idx) => (idx === i ? { ...o, ...patch } : o)));

  /** Exactly one correct answer — selecting one clears the others. */
  const markCorrect = (i: number) =>
    setOptions((prev) =>
      prev.map((o, idx) =>
        idx === i
          ? { ...o, isCorrect: true, tagChoice: NO_TAG, newTagLabel: "" }
          : { ...o, isCorrect: false }
      )
    );

  /* ---- Field-level validation, rendered next to each field ---- */
  const [showErrors, setShowErrors] = useState(false);

  const fieldErrors = useMemo(() => {
    const optionErrors: (string | null)[] = [null, null, null, null];
    let question: string | null = null;
    let chapter: string | null = null;
    let correct: string | null = null;

    if (!questionText.trim()) question = "Write the question text.";
    if (!chapterChoice) chapter = "Choose a chapter.";
    else if (chapterChoice === NEW_CHAPTER && !newChapterName.trim())
      chapter = "Name the new chapter.";

    options.forEach((o, i) => {
      if (!o.text.trim()) {
        optionErrors[i] = "This option needs text.";
      } else if (!o.isCorrect) {
        if (o.tagChoice === NO_TAG)
          optionErrors[i] = "Pick or create a misconception tag for this wrong answer.";
        else if (o.tagChoice === NEW_TAG && !o.newTagLabel.trim())
          optionErrors[i] = "Name the new tag.";
      }
    });

    const correctCount = options.filter((o) => o.isCorrect).length;
    if (correctCount === 0) correct = "Mark one option as the correct answer.";
    else if (correctCount > 1)
      correct = `Only one option can be correct — ${correctCount} are marked right now.`;

    return { question, chapter, correct, optionErrors };
  }, [questionText, chapterChoice, newChapterName, options]);

  const hasErrors =
    !!fieldErrors.question ||
    !!fieldErrors.chapter ||
    !!fieldErrors.correct ||
    fieldErrors.optionErrors.some(Boolean);

  const save = async () => {
    setShowErrors(true); // reveal field-level errors on the first attempt
    if (hasErrors) return;
    setError(null);
    setBusy(true);
    try {
      /* 1. Resolve the chapter (creating it when asked). */
      let chapterId = chapterChoice;
      if (chapterChoice === NEW_CHAPTER) {
        const { data, error: chErr } = await supabase
          .from("chapters")
          .insert({ subject_id: subjectId, name: newChapterName.trim() })
          .select("*")
          .single();
        if (chErr) throw chErr;
        chapterId = (data as Chapter).id;
        console.debug(`[Tattva Bodh] chapter created: ${chapterId}`);
      }

      /* 2. Resolve misconception tags for the three distractors. */
      const resolvedTagIds: (string | null)[] = [];
      for (const o of options) {
        if (o.isCorrect) {
          resolvedTagIds.push(null); // correct option carries no tag, per schema
          continue;
        }
        if (o.tagChoice === NEW_TAG) {
          const label = o.newTagLabel.trim();
          const tagCode = slugifyTagCode(chapterName, label);
          // Reuse an identical tag_code if one already exists (unique column).
          const { data: existing } = await supabase
            .from("misconception_tags")
            .select("id")
            .eq("tag_code", tagCode)
            .maybeSingle();
          if (existing?.id) {
            resolvedTagIds.push(existing.id as string);
          } else {
            const { data: created, error: tagErr } = await supabase
              .from("misconception_tags")
              .insert({
                chapter_id: chapterId,
                tag_code: tagCode,
                label,
                description: `Student reasoning pattern: ${label}.`,
              })
              .select("id")
              .single();
            if (tagErr) throw tagErr;
            resolvedTagIds.push(created.id as string);
            console.debug(`[Tattva Bodh] misconception tag created: ${tagCode}`);
          }
        } else {
          resolvedTagIds.push(o.tagChoice || null);
        }
      }

      /* 3. Insert or update the question. */
      let questionId: string;
      if (isEdit && question) {
        const { error: qErr } = await supabase
          .from("questions")
          .update({
            chapter_id: chapterId,
            question_text: questionText.trim(),
            difficulty,
          })
          .eq("id", question.id);
        if (qErr) throw qErr;
        questionId = question.id;
      } else {
        const { data, error: qErr } = await supabase
          .from("questions")
          .insert({
            chapter_id: chapterId,
            question_text: questionText.trim(),
            difficulty,
          })
          .select("id")
          .single();
        if (qErr) throw qErr;
        questionId = data.id as string;
      }

      /* 4. Write the four options — update in place when editing. */
      for (let i = 0; i < options.length; i++) {
        const o = options[i];
        const payload = {
          question_id: questionId,
          option_text: o.text.trim(),
          is_correct: o.isCorrect,
          misconception_tag_id: resolvedTagIds[i],
        };
        if (o.id) {
          const { error: oErr } = await supabase.from("options").update(payload).eq("id", o.id);
          if (oErr) throw oErr;
        } else {
          const { error: oErr } = await supabase.from("options").insert(payload);
          if (oErr) throw oErr;
        }
      }

      onSaved({ text: questionText.trim(), action: isEdit ? "updated" : "created" });
      onClose();
    } catch (err) {
      console.error("[Tattva Bodh] question save failed:", err);
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!question) return;
    setDeleting(true);
    setError(null);
    try {
      const { error: oErr } = await supabase.from("options").delete().eq("question_id", question.id);
      if (oErr) console.error("[Tattva Bodh] option cleanup failed:", oErr);
      const { error: qErr } = await supabase.from("questions").delete().eq("id", question.id);
      if (qErr) throw qErr;
      onSaved({ text: question.question_text, action: "deleted" });
      onClose();
    } catch (err) {
      console.error("[Tattva Bodh] question delete failed:", err);
      setError(
        `${(err as Error).message}. Questions that students have already answered may not be deletable.`
      );
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? "Edit question" : "New question"}
      width="max-w-3xl"
    >
      <div className="space-y-5">
        {/* Placement */}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Subject">
            <Select
              value={subjectId}
              onChange={(e) => {
                setSubjectId(e.target.value);
                setChapterChoice("");
              }}
            >
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Chapter">
            <>
              <Select value={chapterChoice} onChange={(e) => setChapterChoice(e.target.value)}>
                <option value="">Choose a chapter…</option>
                {chapters.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
                <option value={NEW_CHAPTER}>+ Create a new chapter…</option>
              </Select>
              {showErrors && fieldErrors.chapter && (
                <span className="mt-1.5 block text-[12px] font-medium text-alert-600">
                  {fieldErrors.chapter}
                </span>
              )}
            </>
          </Field>
        </div>

        {chapterChoice === NEW_CHAPTER && (
          <Field label="New chapter name">
            <Input
              value={newChapterName}
              onChange={(e) => setNewChapterName(e.target.value)}
              placeholder="e.g. Surface Areas and Volumes"
            />
          </Field>
        )}

        <Field label="Question">
          <>
            <Textarea
              value={questionText}
              onChange={(e) => setQuestionText(e.target.value)}
              placeholder="Write the question exactly as a student should read it…"
              className="min-h-[90px]"
            />
            {showErrors && fieldErrors.question && (
              <span className="mt-1.5 block text-[12px] font-medium text-alert-600">
                {fieldErrors.question}
              </span>
            )}
          </>
        </Field>

        <Field label="Difficulty">
          <div className="flex overflow-hidden rounded-md border border-line-strong">
            {[
              { v: 1, l: "Easy" },
              { v: 2, l: "Medium" },
              { v: 3, l: "Hard" },
            ].map((d) => (
              <button
                key={d.v}
                type="button"
                onClick={() => setDifficulty(d.v)}
                className={`flex-1 px-4 py-2.5 text-[12.5px] font-semibold transition-colors duration-150 ${
                  difficulty === d.v ? "bg-ink-900 text-cream" : "bg-white/60 text-ink-500 hover:bg-cream"
                }`}
              >
                {d.l}
              </button>
            ))}
          </div>
        </Field>

        {/* Options */}
        <div>
          <p className="label-caps mb-1.5">Answer options</p>
          <p className="mb-3 text-[12px] leading-relaxed text-ink-400">
            Mark exactly one option correct. Each wrong option should carry the misconception it
            reveals — that tagging is what makes diagnosis deterministic.
          </p>
          {showErrors && fieldErrors.correct && (
            <p className="mb-3 flex items-center gap-1.5 text-[12px] font-medium text-alert-600">
              <CircleAlert className="h-3.5 w-3.5" /> {fieldErrors.correct}
            </p>
          )}
          <div className="space-y-3">
            {options.map((o, i) => (
              <div
                key={i}
                className={`rounded-md border p-3.5 transition-colors duration-150 ${
                  o.isCorrect ? "border-pine-500 bg-pine-50" : "border-line bg-paper/60"
                }`}
              >
                <div className="flex items-start gap-3">
                  <button
                    type="button"
                    onClick={() => markCorrect(i)}
                    title="Mark as the correct answer"
                    className="mt-2 shrink-0"
                  >
                    {o.isCorrect ? (
                      <CheckCircle2 className="h-5 w-5 text-pine-600" />
                    ) : (
                      <Circle className="h-5 w-5 text-ink-300 transition-colors hover:text-ink-500" />
                    )}
                  </button>
                  <div className="min-w-0 flex-1 space-y-2.5">
                    <Input
                      value={o.text}
                      onChange={(e) => setOption(i, { text: e.target.value })}
                      placeholder={`Option ${String.fromCharCode(65 + i)}`}
                    />
                    {o.isCorrect ? (
                      <p className="text-[12px] font-medium text-pine-700">
                        Correct answer — no misconception tag is stored for this option.
                      </p>
                    ) : (
                      <>
                        <div className="space-y-2">
                          <Select
                            value={o.tagChoice}
                            onChange={(e) => setOption(i, { tagChoice: e.target.value })}
                            className="text-[13px]"
                          >
                            <option value={NO_TAG}>No misconception tag</option>
                            {tags.map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.tag_code} · {t.label}
                              </option>
                            ))}
                            <option value={NEW_TAG}>+ Create a new tag…</option>
                          </Select>
                          {o.tagChoice === NEW_TAG && (
                            <div>
                              <Input
                                value={o.newTagLabel}
                                onChange={(e) => setOption(i, { newTagLabel: e.target.value })}
                                placeholder="e.g. Confuses area with perimeter"
                                className="text-[13px]"
                              />
                              {o.newTagLabel.trim() && chapterName && (
                                <p className="mt-1.5 font-mono text-[11px] text-ink-400">
                                  tag_code → {slugifyTagCode(chapterName, o.newTagLabel)}
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                        {showErrors && fieldErrors.optionErrors[i] && (
                          <p className="text-[12px] font-medium text-alert-600">
                            {fieldErrors.optionErrors[i]}
                          </p>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {error && (
          <p className="flex items-start gap-2 rounded-md border border-alert-100 bg-alert-50 px-3 py-2.5 text-[13px] text-alert-700">
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" /> {error}
          </p>
        )}

        {confirmDelete && (
          <div className="rounded-md border border-alert-100 bg-alert-50 px-3.5 py-3">
            <p className="flex items-start gap-2 text-[13px] text-alert-700">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              Delete this question and its four options permanently?
            </p>
            <div className="mt-3 flex gap-2">
              <Button size="sm" variant="danger" onClick={remove} disabled={deleting}>
                {deleting ? <Spinner className="border-ink-400 border-t-cream" /> : "Yes, delete"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Sticky footer — the save action is always visible, even when the
            form scrolls. */}
        <div className="sticky bottom-0 -mx-5 -mb-4 flex items-center justify-between gap-2 border-t border-line bg-cream px-5 py-3.5 shadow-[0_-10px_24px_-18px_rgba(23,28,51,0.4)]">
          {isEdit && !confirmDelete ? (
            <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(true)} className="text-alert-600 hover:bg-alert-50">
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button variant="accent" onClick={save} disabled={busy}>
              {busy ? <Spinner className="border-ink-400 border-t-cream" /> : <Save className="h-4 w-4" />}
              {busy ? "Saving…" : isEdit ? "Update question" : "Save question"}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
