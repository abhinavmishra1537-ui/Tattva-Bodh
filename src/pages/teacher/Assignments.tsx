import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  CalendarClock,
  ChevronDown,
  CircleAlert,
  CircleCheck,
  FileText,
  FolderOpen,
  Paperclip,
  Pencil,
  Plus,
  Send,
  Trash2,
  TriangleAlert,
  UploadCloud,
  X,
} from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import { briefPath, isNote, noteText, uploadFile } from "../../lib/storage";
import { useClassrooms } from "../../contexts/ClassroomContext";
import { cn, formatDateTime, getCountdown } from "../../lib/utils";
import type { Assignment, AssignmentSubmission } from "../../lib/types";
import {
  Badge,
  Button,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  PageLoading,
  Spinner,
  Textarea,
} from "../../components/ui";

interface AssignmentWithSubs extends Assignment {
  submissions: (AssignmentSubmission & { studentName: string })[];
}

/** Converts an ISO timestamp to the value format <input type="datetime-local"> wants. */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function TeacherAssignments() {
  const { selected, loading: classroomLoading } = useClassrooms();

  const [assignments, setAssignments] = useState<AssignmentWithSubs[]>([]);
  const [rosterSize, setRosterSize] = useState(0);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  /* Form state — shared by create and edit */
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Assignment | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [deadline, setDeadline] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [existingFileUrl, setExistingFileUrl] = useState<string | null>(null);
  const [removeExistingFile, setRemoveExistingFile] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formWarning, setFormWarning] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<Assignment | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  /* Toast auto-dismisses; errors stay a little longer. */
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), toast.tone === "error" ? 9000 : 5000);
    return () => window.clearTimeout(t);
  }, [toast]);

  const closeDeleteDialog = () => {
    setDeleteTarget(null);
    setDeleteError(null);
  };

  const load = useCallback(async () => {
    if (!selected) {
      setAssignments([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setListError(null);

    const [{ data: assigns, error: aErr }, { count: rosterCount }, { data: rosterProfiles }] =
      await Promise.all([
        supabase
          .from("assignments")
          .select("*")
          .eq("classroom_id", selected.id)
          .order("deadline", { ascending: true }),
        supabase
          .from("classroom_students")
          .select("id", { count: "exact", head: true })
          .eq("classroom_id", selected.id),
        supabase
          .from("classroom_students")
          .select("student_id, profiles(full_name)")
          .eq("classroom_id", selected.id),
      ]);
    if (aErr) {
      console.error("[Tattva Bodh] assignments fetch failed:", aErr);
      setListError(aErr.message);
    }
    setRosterSize(rosterCount ?? 0);

    const nameOf = new Map(
      (((rosterProfiles ?? []) as unknown as { student_id: string; profiles: { full_name: string } | null }[]) ?? []).map(
        (r) => [r.student_id, r.profiles?.full_name ?? "Student"] as const
      )
    );

    const assignmentRows = (assigns ?? []) as Assignment[];
    const subsByAssignment = new Map<string, (AssignmentSubmission & { studentName: string })[]>();
    if (assignmentRows.length > 0) {
      const { data: subs, error: sErr } = await supabase
        .from("assignment_submissions")
        .select("*")
        .in(
          "assignment_id",
          assignmentRows.map((a) => a.id)
        )
        .order("submitted_at", { ascending: false });
      if (sErr) console.error("[Tattva Bodh] submissions fetch failed:", sErr);
      for (const s of (subs ?? []) as AssignmentSubmission[]) {
        const entry = { ...s, studentName: nameOf.get(s.student_id) ?? "Student" };
        subsByAssignment.set(s.assignment_id, [...(subsByAssignment.get(s.assignment_id) ?? []), entry]);
      }
    }

    setAssignments(
      assignmentRows.map((a) => ({ ...a, submissions: subsByAssignment.get(a.id) ?? [] }))
    );
    setLoading(false);
  }, [selected]);

  useEffect(() => {
    load();
  }, [load]);

  /* Refresh countdown chips periodically */
  const [, forceTick] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => forceTick((n) => n + 1), 30_000);
    return () => window.clearInterval(t);
  }, []);

  const openCreate = () => {
    setEditing(null);
    setTitle("");
    setDescription("");
    setDeadline("");
    setFile(null);
    setExistingFileUrl(null);
    setRemoveExistingFile(false);
    setFormError(null);
    setFormWarning(null);
    setFormOpen(true);
  };

  const openEdit = (a: Assignment) => {
    setEditing(a);
    setTitle(a.title);
    setDescription(a.description ?? "");
    setDeadline(toLocalInput(a.deadline));
    setFile(null);
    setExistingFileUrl(a.file_url);
    setRemoveExistingFile(false);
    setFormError(null);
    setFormWarning(null);
    setFormOpen(true);
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    setFormError(null);
    setFormWarning(null);
    setBusy(true);
    try {
      // Start from whatever the assignment already had.
      let fileUrl: string | null = removeExistingFile ? null : existingFileUrl;

      if (file) {
        const { url, error: uploadErr } = await uploadFile(briefPath(selected.id, file.name), file);
        if (uploadErr) {
          // Surface the real storage error and STOP — never silently drop the file.
          setFormError(uploadErr);
          setBusy(false);
          return;
        }
        fileUrl = url;
      }

      const payload = {
        title: title.trim(),
        description: description.trim() || null,
        file_url: fileUrl,
        deadline: new Date(deadline).toISOString(),
      };

      if (editing) {
        const { error: updateErr } = await supabase
          .from("assignments")
          .update(payload)
          .eq("id", editing.id);
        if (updateErr) throw updateErr;
        console.debug(`[Tattva Bodh] assignment ${editing.id} updated`);
      } else {
        const { error: insertErr } = await supabase
          .from("assignments")
          .insert({ classroom_id: selected.id, ...payload });
        if (insertErr) throw insertErr;
      }

      setFormOpen(false);
      setEditing(null);
      setFile(null);
      await load();
    } catch (err) {
      const message = (err as Error).message;
      console.error("[Tattva Bodh] assignment save failed:", err);
      setFormError(message);
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleting(true);
    setDeleteError(null);
    try {
      /* 1. Try the assignment delete first — a single request when the schema
             cascades, which is the happy path. */
      const first = await supabase.from("assignments").delete().eq("id", target.id);
      console.debug(`[Tattva Bodh] DELETE assignments id=${target.id} → error:`, first.error ?? "none");

      if (first.error) {
        console.error("[Tattva Bodh] assignment delete failed:", first.error);
        const fkBlocked =
          first.error.code === "23503" || /foreign key|violates/i.test(first.error.message ?? "");

        /* 2. If submissions still reference the assignment (no ON DELETE
               CASCADE in the schema), clear them and retry once. */
        if (fkBlocked) {
          const cleanup = await supabase
            .from("assignment_submissions")
            .delete()
            .eq("assignment_id", target.id);
          console.debug("[Tattva Bodh] submission cleanup → error:", cleanup.error ?? "none");
          if (cleanup.error) {
            throw new Error(
              `The database blocked this delete because submissions still reference the assignment ` +
                `(${cleanup.error.message}). Check that teachers may delete ` +
                `assignment_submissions rows, or enable ON DELETE CASCADE on the FK.`
            );
          }

          const retry = await supabase.from("assignments").delete().eq("id", target.id);
          console.debug(`[Tattva Bodh] DELETE retry → error:`, retry.error ?? "none");
          if (retry.error) throw retry.error;
        } else {
          throw first.error;
        }
      }

      /* 3. Success — remove it from local state IMMEDIATELY (so the card
             vanishes even if the reconcile fetch below hiccups), then
             re-fetch the authoritative list. */
      closeDeleteDialog();
      setAssignments((prev) => prev.filter((a) => a.id !== target.id));
      setExpanded((prev) => (prev === target.id ? null : prev));
      setToast({ tone: "success", text: `“${target.title}” was deleted.` });
      await load();
    } catch (err) {
      const message = (err as Error).message ?? "Unknown error";
      console.error("[Tattva Bodh] assignment delete failed:", err);
      setDeleteError(message);
      setToast({ tone: "error", text: `Couldn't delete “${target.title}” — see the dialog for detail.` });
    } finally {
      setDeleting(false);
    }
  };

  const ordered = useMemo(
    () =>
      [...assignments].sort((a, b) => {
        const ao = getCountdown(a.deadline).state === "over" ? 1 : 0;
        const bo = getCountdown(b.deadline).state === "over" ? 1 : 0;
        return ao - bo || new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
      }),
    [assignments]
  );

  if (classroomLoading) return <div className="mx-auto max-w-6xl px-6 py-8 lg:px-10"><PageLoading /></div>;

  if (!selected) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-8 lg:px-10">
        <EmptyState
          icon={<FolderOpen className="h-8 w-8" strokeWidth={1.4} />}
          title="No classroom selected"
          body="Create a classroom from Roster & Credentials first — assignments belong to a classroom."
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-8 lg:px-10">
      <PageHeader
        kicker={selected.name}
        title="Assignments"
        sub={`Deadlines, briefs and submission tracking for ${selected.name}. “Late” is computed from each submission's timestamp against the deadline.`}
        actions={
          <Button variant="accent" onClick={openCreate}>
            <Plus className="h-4 w-4" /> New assignment
          </Button>
        }
      />

      {listError && (
        <p className="mb-4 flex items-start gap-2 rounded-md border border-alert-100 bg-alert-50 px-3.5 py-2.5 text-[13px] text-alert-700">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" /> Couldn't load assignments: {listError}
        </p>
      )}

      {loading ? (
        <PageLoading label="Loading assignments" />
      ) : ordered.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-8 w-8" strokeWidth={1.4} />}
          title="No assignments yet"
          body="Post your first assignment — students will see a live countdown on their side, with urgency alerts inside 24 hours."
          action={
            <Button variant="accent" onClick={openCreate}>
              <Plus className="h-4 w-4" /> New assignment
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {ordered.map((a) => {
            const cd = getCountdown(a.deadline);
            const lateCount = a.submissions.filter(
              (s) => new Date(s.submitted_at) > new Date(a.deadline)
            ).length;
            const isOpen = expanded === a.id;
            return (
              <article key={a.id} className="surface overflow-hidden">
                <div className="flex items-center gap-3 px-5 py-4">
                  <button
                    onClick={() => setExpanded(isOpen ? null : a.id)}
                    className="flex min-w-0 flex-1 items-center gap-4 text-left"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-[15px] font-semibold text-ink-900">{a.title}</h3>
                        {cd.state === "over" ? (
                          <Badge tone="alert">Closed · {cd.label}</Badge>
                        ) : cd.state === "soon" ? (
                          <Badge tone="brass">{cd.label}</Badge>
                        ) : (
                          <Badge tone="ink">{cd.label}</Badge>
                        )}
                        {lateCount > 0 && <Badge tone="outline">{lateCount} late</Badge>}
                      </div>
                      <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12.5px] text-ink-400">
                        <span className="inline-flex items-center gap-1">
                          <CalendarClock className="h-3.5 w-3.5" /> {formatDateTime(a.deadline)}
                        </span>
                        {a.file_url && (
                          <a
                            href={a.file_url}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1 font-medium text-brass-700 hover:text-brass-600"
                          >
                            <Paperclip className="h-3.5 w-3.5" /> Brief attached
                          </a>
                        )}
                      </p>
                    </div>
                    <div className="hidden w-44 shrink-0 sm:block">
                      <div className="flex items-center justify-between text-[11.5px] font-semibold">
                        <span className="text-ink-400">Submissions</span>
                        <span className="text-ink-800">
                          {a.submissions.length}/{rosterSize}
                        </span>
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-paper-deep">
                        <div
                          className="h-full rounded-full bg-pine-600 transition-all duration-300"
                          style={{ width: `${rosterSize ? Math.min(100, (a.submissions.length / rosterSize) * 100) : 0}%` }}
                        />
                      </div>
                    </div>
                  </button>

                  {/* Row actions */}
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      onClick={() => openEdit(a)}
                      title="Edit assignment"
                      className="rounded-md p-2 text-ink-400 transition-colors hover:bg-paper hover:text-ink-800"
                    >
                      <Pencil className="h-4 w-4" strokeWidth={1.8} />
                    </button>
                    <button
                      onClick={() => {
                        setDeleteTarget(a);
                        setDeleteError(null);
                      }}
                      title="Delete assignment"
                      className="rounded-md p-2 text-ink-400 transition-colors hover:bg-alert-50 hover:text-alert-600"
                    >
                      <Trash2 className="h-4 w-4" strokeWidth={1.8} />
                    </button>
                    <button
                      onClick={() => setExpanded(isOpen ? null : a.id)}
                      className="rounded-md p-2 text-ink-300 transition-colors hover:bg-paper"
                      aria-label="Toggle submissions"
                    >
                      <ChevronDown className={cn("h-4 w-4 transition-transform duration-200", isOpen && "rotate-180")} />
                    </button>
                  </div>
                </div>

                {isOpen && (
                  <div className="border-t border-line bg-paper/40 px-5 py-4 animate-fade">
                    {a.description && (
                      <p className="mb-4 max-w-3xl text-[13.5px] leading-relaxed text-ink-600">{a.description}</p>
                    )}
                    {a.submissions.length === 0 ? (
                      <p className="text-[13px] text-ink-400">No submissions yet.</p>
                    ) : (
                      <ul className="space-y-2">
                        {a.submissions.map((s) => {
                          const late = new Date(s.submitted_at) > new Date(a.deadline);
                          return (
                            <li
                              key={s.id}
                              className="flex flex-wrap items-center gap-3 rounded-md border border-line bg-cream px-3.5 py-2.5"
                            >
                              <span className="text-[13.5px] font-semibold text-ink-800">{s.studentName}</span>
                              <span className="text-[12px] text-ink-400">{formatDateTime(s.submitted_at)}</span>
                              {late && <Badge tone="alert">Late</Badge>}
                              {isNote(s.submitted_file_url) ? (
                                <span className="ml-auto max-w-[280px] truncate text-[12.5px] italic text-ink-500">
                                  “{noteText(s.submitted_file_url)}”
                                </span>
                              ) : (
                                <a
                                  href={s.submitted_file_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="ml-auto inline-flex items-center gap-1 text-[12.5px] font-semibold text-brass-700 hover:text-brass-600"
                                >
                                  <Paperclip className="h-3.5 w-3.5" /> View file
                                </a>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {/* Create / edit modal */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? `Edit · ${editing.title}` : `New assignment · ${selected.name}`}
      >
        <form onSubmit={save} className="space-y-4">
          <Field label="Title">
            <Input required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Linear equations — practice set 4" />
          </Field>
          <Field label="Instructions">
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What should students submit, and how will you assess it?" />
          </Field>
          <Field label="Deadline">
            <Input required type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          </Field>

          <Field
            label="Attachment (optional)"
            hint={`Uploaded to the "assignment-files" storage bucket. Students see it as the assignment brief.`}
          >
            {existingFileUrl && !removeExistingFile && !file ? (
              <div className="flex items-center gap-2 rounded-md border border-line bg-paper px-3.5 py-2.5">
                <Paperclip className="h-3.5 w-3.5 shrink-0 text-ink-400" />
                <a
                  href={existingFileUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="min-w-0 flex-1 truncate text-[13px] font-medium text-brass-700 hover:text-brass-600"
                >
                  Current attachment
                </a>
                <button
                  type="button"
                  onClick={() => setRemoveExistingFile(true)}
                  className="rounded-md p-1 text-ink-400 hover:bg-alert-50 hover:text-alert-600"
                  title="Remove attachment"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <label className="flex cursor-pointer items-center gap-3 rounded-md border border-dashed border-line-strong bg-paper/60 px-3.5 py-3 text-[13px] text-ink-500 transition-colors hover:border-ink-400">
                <UploadCloud className="h-4 w-4 text-ink-400" />
                {file ? (
                  <span className="font-medium text-ink-800">{file.name}</span>
                ) : removeExistingFile ? (
                  "Attachment removed — choose a replacement…"
                ) : (
                  "Choose a file…"
                )}
                <input type="file" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              </label>
            )}
          </Field>

          {formWarning && (
            <p className="flex items-start gap-2 rounded-md border border-brass-200 bg-brass-50 px-3 py-2.5 text-[13px] text-brass-700">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" /> {formWarning}
            </p>
          )}
          {formError && (
            <p className="flex items-start gap-2 rounded-md border border-alert-100 bg-alert-50 px-3 py-2.5 text-[13px] text-alert-700">
              <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" /> {formError}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="accent" disabled={busy}>
              {busy ? <Spinner className="border-ink-400 border-t-cream" /> : <Send className="h-4 w-4" />}
              {editing ? "Save changes" : "Post assignment"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete confirmation */}
      <Modal
        open={!!deleteTarget}
        onClose={closeDeleteDialog}
        title="Delete assignment?"
        width="max-w-md"
      >
        <p className="text-[13.5px] leading-relaxed text-ink-600">
          <span className="font-semibold text-ink-900">{deleteTarget?.title}</span> will be removed
          for every student in {selected.name}
          {deleteTarget && deleteTarget.id
            ? assignments.find((a) => a.id === deleteTarget.id)?.submissions.length
              ? ", along with all submissions already made against it"
              : ""
            : ""}
          . This can't be undone.
        </p>
        {deleteError && (
          <p className="mt-3 flex items-start gap-2 rounded-md border border-alert-100 bg-alert-50 px-3 py-2.5 text-[13px] text-alert-700">
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" /> {deleteError}
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={closeDeleteDialog}>
            Keep it
          </Button>
          <Button variant="danger" onClick={confirmDelete} disabled={deleting}>
            {deleting ? <Spinner className="border-ink-400 border-t-cream" /> : <Trash2 className="h-4 w-4" />}
            Delete assignment
          </Button>
        </div>
      </Modal>

      {/* Persistent toast — survives after dialogs close */}
      {toast && (
        <div className="fixed bottom-5 right-5 z-40 max-w-sm animate-rise">
          <div
            className={cn(
              "flex items-start gap-2.5 rounded-lg border px-4 py-3 shadow-lifted",
              toast.tone === "success"
                ? "border-pine-100 bg-pine-50 text-pine-700"
                : "border-alert-100 bg-alert-50 text-alert-700"
            )}
            role="status"
          >
            {toast.tone === "success" ? (
              <CircleCheck className="mt-0.5 h-4 w-4 shrink-0" />
            ) : (
              <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            )}
            <p className="text-[13px] leading-snug">{toast.text}</p>
            <button
              onClick={() => setToast(null)}
              className="ml-1 shrink-0 rounded p-0.5 opacity-60 transition-opacity hover:opacity-100"
              aria-label="Dismiss"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
