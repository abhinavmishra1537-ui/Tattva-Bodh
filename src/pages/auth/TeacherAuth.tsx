import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { CircleAlert, GraduationCap } from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../contexts/AuthContext";
import { Button, Field, Input, Spinner } from "../../components/ui";

export default function TeacherAuth() {
  const navigate = useNavigate();
  const { session, refreshProfile } = useAuth();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (session) {
    return <Navigate to="/t/dashboard" replace />;
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      if (mode === "signup") {
        const { data, error: signUpErr } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        });
        if (signUpErr) throw signUpErr;
        const user = data.user;
        if (!user) throw new Error("Sign-up did not return a user. Try logging in.");

        const { error: profileErr } = await supabase.from("profiles").upsert({
          id: user.id,
          role: "teacher",
          full_name: fullName.trim() || "Teacher",
          email: email.trim(),
        });
        if (profileErr) throw profileErr;

        if (!data.session) {
          setNotice("Account created. If your project requires email confirmation, confirm and then log in.");
          setMode("login");
          return;
        }
        await refreshProfile();
        navigate("/t/dashboard", { replace: true });
      } else {
        const { error: signInErr } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (signInErr) throw signInErr;
        navigate("/t/dashboard", { replace: true });
      }
    } catch (err) {
      const msg = (err as Error).message ?? "Something went wrong.";
      setError(
        msg.toLowerCase().includes("already registered")
          ? "That email is already registered — switch to Log in."
          : msg
      );
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
          <p className="label-caps mb-4 text-brass-400">Teacher Portal</p>
          <h2 className="max-w-md font-display text-[34px] font-medium leading-[1.15] text-cream">
            See the misconception behind every wrong answer.
          </h2>
          <p className="mt-4 max-w-sm text-[14px] leading-relaxed text-ink-300">
            Create a classroom, issue student login codes, and let a live heatmap show you where
            understanding breaks down — chapter by chapter.
          </p>
        </div>
        <p className="text-[12px] text-ink-400">
          Deterministic diagnosis · Pre-verified NCERT Class 9 bank
        </p>
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
              <GraduationCap className="h-5 w-5 text-ink-700" strokeWidth={1.7} />
            </div>
            <div>
              <h1 className="font-display text-[24px] font-semibold leading-tight text-ink-900">
                {mode === "login" ? "Welcome back, teacher" : "Create your teacher account"}
              </h1>
              <p className="mt-0.5 text-[13px] text-ink-400">
                {mode === "login"
                  ? "Sign in to your classroom workspace."
                  : "Open sign-up for teachers — students join by code only."}
              </p>
            </div>
          </div>

          <div className="surface p-6">
            {/* Mode switch */}
            <div className="mb-6 grid grid-cols-2 rounded-md border border-line bg-paper p-1">
              {(["login", "signup"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    setMode(m);
                    setError(null);
                    setNotice(null);
                  }}
                  className={`rounded-[5px] py-2 text-[13px] font-semibold transition-all duration-150 ${
                    mode === m
                      ? "bg-ink-900 text-cream shadow-sm"
                      : "text-ink-500 hover:text-ink-800"
                  }`}
                >
                  {m === "login" ? "Log in" : "Sign up"}
                </button>
              ))}
            </div>

            <form onSubmit={submit} className="space-y-4">
              {mode === "signup" && (
                <Field label="Full name">
                  <Input
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g. Meera Krishnan"
                    autoComplete="name"
                  />
                </Field>
              )}
              <Field label="Email">
                <Input
                  required
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@school.edu"
                  autoComplete="email"
                />
              </Field>
              <Field label="Password" hint={mode === "signup" ? "At least 6 characters." : undefined}>
                <Input
                  required
                  type="password"
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                />
              </Field>

              {error && (
                <p className="flex items-start gap-2 rounded-md border border-alert-100 bg-alert-50 px-3 py-2.5 text-[13px] text-alert-700">
                  <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" /> {error}
                </p>
              )}
              {notice && (
                <p className="rounded-md border border-pine-100 bg-pine-50 px-3 py-2.5 text-[13px] text-pine-700">
                  {notice}
                </p>
              )}

              <Button type="submit" disabled={busy} className="w-full">
                {busy ? <Spinner className="border-ink-400 border-t-cream" /> : mode === "login" ? "Log in" : "Create account"}
              </Button>
            </form>
          </div>

          <p className="mt-6 text-center text-[13px] text-ink-400">
            Student?{" "}
            <Link to="/auth/student" className="font-semibold text-brass-700 hover:text-brass-600">
              Sign in with your class code
            </Link>
          </p>
          <p className="mt-2 text-center text-[12.5px]">
            <Link to="/" className="text-ink-400 hover:text-ink-700">
              ← Back to overview
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
