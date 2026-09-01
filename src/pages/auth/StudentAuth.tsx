import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { BookOpenCheck, CircleAlert, KeyRound } from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../contexts/AuthContext";
import { CODE_LENGTH, isValidCodeFormat, normalizeCode, studentEmailForCode } from "../../lib/utils";
import type { IssuedCredential } from "../../lib/types";
import { Button, Field, Input, Spinner } from "../../components/ui";

type Stage = "code" | "claim" | "returning";

export default function StudentAuth() {
  const navigate = useNavigate();
  const { session, refreshProfile } = useAuth();

  const [stage, setStage] = useState<Stage>("code");
  const [code, setCode] = useState("");
  const [credential, setCredential] = useState<IssuedCredential | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (session) {
    return <Navigate to="/s/practice" replace />;
  }

  /* Step 1 — look up the teacher-issued PERSONAL login code
     (issued_credentials.login_code). Unauthenticated read. */
  const lookup = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    // Canonicalise first: trim, uppercase, strip dashes/spaces.
    const normalised = normalizeCode(code);
    if (!isValidCodeFormat(normalised)) {
      setError(
        `Codes are exactly ${CODE_LENGTH} letters or numbers (for example XJD6K2). Check what your teacher gave you.`
      );
      return;
    }

    setBusy(true);
    try {
      // ilike = case-insensitive exact match, so stored codes in any casing match.
      const { data, error: lookupErr } = await supabase
        .from("issued_credentials")
        .select("*")
        .ilike("login_code", normalised)
        .maybeSingle();
      if (lookupErr) {
        console.error("[Tattva Bodh] login_code lookup failed:", lookupErr);
        throw new Error(
          "Couldn't verify that code just now. Check your connection, then try again."
        );
      }

      if (!data) {
        // Not a personal code — is it the CLASSROOM code by mistake?
        const { data: classroomRow } = await supabase
          .from("classrooms")
          .select("name")
          .ilike("join_code", normalised)
          .maybeSingle();
        if (classroomRow) {
          throw new Error(
            `That's the classroom code for ${classroomRow.name}, not your personal login code. Ask your teacher for the code issued against your name.`
          );
        }
        throw new Error(
          "That code isn't recognised. Check each character with your teacher — it may not have been issued yet."
        );
      }

      setCredential(data as IssuedCredential);
      setStage((data as IssuedCredential).is_used ? "returning" : "claim");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  /* Step 2a — first use: set a password, create the auth user, link everything. */
  const claim = async (e: FormEvent) => {
    e.preventDefault();
    if (!credential) return;
    if (password !== confirm) {
      setError("The two passwords don't match.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const email = studentEmailForCode(credential.login_code);

      let userId: string | null = null;
      const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({ email, password });

      if (signUpErr) {
        // The code may have been half-claimed earlier — try a straight sign-in.
        const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signInErr) throw signUpErr;
        userId = signInData.user?.id ?? null;
      } else {
        userId = signUpData.user?.id ?? null;
        if (!signUpData.session) {
          const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
            email,
            password,
          });
          if (signInErr) throw signInErr;
          userId = signInData.user?.id ?? userId;
        }
      }

      if (!userId) throw new Error("Couldn't create your account. Please try again.");

      const { error: profileErr } = await supabase.from("profiles").upsert({
        id: userId,
        role: "student",
        full_name: credential.student_name,
        email,
      });
      if (profileErr) throw profileErr;

      const { error: usedErr } = await supabase
        .from("issued_credentials")
        .update({ is_used: true })
        .eq("id", credential.id);
      if (usedErr) throw usedErr;

      const { data: existing } = await supabase
        .from("classroom_students")
        .select("id")
        .eq("classroom_id", credential.classroom_id)
        .eq("student_id", userId)
        .maybeSingle();
      if (!existing) {
        const { error: linkErr } = await supabase
          .from("classroom_students")
          .insert({ classroom_id: credential.classroom_id, student_id: userId });
        if (linkErr) throw linkErr;
      }

      await refreshProfile();
      navigate("/s/practice", { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  /* Step 2b — returning student: code + password sign-in. */
  const signIn = async (e: FormEvent) => {
    e.preventDefault();
    if (!credential) return;
    setError(null);
    setBusy(true);
    try {
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: studentEmailForCode(credential.login_code),
        password,
      });
      if (signInErr) {
        throw new Error("That password doesn't match this code. Ask your teacher if you've forgotten it.");
      }
      navigate("/s/practice", { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-dvh bg-paper">
      {/* Brand panel */}
      <div className="paper-grain hidden w-[42%] flex-col justify-between bg-ink-900 p-10 lg:flex">
        <Link to="/" className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-ink-800 font-display text-[16px] font-semibold text-brass-400">
            त
          </div>
          <span className="font-display text-[17px] font-semibold text-cream">Tattva Bodh</span>
        </Link>
        <div>
          <p className="label-caps mb-4 text-brass-400">Student Portal</p>
          <h2 className="max-w-md font-display text-[34px] font-medium leading-[1.15] text-cream">
            Practice that notices where you get stuck — and helps.
          </h2>
          <p className="mt-4 max-w-sm text-[14px] leading-relaxed text-ink-300">
            Your teacher gave you a personal code. Sign in, practise by chapter, and see your own
            progress grow — in plain words, never jargon.
          </p>
        </div>
        <p className="text-[12px] text-ink-400">Closed access · Entry by teacher-issued code only</p>
      </div>

      {/* Form */}
      <div className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-ink-900 font-display text-[16px] font-semibold text-brass-400">
              त
            </div>
            <span className="font-display text-[17px] font-semibold text-ink-900">Tattva Bodh</span>
          </div>

          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md border border-line bg-cream shadow-card">
              {stage === "code" ? (
                <KeyRound className="h-5 w-5 text-ink-700" strokeWidth={1.7} />
              ) : (
                <BookOpenCheck className="h-5 w-5 text-ink-700" strokeWidth={1.7} />
              )}
            </div>
            <div>
              <h1 className="font-display text-[24px] font-semibold leading-tight text-ink-900">
                {stage === "code"
                  ? "Enter your class code"
                  : stage === "claim"
                    ? `Welcome, ${credential?.student_name.split(" ")[0]}`
                    : `Welcome back, ${credential?.student_name.split(" ")[0]}`}
              </h1>
              <p className="mt-0.5 text-[13px] text-ink-400">
                {stage === "code"
                  ? `The ${CODE_LENGTH}-character code your teacher handed out.`
                  : stage === "claim"
                    ? "First time here — set a password to claim your seat."
                    : "Enter your password to continue."}
              </p>
            </div>
          </div>

          <div className="surface p-6">
            {stage === "code" ? (
              <form onSubmit={lookup} className="space-y-4">
                <Field
                  label="Your personal login code"
                  hint={`${CODE_LENGTH} letters or numbers, issued against your name. Not case-sensitive — dashes and spaces are ignored.`}
                >
                  <Input
                    required
                    value={code}
                    // Normalise as they type/paste so a pasted "eng-xjd6k2"
                    // can never be silently truncated or rejected on case.
                    onChange={(e) => {
                      setCode(normalizeCode(e.target.value).slice(0, CODE_LENGTH));
                      setError(null);
                    }}
                    placeholder="e.g. XJD6K2"
                    inputMode="text"
                    className="font-mono text-[16px] tracking-[0.3em] uppercase"
                    autoComplete="off"
                    autoCapitalize="characters"
                    spellCheck={false}
                  />
                </Field>
                {error && (
                  <p className="flex items-start gap-2 rounded-md border border-alert-100 bg-alert-50 px-3 py-2.5 text-[13px] text-alert-700">
                    <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" /> {error}
                  </p>
                )}
                <Button type="submit" disabled={busy || !isValidCodeFormat(code)} className="w-full">
                  {busy ? <Spinner className="border-ink-400 border-t-cream" /> : "Continue"}
                </Button>
              </form>
            ) : (
              <form onSubmit={stage === "claim" ? claim : signIn} className="space-y-4">
                <div className="flex items-center justify-between rounded-md border border-line bg-paper px-3.5 py-2.5">
                  <span className="text-[12.5px] text-ink-400">Signing in as</span>
                  <span className="font-mono text-[13px] font-semibold tracking-[0.2em] text-ink-800">
                    {credential?.login_code}
                  </span>
                </div>
                <Field label={stage === "claim" ? "Create a password" : "Password"} hint={stage === "claim" ? "At least 6 characters. Only you know this." : undefined}>
                  <Input
                    required
                    type="password"
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete={stage === "claim" ? "new-password" : "current-password"}
                  />
                </Field>
                {stage === "claim" && (
                  <Field label="Confirm password">
                    <Input
                      required
                      type="password"
                      minLength={6}
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      placeholder="••••••••"
                      autoComplete="new-password"
                    />
                  </Field>
                )}
                {error && (
                  <p className="flex items-start gap-2 rounded-md border border-alert-100 bg-alert-50 px-3 py-2.5 text-[13px] text-alert-700">
                    <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" /> {error}
                  </p>
                )}
                <Button type="submit" disabled={busy} className="w-full" variant={stage === "claim" ? "accent" : "primary"}>
                  {busy ? (
                    <Spinner className="border-ink-400 border-t-cream" />
                  ) : stage === "claim" ? (
                    "Claim my seat"
                  ) : (
                    "Log in"
                  )}
                </Button>
                <button
                  type="button"
                  onClick={() => {
                    setStage("code");
                    setCredential(null);
                    setPassword("");
                    setConfirm("");
                    setError(null);
                  }}
                  className="w-full pt-1 text-center text-[12.5px] font-medium text-ink-400 hover:text-ink-700"
                >
                  Use a different code
                </button>
              </form>
            )}
          </div>

          <p className="mt-6 text-center text-[13px] text-ink-400">
            Teacher?{" "}
            <Link to="/auth/teacher" className="font-semibold text-brass-700 hover:text-brass-600">
              Go to the teacher portal
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
