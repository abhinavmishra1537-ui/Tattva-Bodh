import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Check,
  CircleAlert,
  ClipboardCopy,
  FolderPlus,
  KeyRound,
  Plus,
  Users,
} from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import { useClassrooms } from "../../contexts/ClassroomContext";
import { CODE_LENGTH, generateLoginCode } from "../../lib/utils";
import type { IssuedCredential, Subject } from "../../lib/types";
import {
  Badge,
  Button,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  PageLoading,
  Select,
  Spinner,
  Textarea,
} from "../../components/ui";

export default function Roster() {
  const { classrooms, selected, loading: classroomLoading, createClassroom } = useClassrooms();

  const [credentials, setCredentials] = useState<IssuedCredential[]>([]);
  const [joinedIds, setJoinedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [className, setClassName] = useState("");
  const [classSubject, setClassSubject] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [namesText, setNamesText] = useState("");
  const [issuing, setIssuing] = useState(false);
  const [issueError, setIssueError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  /* Subjects for classroom creation */
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from("subjects").select("*").order("name");
      if (error) console.error("subjects:", error.message);
      const rows = (data ?? []) as Subject[];
      setSubjects(rows);
      setClassSubject((prev) => prev || rows[0]?.name || "");
    })();
  }, []);

  const loadCredentials = useCallback(async () => {
    if (!selected) {
      setCredentials([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const [{ data: creds, error: cErr }, { data: members, error: mErr }] = await Promise.all([
      supabase
        .from("issued_credentials")
        .select("*")
        .eq("classroom_id", selected.id)
        .order("created_at", { ascending: true }),
      supabase.from("classroom_students").select("student_id").eq("classroom_id", selected.id),
    ]);
    if (cErr) console.error("credentials:", cErr.message);
    if (mErr) console.error("members:", mErr.message);
    setCredentials((creds ?? []) as IssuedCredential[]);
    setJoinedIds(new Set(((members ?? []) as { student_id: string }[]).map((m) => m.student_id)));
    setLoading(false);
  }, [selected]);

  useEffect(() => {
    loadCredentials();
  }, [loadCredentials]);

  const parsedNames = useMemo(
    () =>
      namesText
        .split("\n")
        .map((n) => n.trim())
        .filter(Boolean),
    [namesText]
  );

  const handleCreateClassroom = async (e: FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    setCreating(true);
    // Context handles: insert with .select(), immediate local append,
    // auto-select, reconciliation re-fetch, and error logging.
    const { error } = await createClassroom(className, classSubject);
    setCreating(false);
    if (error) {
      setCreateError(error);
      return;
    }
    setClassName("");
    setCreateOpen(false);
  };

  const issueCodes = async () => {
    if (!selected || parsedNames.length === 0) return;
    setIssueError(null);
    setIssuing(true);
    try {
      const existing = new Set(credentials.map((c) => c.login_code));
      const batch = new Set<string>();
      const uniqueCode = () => {
        let code = generateLoginCode(CODE_LENGTH);
        while (existing.has(code) || batch.has(code)) code = generateLoginCode(CODE_LENGTH);
        batch.add(code);
        return code;
      };
      const rows = parsedNames.map((name) => ({
        classroom_id: selected.id,
        student_name: name,
        login_code: uniqueCode(),
        is_used: false,
      }));
      const { error } = await supabase.from("issued_credentials").insert(rows);
      if (error) throw error;
      setNamesText("");
      await loadCredentials();
    } catch (err) {
      setIssueError((err as Error).message);
    } finally {
      setIssuing(false);
    }
  };

  const copy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setCopied(key);
    window.setTimeout(() => setCopied(null), 1600);
  };

  const copyAll = () =>
    copy(
      credentials.map((c) => `${c.student_name}\t${c.login_code}`).join("\n"),
      "__all"
    );

  if (classroomLoading) return <div className="mx-auto max-w-6xl px-6 py-8 lg:px-10"><PageLoading /></div>;

  /* ---------------- No classroom at all → first-run setup ---------------- */
  if (classrooms.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-12 lg:px-10">
        <p className="label-caps mb-3 text-brass-600">First steps</p>
        <h1 className="font-display text-[30px] font-semibold tracking-[-0.01em] text-ink-900">
          Create your first classroom
        </h1>
        <p className="mt-3 max-w-xl text-[14px] leading-relaxed text-ink-500">
          A classroom is where practice data, assignments, doubts and the misconception heatmap
          come together. Students never self-register — you issue each of them a personal login
          code below.
        </p>
        <form onSubmit={handleCreateClassroom} className="surface mt-8 space-y-4 p-6">
          <Field label="Classroom name">
            <Input
              required
              value={className}
              onChange={(e) => setClassName(e.target.value)}
              placeholder="e.g. Class 9 — Section A"
            />
          </Field>
          <Field label="Primary subject" hint="The heatmap scopes misconception tags to this subject (all subjects remain usable for practice).">
            <Select value={classSubject} onChange={(e) => setClassSubject(e.target.value)}>
              {subjects.map((s) => (
                <option key={s.id} value={s.name}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          {createError && (
            <p className="flex items-start gap-2 rounded-md border border-alert-100 bg-alert-50 px-3 py-2.5 text-[13px] text-alert-700">
              <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" /> {createError}
            </p>
          )}
          <Button type="submit" disabled={creating}>
            {creating ? <Spinner className="border-ink-400 border-t-cream" /> : <FolderPlus className="h-4 w-4" />}
            Create classroom
          </Button>
        </form>
      </div>
    );
  }

  /* ---------------- Normal roster & credentials screen ---------------- */
  return (
    <div className="mx-auto max-w-6xl px-6 py-8 lg:px-10">
      <PageHeader
        kicker={selected?.name}
        title="Roster & Credentials"
        sub="Paste your roster, generate one login code per student, and hand them out. A code is claimed once — the student then sets their own password."
        actions={
          <Button variant="outline" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> New classroom
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        {/* Issue panel */}
        <section className="surface self-start p-5">
          <h2 className="flex items-center gap-2 font-display text-[16.5px] font-semibold text-ink-900">
            <KeyRound className="h-4 w-4 text-brass-600" /> Issue login codes
          </h2>
          <p className="mt-1 text-[12.5px] leading-relaxed text-ink-400">
            One student name per line. Each student gets a unique {CODE_LENGTH}-character code for{" "}
            <span className="font-semibold text-ink-700">{selected?.name}</span> — this is what they
            enter on the student sign-in screen.
          </p>
          {selected && (
            <div className="mt-3 rounded-md border border-line bg-paper px-3 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-400">
                  Classroom code
                </span>
                <button
                  type="button"
                  onClick={() => copy(selected.join_code, "join-code")}
                  className="inline-flex items-center gap-1.5 font-mono text-[13px] font-semibold tracking-[0.14em] text-ink-800 transition-colors hover:text-brass-700"
                  title="Copy classroom join code"
                >
                  {copied === "join-code" ? (
                    <Check className="h-3.5 w-3.5 text-pine-600" />
                  ) : (
                    <ClipboardCopy className="h-3.5 w-3.5" />
                  )}
                  {selected.join_code}
                </button>
              </div>
              <p className="mt-1 text-[11.5px] leading-relaxed text-ink-400">
                For <span className="font-semibold text-ink-600">already signed-in</span> students to
                join from their Practice screen. New students must use their own personal login
                code below, not this one.
              </p>
            </div>
          )}
          <div className="mt-4">
            <Textarea
              value={namesText}
              onChange={(e) => setNamesText(e.target.value)}
              placeholder={"Aarav Sharma\nDiya Patel\nKabir Singh\nAnanya Iyer"}
              className="min-h-[180px] font-mono text-[13px]"
            />
          </div>
          {issueError && (
            <p className="mt-3 flex items-start gap-2 rounded-md border border-alert-100 bg-alert-50 px-3 py-2.5 text-[13px] text-alert-700">
              <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" /> {issueError}
            </p>
          )}
          <div className="mt-4 flex items-center justify-between">
            <span className="text-[12.5px] font-medium text-ink-400">
              {parsedNames.length} name{parsedNames.length === 1 ? "" : "s"} ready
            </span>
            <Button variant="accent" size="sm" disabled={parsedNames.length === 0 || issuing} onClick={issueCodes}>
              {issuing ? <Spinner className="border-ink-400 border-t-cream" /> : <KeyRound className="h-3.5 w-3.5" />}
              Generate {parsedNames.length > 0 ? parsedNames.length : ""} code{parsedNames.length === 1 ? "" : "s"}
            </Button>
          </div>
        </section>

        {/* Credential list */}
        <section className="surface overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
            <div>
              <h2 className="font-display text-[16.5px] font-semibold text-ink-900">Issued credentials</h2>
              <p className="mt-0.5 text-[12.5px] text-ink-400">
                {credentials.length} issued · {credentials.filter((c) => c.is_used).length} claimed · {joinedIds.size} in class
              </p>
            </div>
            {credentials.length > 0 && (
              <Button variant="outline" size="sm" onClick={copyAll}>
                {copied === "__all" ? <Check className="h-3.5 w-3.5" /> : <ClipboardCopy className="h-3.5 w-3.5" />}
                {copied === "__all" ? "Copied" : "Copy all"}
              </Button>
            )}
          </div>

          {loading ? (
            <PageLoading label="Loading credentials" />
          ) : credentials.length === 0 ? (
            <div className="p-5">
              <EmptyState
                icon={<Users className="h-8 w-8" strokeWidth={1.4} />}
                title="No codes issued yet"
                body="Paste the roster on the left and generate the first batch of login codes."
              />
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {credentials.map((c) => (
                <li key={c.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-semibold text-ink-900">{c.student_name}</p>
                    <p className="font-mono text-[12.5px] tracking-[0.18em] text-ink-500">{c.login_code}</p>
                  </div>
                  <Badge tone={c.is_used ? "pine" : "brass"}>{c.is_used ? "Claimed" : "Unclaimed"}</Badge>
                  <button
                    onClick={() => copy(`${c.student_name} — login code: ${c.login_code}`, c.id)}
                    className="rounded-md border border-line-strong p-2 text-ink-400 transition-colors hover:bg-paper hover:text-ink-800"
                    title="Copy name + code"
                  >
                    {copied === c.id ? <Check className="h-3.5 w-3.5 text-pine-600" /> : <ClipboardCopy className="h-3.5 w-3.5" />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* New classroom modal */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="New classroom">
        <form onSubmit={handleCreateClassroom} className="space-y-4">
          <Field label="Classroom name">
            <Input required value={className} onChange={(e) => setClassName(e.target.value)} placeholder="e.g. Class 9 — Section B" />
          </Field>
          <Field label="Primary subject">
            <Select value={classSubject} onChange={(e) => setClassSubject(e.target.value)}>
              {subjects.map((s) => (
                <option key={s.id} value={s.name}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          {createError && (
            <p className="flex items-start gap-2 rounded-md border border-alert-100 bg-alert-50 px-3 py-2.5 text-[13px] text-alert-700">
              <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" /> {createError}
            </p>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={creating}>
              {creating ? <Spinner className="border-ink-400 border-t-cream" /> : <FolderPlus className="h-4 w-4" />}
              Create
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
