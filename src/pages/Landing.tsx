import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  BookOpenCheck,
  Compass,
  EyeOff,
  GraduationCap,
  Layers,
  LineChart,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";

const LADDER = [
  {
    step: "I",
    gate: "Low confidence",
    count: "1 miss",
    title: "Flagged quietly",
    body: "A single miss never triggers an intervention. It is recorded and appears — silently — on the teacher's heatmap.",
    tone: "border-line bg-cream",
    chip: "bg-ink-100 text-ink-600",
  },
  {
    step: "II",
    gate: "Medium confidence",
    count: "2–3 misses",
    title: "Diagnostic follow-up",
    body: "The pattern is still provisional. The student is served one clarifying question that probes the same concept from another angle.",
    tone: "border-brass-300 bg-brass-50",
    chip: "bg-brass-100 text-brass-700",
  },
  {
    step: "III",
    gate: "High confidence",
    count: "4+ misses",
    title: "Remedial + retest",
    body: "Only now does the system interrupt: a short, statically authored concept reset, immediately followed by a retest question.",
    tone: "border-alert-500/40 bg-alert-50",
    chip: "bg-alert-100 text-alert-700",
  },
];

const PRINCIPLES = [
  {
    icon: ShieldCheck,
    title: "No black-box grading",
    body: "Zero generative AI in the diagnostic path. Every inference traces back to a human-authored, pre-tagged question.",
  },
  {
    icon: Layers,
    title: "Pre-verified question bank",
    body: "Each distractor in the bank is tagged to a specific misconception by educators, aligned to NCERT Class 9 chapters.",
  },
  {
    icon: EyeOff,
    title: "Labels stay with teachers",
    body: "Students see encouragement, never a diagnosis. Misconception tags are strictly teacher-facing instrumentation.",
  },
];

export default function Landing() {
  const { profile } = useAuth();
  const navigate = useNavigate();

  const continuePath = profile?.role === "teacher" ? "/t/dashboard" : "/s/practice";

  return (
    <div className="min-h-dvh bg-paper">
      {/* Top bar */}
      <header className="border-b border-line bg-cream/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-ink-900 font-display text-[17px] font-semibold text-brass-400">
              त
            </div>
            <div>
              <p className="font-display text-[16.5px] font-semibold leading-none text-ink-900">
                Tattva Bodh
              </p>
              <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-300">
                तत्त्व बोध · Diagnostic Learning
              </p>
            </div>
          </div>
          <nav className="flex items-center gap-1.5">
            {profile ? (
              <button
                onClick={() => navigate(continuePath)}
                className="inline-flex items-center gap-2 rounded-md bg-ink-900 px-4 py-2 text-[13px] font-medium text-cream transition-colors hover:bg-ink-800"
              >
                Continue to your portal <ArrowRight className="h-3.5 w-3.5" />
              </button>
            ) : (
              <>
                <Link
                  to="/auth/student"
                  className="rounded-md px-3.5 py-2 text-[13px] font-medium text-ink-600 transition-colors hover:bg-ink-100/50 hover:text-ink-900"
                >
                  Student sign in
                </Link>
                <Link
                  to="/auth/teacher"
                  className="rounded-md bg-ink-900 px-4 py-2 text-[13px] font-medium text-cream transition-colors hover:bg-ink-800"
                >
                  Teacher sign in
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="paper-grain border-b border-line">
        <div className="mx-auto max-w-6xl px-6 pb-16 pt-16 md:pb-20 md:pt-24">
          <p className="label-caps mb-5 text-brass-600">
            NCERT Class 9 · Mathematics · Science · Social Science · English
          </p>
          <h1 className="max-w-3xl font-display text-[40px] font-medium leading-[1.08] tracking-[-0.015em] text-ink-900 md:text-[56px]">
            Diagnose the <em className="font-medium italic text-brass-700">misconception</em>,
            <br className="hidden md:block" /> not just the mistake.
          </h1>
          <p className="mt-6 max-w-2xl text-[15.5px] leading-relaxed text-ink-500">
            Tattva Bodh is a diagnostic practice platform. Every wrong answer maps to a
            teacher-verified misconception tag; patterns only escalate after repeated,
            confident evidence — so teachers see <span className="font-semibold text-ink-800">why</span> a
            class is stuck, and students get help without ever being labelled.
          </p>

          {/* Entry cards */}
          <div className="mt-12 grid gap-4 md:grid-cols-2">
            <Link
              to="/auth/teacher"
              className="group relative overflow-hidden rounded-lg border border-ink-900 bg-ink-900 p-6 shadow-lifted transition-transform duration-200 hover:-translate-y-0.5"
            >
              <div className="paper-grain absolute inset-0 opacity-[0.35]" />
              <div className="relative">
                <div className="flex items-center justify-between">
                  <GraduationCap className="h-6 w-6 text-brass-300" strokeWidth={1.6} />
                  <ArrowRight className="h-5 w-5 text-ink-300 transition-transform duration-200 group-hover:translate-x-1 group-hover:text-brass-300" />
                </div>
                <h2 className="mt-8 font-display text-[24px] font-semibold text-cream">
                  I'm a Teacher
                </h2>
                <p className="mt-2 max-w-sm text-[13.5px] leading-relaxed text-ink-300">
                  Open a classroom, issue student login codes, and watch a live misconception
                  heatmap form as your class practises.
                </p>
                <div className="mt-6 flex flex-wrap gap-2">
                  {["Heatmap", "Question bank", "Roster & codes", "Doubts inbox"].map((t) => (
                    <span
                      key={t}
                      className="rounded-full border border-ink-700 px-2.5 py-1 text-[11px] font-medium tracking-wide text-ink-200"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            </Link>

            <Link
              to="/auth/student"
              className="group relative overflow-hidden rounded-lg border border-line-strong bg-cream p-6 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lifted"
            >
              <div className="relative">
                <div className="flex items-center justify-between">
                  <BookOpenCheck className="h-6 w-6 text-brass-600" strokeWidth={1.6} />
                  <ArrowRight className="h-5 w-5 text-ink-300 transition-transform duration-200 group-hover:translate-x-1 group-hover:text-brass-600" />
                </div>
                <h2 className="mt-8 font-display text-[24px] font-semibold text-ink-900">
                  I'm a Student
                </h2>
                <p className="mt-2 max-w-sm text-[13.5px] leading-relaxed text-ink-500">
                  Sign in with the code your teacher gave you. Practise chapter-wise questions,
                  track your own growth, ask doubts, and never miss a deadline.
                </p>
                <div className="mt-6 flex flex-wrap gap-2">
                  {["Guided practice", "My analysis", "Assignments", "Ask my teacher"].map((t) => (
                    <span
                      key={t}
                      className="rounded-full border border-line-strong bg-paper px-2.5 py-1 text-[11px] font-medium tracking-wide text-ink-500"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            </Link>
          </div>
        </div>
      </section>

      {/* Escalation ladder */}
      <section className="border-b border-line bg-cream">
        <div className="mx-auto max-w-6xl px-6 py-16 md:py-20">
          <div className="mb-10 flex items-start justify-between gap-6">
            <div>
              <p className="label-caps mb-3 text-brass-600">Confidence-gated escalation</p>
              <h2 className="max-w-xl font-display text-[30px] font-semibold leading-tight tracking-[-0.01em] text-ink-900">
                One wrong answer is noise. <span className="italic text-ink-600">A pattern is a signal.</span>
              </h2>
            </div>
            <Compass className="mt-2 hidden h-8 w-8 shrink-0 text-line-strong md:block" strokeWidth={1.4} />
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {LADDER.map((rung) => (
              <div key={rung.step} className={`rounded-lg border p-6 shadow-card ${rung.tone}`}>
                <div className="flex items-center justify-between">
                  <span className="font-display text-[26px] font-semibold text-ink-300">
                    {rung.step}
                  </span>
                  <span className={`rounded-full px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-[0.1em] ${rung.chip}`}>
                    {rung.count}
                  </span>
                </div>
                <p className="label-caps mt-5">{rung.gate}</p>
                <h3 className="mt-1.5 font-display text-[18.5px] font-semibold text-ink-900">
                  {rung.title}
                </h3>
                <p className="mt-2 text-[13.5px] leading-relaxed text-ink-500">{rung.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Principles */}
      <section className="bg-paper">
        <div className="mx-auto max-w-6xl px-6 py-16 md:py-20">
          <div className="grid gap-10 md:grid-cols-[1fr_1.6fr]">
            <div>
              <p className="label-caps mb-3 text-brass-600">Deterministic by design</p>
              <h2 className="font-display text-[28px] font-semibold leading-tight tracking-[-0.01em] text-ink-900">
                Every diagnosis can be traced to a tagged question.
              </h2>
              <p className="mt-4 text-[14px] leading-relaxed text-ink-500">
                Built for teachers who want evidence, not vibes — and for students who deserve
                encouragement instead of labels.
              </p>
              <div className="mt-6 flex items-center gap-2 text-ink-300">
                <LineChart className="h-4 w-4" />
                <span className="text-[12px] font-medium tracking-wide">
                  Live heatmaps for teachers · Plain-language growth for students
                </span>
              </div>
            </div>
            <ul className="space-y-5">
              {PRINCIPLES.map((p) => (
                <li key={p.title} className="flex gap-4 border-b border-line pb-5 last:border-0">
                  <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-line bg-cream shadow-card">
                    <p.icon className="h-4.5 h-[18px] w-[18px] text-ink-700" strokeWidth={1.7} />
                  </div>
                  <div>
                    <h3 className="text-[15px] font-semibold text-ink-900">{p.title}</h3>
                    <p className="mt-1 text-[13.5px] leading-relaxed text-ink-500">{p.body}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-line bg-ink-900">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-8">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-ink-800 font-display text-[14px] font-semibold text-brass-400">
              त
            </div>
            <p className="text-[12.5px] text-ink-300">
              Tattva Bodh — <span className="text-ink-400">tattva</span> (fundamental principle) ·{" "}
              <span className="text-ink-400">bodh</span> ( deep understanding )
            </p>
          </div>
          <div className="flex items-center gap-4 text-[12px] font-medium text-ink-300">
            <span className="inline-flex items-center gap-1.5">
              <UserRound className="h-3.5 w-3.5" /> Students join by teacher-issued code only
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
