import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  Lightbulb,
  MessageCircleQuestion,
  Play,
  Quote,
  RotateCcw,
  School,
  Send,
  Sparkles,
} from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../contexts/AuthContext";
import { useMyClassrooms } from "../../hooks/useStudent";
import { pickTaggedQuestion, recordAttempt, type DiagnosisOutcome } from "../../lib/diagnosis";
import {
  CODE_LENGTH,
  cn,
  difficultyLabel,
  isValidCodeFormat,
  normalizeCode,
  shuffle,
  timeAgo,
} from "../../lib/utils";
import type { Chapter, HydratedQuestion, MisconceptionTag, Option, Subject } from "../../lib/types";
import { Badge, Button, Field, Input, Modal, PageLoading, Select, Spinner, Textarea } from "../../components/ui";

const SESSION_SIZE = 10;

type Phase = "setup" | "answering" | "feedback" | "summary";

interface SessionStats {
  answered: number;
  correct: number;
}

interface AnsweredReply {
  id: string;
  message: string;
  teacher_reply: string;
  replied_at: string | null;
  questionText: string | null;
}

export default function StudentPractice() {
  const { profile } = useAuth();
  const { classrooms, refresh: refreshMyClassrooms } = useMyClassrooms(profile?.id);

  const [joinCode, setJoinCode] = useState("");
  const [joinBusy, setJoinBusy] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joinNotice, setJoinNotice] = useState<string | null>(null);

  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [subjectId, setSubjectId] = useState("");
  const [chapterId, setChapterId] = useState("");

  const [phase, setPhase] = useState<Phase>("setup");
  const [pool, setPool] = useState<HydratedQuestion[]>([]);
  const [tagsById, setTagsById] = useState<Map<string, MisconceptionTag>>(new Map());
  const [queue, setQueue] = useState<string[]>([]);
  const [pointer, setPointer] = useState(0);
  const [asked, setAsked] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<DiagnosisOutcome | null>(null);
  const [stats, setStats] = useState<SessionStats>({ answered: 0, correct: 0 });
  const [busy, setBusy] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);

  const [askOpen, setAskOpen] = useState(false);
  const [askText, setAskText] = useState("");
  const [askBusy, setAskBusy] = useState(false);

  const [replies, setReplies] = useState<AnsweredReply[]>([]);

  /* Subjects on mount */
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from("subjects").select("*").order("name");
      if (error) setBootError(error.message);
      const rows = (data ?? []) as Subject[];
      setSubjects(rows);
      if (rows[0]) setSubjectId(rows[0].id);
    })();
  }, []);

  /* Chapters for subject */
  useEffect(() => {
    if (!subjectId) return;
    (async () => {
      const { data, error } = await supabase
        .from("chapters")
        .select("*")
        .eq("subject_id", subjectId)
        .order("name");
      if (error) setBootError(error.message);
      const rows = (data ?? []) as Chapter[];
      setChapters(rows);
      setChapterId(rows[0]?.id ?? "");
    })();
  }, [subjectId]);

  /* Teacher replies to this student's earlier doubts */
  const loadReplies = useCallback(async () => {
    if (!profile) return;
    const { data, error } = await supabase
      .from("doubts")
      .select("id, message, teacher_reply, replied_at, questions(question_text)")
      .eq("student_id", profile.id)
      .eq("status", "answered")
      .order("replied_at", { ascending: false })
      .limit(4);
    if (error) {
      console.error("replies:", error.message);
      return;
    }
    setReplies(
      ((data ?? []) as unknown as (Omit<AnsweredReply, "questionText"> & {
        questions: { question_text: string } | null;
      })[]).map((r) => ({ ...r, questionText: r.questions?.question_text ?? null }))
    );
  }, [profile]);

  useEffect(() => {
    loadReplies();
  }, [loadReplies]);

  /* ------------------------- session control ------------------------- */

  const current: HydratedQuestion | null = useMemo(() => {
    if (phase !== "answering" && phase !== "feedback") return null;
    const id = queue[pointer];
    return pool.find((q) => q.id === id) ?? null;
  }, [phase, queue, pointer, pool]);

  const startSession = async () => {
    if (!chapterId) return;
    setBootError(null);
    setBusy(true);
    try {
      const { data: qs, error: qErr } = await supabase
        .from("questions")
        .select("*")
        .eq("chapter_id", chapterId)
        .order("difficulty", { ascending: true })
        .limit(40);
      if (qErr) throw qErr;
      const questionRows = (qs ?? []) as HydratedQuestion[];
      if (questionRows.length === 0) {
        setBootError("This chapter has no questions seeded yet — try another chapter.");
        return;
      }

      const [{ data: opts, error: oErr }, { data: tagRows, error: tErr }] = await Promise.all([
        supabase.from("options").select("*").in("question_id", questionRows.map((q) => q.id)),
        supabase.from("misconception_tags").select("*").eq("chapter_id", chapterId),
      ]);
      if (oErr) throw oErr;
      if (tErr) throw tErr;

      const byQuestion = new Map<string, Option[]>();
      for (const o of (opts ?? []) as Option[]) {
        byQuestion.set(o.question_id, [...(byQuestion.get(o.question_id) ?? []), o]);
      }
      const hydrated = questionRows
        .map((q) => ({ ...q, options: shuffle(byQuestion.get(q.id) ?? []) }))
        .filter((q) => q.options.length > 0);

      /* Difficulty ramp: easy → hard, shuffled within a band */
      const bands = [1, 2, 3].flatMap((d) => shuffle(hydrated.filter((q) => q.difficulty === d)));
      const sessionPool = bands.slice(0, SESSION_SIZE);

      setPool(hydrated);
      setTagsById(new Map(((tagRows ?? []) as MisconceptionTag[]).map((t) => [t.id, t])));
      setQueue(sessionPool.map((q) => q.id));
      setPointer(0);
      setAsked(new Set());
      setSelectedId(null);
      setOutcome(null);
      setStats({ answered: 0, correct: 0 });
      setPhase("answering");
    } catch (err) {
      setBootError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const answer = async (option: Option) => {
    if (!profile || !current || busy) return;
    setBusy(true);
    setSelectedId(option.id);
    try {
      const result = await recordAttempt(profile.id, current.id, option);
      setOutcome(result);
      setAsked((prev) => new Set(prev).add(current.id));
      setStats((s) => ({ answered: s.answered + 1, correct: s.correct + (result.correct ? 1 : 0) }));
      setPhase("feedback");
    } catch (err) {
      setBootError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  /** Where the escalation machine points next: a tagged follow-up/retest, or simply on. */
  const advance = () => {
    let nextQueue = queue;
    if (outcome && !outcome.correct && outcome.misconceptionTagId && outcome.confidenceLevel !== "low") {
      const target = pickTaggedQuestion(pool, outcome.misconceptionTagId, asked);
      if (target && !queue.slice(pointer + 1).includes(target.id)) {
        nextQueue = [...queue.slice(0, pointer + 1), target.id, ...queue.slice(pointer + 1)];
        setQueue(nextQueue);
      }
    }
    if (pointer + 1 >= nextQueue.length) {
      setPhase("summary");
      return;
    }
    setPointer(pointer + 1);
    setSelectedId(null);
    setOutcome(null);
    setPhase("answering");
  };

  const sendDoubt = async () => {
    if (!profile || !current || classrooms.length === 0 || !askText.trim()) return;
    setAskBusy(true);
    try {
      const { error } = await supabase.from("doubts").insert({
        student_id: profile.id,
        classroom_id: classrooms[0].id,
        question_id: current.id,
        message: askText.trim(),
        status: "open",
      });
      if (error) throw error;
      setAskOpen(false);
      setAskText("");
    } catch (err) {
      setBootError((err as Error).message);
    } finally {
      setAskBusy(false);
    }
  };

  /** Join a classroom by its 6-character join_code shared by the teacher. */
  const joinClassroom = async () => {
    if (!profile || joinBusy) return;
    const code = normalizeCode(joinCode);
    if (!isValidCodeFormat(code)) {
      setJoinError(
        `Classroom codes are exactly ${CODE_LENGTH} letters or numbers (for example XJD6K2).`
      );
      return;
    }
    setJoinError(null);
    setJoinNotice(null);
    setJoinBusy(true);
    const LOG = "[Tattva Bodh]";
    try {
      // 1. Look up the classroom by its join code.
      const { data: classroomRow, error: lookupErr } = await supabase
        .from("classrooms")
        .select("id, name, subject, join_code")
        .ilike("join_code", code)
        .maybeSingle();
      if (lookupErr) {
        console.error(`${LOG} classroom lookup by join_code="${code}" failed:`, lookupErr);
        setJoinError("Couldn't verify that code right now — check your connection and try again.");
        return;
      }
      if (!classroomRow) {
        setJoinError(
          "That code doesn't match any classroom. Double-check the spelling with your teacher."
        );
        return;
      }
      console.debug(`${LOG} join_code "${code}" matched classroom ${classroomRow.id} (${classroomRow.name})`);

      // 2. Guard: already enrolled?
      const { data: existing, error: memberErr } = await supabase
        .from("classroom_students")
        .select("id")
        .eq("classroom_id", classroomRow.id)
        .eq("student_id", profile.id)
        .maybeSingle();
      if (memberErr) console.error(`${LOG} membership check failed:`, memberErr);
      if (existing) {
        setJoinNotice(`You're already enrolled in ${classroomRow.name}.`);
        setJoinCode("");
        return;
      }

      // 3. Link the current authenticated student into the classroom.
      const { error: linkErr } = await supabase
        .from("classroom_students")
        .insert({ classroom_id: classroomRow.id, student_id: profile.id });
      if (linkErr) {
        console.error(`${LOG} classroom_students insert failed:`, linkErr);
        setJoinError(`Couldn't join just now (${linkErr.message}). Please try again.`);
        return;
      }
      console.debug(`${LOG} student ${profile.id} enrolled in classroom ${classroomRow.id}`);
      setJoinNotice(`Joined ${classroomRow.name}. Your teacher can now see you on the class heatmap.`);
      setJoinCode("");
      await refreshMyClassrooms();
    } finally {
      setJoinBusy(false);
    }
  };

  /* ------------------------------ views ------------------------------ */

  if (phase === "setup") {
    return (
      <div className="mx-auto max-w-4xl px-6 py-8 lg:px-10">
        <p className="label-caps mb-2 text-brass-600">Practice</p>
        <h1 className="font-display text-[30px] font-semibold tracking-[-0.01em] text-ink-900">
          Choose a chapter, start a set
        </h1>
        <p className="mt-2 max-w-xl text-[14px] leading-relaxed text-ink-500">
          Each set is about ten questions, ramping from easy to hard. Wrong answers are never a
          verdict — they just tell us what to practise next.
        </p>

        {replies.length > 0 && (
          <section className="mt-6 rounded-lg border border-pine-100 bg-pine-50 p-5">
            <p className="label-caps mb-3 text-pine-700">Replies from your teacher</p>
            <ul className="space-y-3">
              {replies.map((r) => (
                <li key={r.id} className="rounded-md border border-pine-100 bg-cream p-3.5">
                  <p className="text-[12.5px] text-ink-400">
                    You asked · {r.replied_at ? timeAgo(r.replied_at) : ""}
                  </p>
                  <p className="mt-1 text-[13px] italic text-ink-500">“{r.message}”</p>
                  <p className="mt-2 text-[13.5px] font-medium leading-relaxed text-pine-700">
                    {r.teacher_reply}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="surface mt-8 p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Subject">
              <Select value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Chapter">
              <Select value={chapterId} onChange={(e) => setChapterId(e.target.value)}>
                {chapters.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          {bootError && (
            <p className="mt-4 flex items-start gap-2 rounded-md border border-alert-100 bg-alert-50 px-3 py-2.5 text-[13px] text-alert-700">
              <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" /> {bootError}
            </p>
          )}
          <div className="mt-6 flex items-center justify-between border-t border-line pt-5">
            <p className="text-[12.5px] text-ink-400">
              {chapters.length === 0 ? "No chapters found for this subject." : "Stuck on a question? Use “Ask my teacher” mid-set."}
            </p>
            <Button variant="accent" onClick={startSession} disabled={busy || !chapterId || chapters.length === 0}>
              {busy ? <Spinner className="border-ink-400 border-t-cream" /> : <Play className="h-4 w-4" />}
              Start practice set
            </Button>
          </div>
        </section>

        {/* Join a classroom by code */}
        <section className="surface mt-6 p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-line bg-paper">
              <School className="h-4 w-4 text-ink-700" strokeWidth={1.7} />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="font-display text-[15.5px] font-semibold text-ink-900">Your classrooms</h2>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {classrooms.length === 0 ? (
                  <p className="text-[12.5px] text-ink-400">
                    You're not enrolled in a classroom yet — ask your teacher for a class code.
                  </p>
                ) : (
                  classrooms.map((c) => (
                    <span
                      key={c.id}
                      className="inline-flex items-center gap-1.5 rounded-full border border-line bg-paper px-2.5 py-1 text-[11.5px] font-semibold text-ink-700"
                    >
                      {c.name}
                      <span className="font-normal text-ink-300">· {c.subject}</span>
                    </span>
                  ))
                )}
              </div>
              <div className="mt-3 flex gap-2">
                <Input
                  value={joinCode}
                  onChange={(e) => {
                    setJoinCode(normalizeCode(e.target.value).slice(0, CODE_LENGTH));
                    setJoinError(null);
                    setJoinNotice(null);
                  }}
                  onKeyDown={(e) => e.key === "Enter" && joinClassroom()}
                  placeholder="Classroom code · e.g. XJD6K2"
                  className="max-w-[240px] font-mono text-[13px] tracking-[0.14em] uppercase"
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                />
                <Button variant="outline" size="sm" onClick={joinClassroom} disabled={joinBusy || !isValidCodeFormat(joinCode)}>
                  {joinBusy ? <Spinner className="h-3.5 w-3.5" /> : "Join"}
                </Button>
              </div>
              {joinError && (
                <p className="mt-2.5 flex items-start gap-1.5 text-[12.5px] leading-snug text-alert-700">
                  <CircleAlert className="mt-px h-3.5 w-3.5 shrink-0" /> {joinError}
                </p>
              )}
              {joinNotice && (
                <p className="mt-2.5 flex items-start gap-1.5 text-[12.5px] leading-snug text-pine-700">
                  <CheckCircle2 className="mt-px h-3.5 w-3.5 shrink-0" /> {joinNotice}
                </p>
              )}
            </div>
          </div>
        </section>
      </div>
    );
  }

  if (phase === "summary") {
    const { answered, correct } = stats;
    const ratio = answered === 0 ? 0 : correct / answered;
    const line =
      ratio >= 0.85
        ? "Strong work. This chapter is looking steady — keep the streak going."
        : ratio >= 0.6
          ? "Good session. A few ideas are still settling — another set will help."
          : "This chapter needs care, and that's exactly what practice is for. Let's revisit it together.";
    return (
      <div className="mx-auto max-w-2xl px-6 py-14 lg:px-10">
        <div className="surface p-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-brass-100">
            <Sparkles className="h-5 w-5 text-brass-700" />
          </div>
          <p className="label-caps mb-2">Set complete</p>
          <h2 className="font-display text-[28px] font-semibold text-ink-900">
            {correct} of {answered} correct
          </h2>
          <p className="mx-auto mt-3 max-w-sm text-[14px] leading-relaxed text-ink-500">{line}</p>
          <div className="mt-7 flex flex-wrap justify-center gap-2">
            <Button variant="accent" onClick={startSession}>
              <RotateCcw className="h-4 w-4" /> Practise again
            </Button>
            <Button variant="outline" onClick={() => setPhase("setup")}>
              Choose another chapter
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!current) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-8 lg:px-10">
        <PageLoading label="Preparing your set" />
      </div>
    );
  }

  const correctOption = current.options.find((o) => o.is_correct);
  const selectedOption = current.options.find((o) => o.id === selectedId);
  const isRemedial = outcome?.confidenceLevel === "high";
  const isFollowup = outcome?.confidenceLevel === "medium";
  const remedialTag =
    outcome?.misconceptionTagId != null ? tagsById.get(outcome.misconceptionTagId) : undefined;
  /** True when the bank can serve a same-concept follow-up/retest next. */
  const followAvailable =
    !!outcome?.misconceptionTagId &&
    !outcome.correct &&
    outcome.confidenceLevel !== "low" &&
    pickTaggedQuestion(pool, outcome.misconceptionTagId, asked) !== null;
  const progress = stats.answered / Math.max(queue.length, 1);

  return (
    <div className="mx-auto max-w-3xl px-6 py-8 lg:px-10">
      {/* Progress */}
      <div className="mb-6">
        <div className="mb-2 flex items-center justify-between text-[12px] font-semibold text-ink-400">
          <span className="uppercase tracking-[0.12em]">
            Question {Math.min(pointer + 1, queue.length)} of {queue.length}
          </span>
          <span>{stats.correct} correct so far</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-paper-deep">
          <div
            className="h-full rounded-full bg-brass-500 transition-all duration-300"
            style={{ width: `${Math.min(100, progress * 100)}%` }}
          />
        </div>
      </div>

      {/* Question card */}
      <article className="surface p-6 md:p-7">
        <div className="flex items-start justify-between gap-3">
          <Badge tone={current.difficulty === 3 ? "alert" : current.difficulty === 2 ? "brass" : "ink"}>
            {difficultyLabel(current.difficulty)}
          </Badge>
          {classrooms.length > 0 && (
            <button
              onClick={() => setAskOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-line-strong px-2.5 py-1.5 text-[12px] font-semibold text-ink-500 transition-colors hover:border-brass-400 hover:text-brass-700"
            >
              <MessageCircleQuestion className="h-3.5 w-3.5" /> Ask my teacher
            </button>
          )}
        </div>

        <h2 className="mt-4 font-display text-[21px] font-medium leading-snug text-ink-900">
          {current.question_text}
        </h2>

        <div className="mt-6 space-y-2.5">
          {current.options.map((o, i) => {
            const isSelected = selectedId === o.id;
            const showState = phase === "feedback";
            return (
              <button
                key={o.id}
                disabled={phase === "feedback" || busy}
                onClick={() => answer(o)}
                className={cn(
                  "flex w-full items-center gap-3.5 rounded-md border px-4 py-3 text-left text-[14.5px] leading-snug transition-all duration-150",
                  showState
                    ? o.is_correct
                      ? "border-pine-500 bg-pine-50 text-pine-700"
                      : isSelected
                        ? "border-alert-500/60 bg-alert-50 text-alert-700"
                        : "border-line bg-paper/70 text-ink-400"
                    : "border-line-strong bg-white/60 text-ink-800 hover:-translate-y-px hover:border-ink-500 hover:bg-cream hover:shadow-card"
                )}
              >
                <span
                  className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-bold",
                    showState && o.is_correct
                      ? "border-pine-500 bg-pine-600 text-cream"
                      : showState && isSelected && !o.is_correct
                        ? "border-alert-500 bg-alert-600 text-cream"
                        : "border-line-strong text-ink-400"
                  )}
                >
                  {String.fromCharCode(65 + i)}
                </span>
                <span className="flex-1">{o.option_text}</span>
                {showState && o.is_correct && <CheckCircle2 className="h-4 w-4 shrink-0 text-pine-600" />}
              </button>
            );
          })}
        </div>

        {bootError && (
          <p className="mt-4 flex items-start gap-2 rounded-md border border-alert-100 bg-alert-50 px-3 py-2.5 text-[13px] text-alert-700">
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" /> {bootError}
          </p>
        )}

        {/* Feedback — never exposes misconception labels */}
        {phase === "feedback" && outcome && (
          <div
            className={cn(
              "mt-6 rounded-lg border p-5 animate-rise",
              outcome.correct
                ? "border-pine-100 bg-pine-50"
                : isRemedial
                  ? "border-brass-300 bg-brass-50"
                  : "border-line bg-paper"
            )}
          >
            {outcome.correct ? (
              <>
                <p className="flex items-center gap-2 text-[15px] font-semibold text-pine-700">
                  <CheckCircle2 className="h-[18px] w-[18px]" /> Correct — nicely done.
                </p>
                <p className="mt-1.5 text-[13px] text-pine-700/80">
                  {stats.correct >= 3 ? "You're building real momentum in this set." : "Keep going at your own pace."}
                </p>
              </>
            ) : (
              <>
                <p className="text-[15px] font-semibold text-ink-900">
                  {isRemedial ? "Let's slow down and rebuild this idea." : "Not quite — let's try another one."}
                </p>
                <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-600">
                  The answer was <span className="font-semibold text-ink-900">{correctOption?.option_text}</span>
                  {selectedOption && !selectedOption.is_correct ? (
                    <>
                      {" — you chose "}
                      <span className="font-medium">{selectedOption.option_text}</span>.
                    </>
                  ) : (
                    "."
                  )}
                </p>

                {(isRemedial || isFollowup) && (
                  <div className="mt-4 rounded-md border border-brass-200 bg-cream p-4">
                    <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-brass-700">
                      <Lightbulb className="h-3.5 w-3.5" />
                      {isRemedial ? "A quick concept reset" : "One more look at this idea"}
                    </p>
                    <p className="mt-2 text-[13.5px] leading-relaxed text-ink-700">
                      {isRemedial
                        ? (remedialTag?.description ??
                          "This idea has come up a few times now. Re-read the concept in your textbook and take the next questions slowly.") +
                          (followAvailable
                            ? " The next question checks the same idea from a fresh angle."
                            : "")
                        : followAvailable
                          ? "That concept is worth one more look. The next question approaches it from a slightly different angle — take your time."
                          : "That concept is worth one more careful look — keep it in mind as you work through the rest of the set."}
                    </p>
                  </div>
                )}
              </>
            )}

            <div className="mt-4 flex justify-end">
              <Button onClick={advance} variant={outcome.correct ? "primary" : "accent"}>
                {pointer + 1 >= queue.length ? (
                  "Finish set"
                ) : outcome.correct ? (
                  <>Next question <ArrowRight className="h-4 w-4" /></>
                ) : isRemedial || isFollowup ? (
                  <>Try the next one <ArrowRight className="h-4 w-4" /></>
                ) : (
                  <>Keep going <ArrowRight className="h-4 w-4" /></>
                )}
              </Button>
            </div>
          </div>
        )}
      </article>

      {/* Ask teacher modal */}
      <Modal open={askOpen} onClose={() => setAskOpen(false)} title="Ask my teacher">
        <div className="space-y-4">
          <blockquote className="flex gap-2.5 rounded-md border-l-2 border-brass-400 bg-paper px-3.5 py-2.5">
            <Quote className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brass-500" />
            <p className="text-[12.5px] italic leading-relaxed text-ink-500">{current.question_text}</p>
          </blockquote>
          <Textarea
            value={askText}
            onChange={(e) => setAskText(e.target.value)}
            placeholder="What exactly is confusing? Even a rough question helps your teacher help you…"
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setAskOpen(false)}>
              Cancel
            </Button>
            <Button onClick={sendDoubt} disabled={askBusy || !askText.trim()}>
              {askBusy ? <Spinner className="border-ink-400 border-t-cream" /> : <Send className="h-3.5 w-3.5" />}
              Send doubt
            </Button>
          </div>
          <p className="text-[12px] leading-relaxed text-ink-400">
            Your doubt goes to the {classrooms[0]?.name ?? "class"} inbox with this question attached.
            Replies appear on the practice home screen.
          </p>
        </div>
      </Modal>
    </div>
  );
}
