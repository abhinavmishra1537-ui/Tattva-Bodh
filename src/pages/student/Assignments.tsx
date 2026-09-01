import { useEffect, useMemo, useState } from "react";
import {
  AlarmClock,
  CalendarClock,
  CircleAlert,
  CircleCheck,
  FileText,
  Lock,
  Paperclip,
  Pencil,
  TriangleAlert,
  UploadCloud,
} from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import { isNote, noteText, submissionPath, uploadFile } from "../../lib/storage";
import { useAuth } from "../../contexts/AuthContext";
import { useStudentAssignments, type StudentAssignment } from "../../hooks/useStudent";
import { cn, formatDateTime, getCountdown } from "../../lib/utils";
import {
  Badge,
  Button,
  EmptyState,
  Field,
  Modal,
  PageHeader,
  PageLoading,
  Spinner,
  Textarea,
} from "../../components/ui";

export default function StudentAssignments() {
  const { profile } = useAuth();
  const { items, loading, refresh } = useStudentAssignments(profile?.id);

  const [submitFor, setSubmitFor] = useState<StudentAssignment | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  /* Live countdown re-render */
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 20_000);
    return () => window.clearInterval(t);
  }, []);

  const sorted = useMemo(
    () =>
      [...items].sort((a, b) => {
        if (a.urgent !== b.urgent) return a.urgent ? -1 : 1;
        const as = a.submission ? 1 : 0;
        const bs = b.submission ? 1 : 0;
        if (as !== bs) return as - bs;
        return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
      }),
    [items]
  );

  /** Opens the composer, pre-filled when editing an existing submission. */
  const openComposer = (a: StudentAssignment) => {
    setSubmitFor(a);
    setFormError(null);
    setFile(null);
    const existing = a.submission?.submitted_file_url;
    setNote(existing && isNote(existing) ? noteText(existing) : "");
  };

  const submit = async () => {
    if (!profile || !submitFor) return;

    // Guard: the deadline may have passed while the composer was open.
    if (getCountdown(submitFor.deadline).state === "over" && submitFor.submission) {
      setFormError("The deadline has passed — your existing submission can no longer be changed.");
      return;
    }
    if (!file && !note.trim()) {
      setFormError("Attach a file or write your answer in the text box.");
      return;
    }

    setFormError(null);
    setBusy(true);
    try {
      let fileUrl: string;
      if (file) {
        const { url, error: uploadErr } = await uploadFile(
          submissionPath(submitFor.classroom_id, submitFor.id, profile.id, file.name),
          file
        );
        if (uploadErr) {
          setFormError(uploadErr);
          setBusy(false);
          return;
        }
        fileUrl = url!;
      } else {
        fileUrl = `note:${note.trim()}`;
      }

      const existing = submitFor.submission;
      if (existing) {
        // Edit in place — never create a duplicate row.
        const { error } = await supabase
          .from("assignment_submissions")
          .update({ submitted_file_url: fileUrl, submitted_at: new Date().toISOString() })
          .eq("id", existing.id);
        if (error) throw error;
        console.debug(`[Tattva Bodh] submission ${existing.id} updated`);
      } else {
        const { error } = await supabase.from("assignment_submissions").upsert(
          {
            assignment_id: submitFor.id,
            student_id: profile.id,
            submitted_file_url: fileUrl,
            submitted_at: new Date().toISOString(),
          },
          { onConflict: "assignment_id,student_id" }
        );
        if (error) throw error;
      }

      setSubmitFor(null);
      setFile(null);
      setNote("");
      await refresh();
    } catch (err) {
      console.error("[Tattva Bodh] submission save failed:", err);
      setFormError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-8 lg:px-10">
        <PageLoading label="Checking deadlines" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-8 lg:px-10">
      <PageHeader
        kicker="Assignments"
        title="Deadlines & submissions"
        sub="Cards turn red when a deadline is under 24 hours away and you haven't submitted — those always float to the top."
      />

      {sorted.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-8 w-8" strokeWidth={1.4} />}
          title="No assignments yet"
          body="When your teacher posts an assignment, it appears here with a live countdown."
        />
      ) : (
        <ul className="space-y-3">
          {sorted.map((a) => {
            const cd = getCountdown(a.deadline, now);
            const submitted = !!a.submission;
            const late =
              submitted && new Date(a.submission!.submitted_at) > new Date(a.deadline);
            const urgent = a.urgent;

            return (
              <li
                key={a.id}
                className={cn(
                  "rounded-lg border bg-cream shadow-card transition-colors duration-200",
                  urgent ? "border-alert-500/70 shadow-[0_0_0_1px_rgba(169,43,34,0.25),0_10px_28px_-14px_rgba(169,43,34,0.4)]" : "border-line"
                )}
              >
                <div className="flex flex-wrap items-start gap-4 p-5">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {urgent && (
                        <span className="h-2 w-2 rounded-full bg-alert-600 animate-pulse-ring" />
                      )}
                      <h3 className="text-[15.5px] font-semibold text-ink-900">{a.title}</h3>
                      <Badge tone="outline">{a.classroomName}</Badge>
                    </div>
                    {a.description && (
                      <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-ink-500">
                        {a.description}
                      </p>
                    )}
                    <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-ink-400">
                      <span className="inline-flex items-center gap-1.5">
                        <CalendarClock className="h-3.5 w-3.5" />
                        {formatDateTime(a.deadline)}
                      </span>
                      {a.file_url && (
                        <a
                          href={a.file_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 font-semibold text-brass-700 hover:text-brass-600"
                        >
                          <Paperclip className="h-3.5 w-3.5" /> Assignment brief
                        </a>
                      )}
                    </div>
                  </div>

                  {/* Status column */}
                  <div className="flex w-full flex-col items-stretch gap-2 border-t border-line pt-4 sm:w-52 sm:border-0 sm:pt-0">
                    {submitted ? (
                      <>
                        <span
                          className={cn(
                            "inline-flex items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-[12.5px] font-semibold",
                            late
                              ? "border-alert-100 bg-alert-50 text-alert-700"
                              : "border-pine-100 bg-pine-50 text-pine-700"
                          )}
                        >
                          <CircleCheck className="h-4 w-4" />
                          {late ? "Submitted late" : "Submitted"}
                        </span>
                        <span className="text-center text-[11.5px] text-ink-400">
                          {formatDateTime(a.submission!.submitted_at)}
                        </span>
                        {cd.state !== "over" ? (
                          <button
                            onClick={() => openComposer(a)}
                            className="inline-flex items-center justify-center gap-1.5 text-[12px] font-semibold text-ink-500 underline-offset-2 transition-colors hover:text-ink-800 hover:underline"
                          >
                            <Pencil className="h-3 w-3" /> Edit submission
                          </button>
                        ) : (
                          <span
                            title="The deadline has passed, so this submission is locked."
                            className="inline-flex cursor-not-allowed items-center justify-center gap-1.5 text-[11.5px] font-medium text-ink-300"
                          >
                            <Lock className="h-3 w-3" /> Deadline passed — locked
                          </span>
                        )}
                      </>
                    ) : (
                      <>
                        <span
                          className={cn(
                            "inline-flex items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-[12.5px] font-semibold",
                            cd.state === "over"
                              ? "border-alert-500/60 bg-alert-600 text-cream"
                              : cd.state === "soon"
                                ? "border-alert-100 bg-alert-50 text-alert-700"
                                : "border-line bg-paper text-ink-600"
                          )}
                        >
                          {cd.state === "safe" ? (
                            <AlarmClock className="h-4 w-4" />
                          ) : (
                            <TriangleAlert className="h-4 w-4" />
                          )}
                          {cd.label}
                        </span>
                        <Button
                          variant={urgent ? "danger" : "primary"}
                          size="sm"
                          onClick={() => openComposer(a)}
                        >
                          {cd.state === "over" ? "Submit now (late)" : "Submit work"}
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Submit modal */}
      <Modal
        open={!!submitFor}
        onClose={() => setSubmitFor(null)}
        title={
          submitFor
            ? `${submitFor.submission ? "Edit submission" : "Submit"} · ${submitFor.title}`
            : "Submit"
        }
      >
        <div className="space-y-4">
          {submitFor && (
            <p className="rounded-md border border-line bg-paper px-3.5 py-2.5 text-[12.5px] text-ink-500">
              Deadline: <span className="font-semibold text-ink-800">{formatDateTime(submitFor.deadline)}</span>
              {getCountdown(submitFor.deadline).state === "over" && (
                <span className="ml-2 font-semibold text-alert-600">— this will be marked late</span>
              )}
              {submitFor.submission && (
                <span className="mt-1 block text-ink-400">
                  Replacing your submission from {formatDateTime(submitFor.submission.submitted_at)} — it
                  updates in place, no duplicate is created.
                </span>
              )}
            </p>
          )}
          <Field label="Upload a file">
            <label className="flex cursor-pointer items-center gap-3 rounded-md border border-dashed border-line-strong bg-paper/60 px-3.5 py-3 text-[13px] text-ink-500 transition-colors hover:border-ink-400">
              <UploadCloud className="h-4 w-4 text-ink-400" />
              {file ? <span className="font-medium text-ink-800">{file.name}</span> : "Choose a file…"}
              <input type="file" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </label>
          </Field>
          <div className="flex items-center gap-3 text-[11.5px] font-semibold uppercase tracking-[0.12em] text-ink-300">
            <span className="h-px flex-1 bg-line" /> or write instead <span className="h-px flex-1 bg-line" />
          </div>
          <Field label="Text answer">
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Type or paste your answer here…"
              disabled={!!file}
            />
          </Field>
          {formError && (
            <p className="flex items-start gap-2 rounded-md border border-alert-100 bg-alert-50 px-3 py-2.5 text-[13px] text-alert-700">
              <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" /> {formError}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setSubmitFor(null)}>
              Cancel
            </Button>
            <Button variant="accent" onClick={submit} disabled={busy}>
              {busy ? <Spinner className="border-ink-400 border-t-cream" /> : <UploadCloud className="h-4 w-4" />}
              {submitFor?.submission ? "Save changes" : "Submit"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
