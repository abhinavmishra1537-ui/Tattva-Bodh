import { useEffect, useState, type ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { CircleAlert } from "lucide-react";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import type { Role } from "./lib/types";
import Landing from "./pages/Landing";
import TeacherAuth from "./pages/auth/TeacherAuth";
import StudentAuth from "./pages/auth/StudentAuth";
import TeacherPortal from "./pages/teacher/TeacherPortal";
import StudentPortal from "./pages/student/StudentPortal";
import { Button, PageLoading } from "./components/ui";

function RequireRole({ role, children }: { role: Role; children: ReactNode }) {
  const { session, profile, loading, signOut, refreshProfile } = useAuth();
  const [timedOut, setTimedOut] = useState(false);

  /* If a session exists but the profile row hasn't materialised, retry once,
     then don't spin forever. */
  useEffect(() => {
    setTimedOut(false);
    if (loading || !session || profile) return;
    refreshProfile();
    const t = window.setTimeout(() => setTimedOut(true), 7000);
    return () => window.clearTimeout(t);
  }, [loading, session, profile, refreshProfile]);

  if (loading) {
    return (
      <div className="flex h-dvh items-center justify-center bg-paper">
        <PageLoading label="Opening your workspace" />
      </div>
    );
  }

  if (!session) {
    return <Navigate to={role === "teacher" ? "/auth/teacher" : "/auth/student"} replace />;
  }

  if (!profile) {
    if (!timedOut) {
      return (
        <div className="flex h-dvh items-center justify-center bg-paper">
          <PageLoading label="Preparing your profile" />
        </div>
      );
    }
    return (
      <div className="flex h-dvh items-center justify-center bg-paper px-6">
        <div className="surface max-w-sm p-6 text-center">
          <CircleAlert className="mx-auto mb-3 h-6 w-6 text-alert-600" />
          <h2 className="font-display text-[17px] font-semibold text-ink-900">
            Profile didn't load
          </h2>
          <p className="mt-1.5 text-[13px] leading-relaxed text-ink-400">
            Your account exists but its profile row couldn't be read. This is usually a
            half-finished sign-up — try again, or sign out.
          </p>
          <div className="mt-4 flex justify-center gap-2">
            <Button variant="outline" size="sm" onClick={refreshProfile}>
              Retry
            </Button>
            <Button variant="danger" size="sm" onClick={signOut}>
              Sign out
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (profile.role !== role) {
    return <Navigate to={profile.role === "teacher" ? "/t/dashboard" : "/s/practice"} replace />;
  }

  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/auth/teacher" element={<TeacherAuth />} />
          <Route path="/auth/student" element={<StudentAuth />} />

          <Route path="/t" element={<Navigate to="/t/dashboard" replace />} />
          <Route
            path="/t/*"
            element={
              <RequireRole role="teacher">
                <TeacherPortal />
              </RequireRole>
            }
          />

          <Route path="/s" element={<Navigate to="/s/practice" replace />} />
          <Route
            path="/s/*"
            element={
              <RequireRole role="student">
                <StudentPortal />
              </RequireRole>
            }
          />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
