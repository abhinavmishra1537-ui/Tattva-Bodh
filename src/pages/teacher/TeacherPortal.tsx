import { useEffect, useMemo, useState } from "react";
import {
  CircleAlert,
  FileText,
  LayoutDashboard,
  LibraryBig,
  MessageCircleQuestion,
  UsersRound,
} from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import { ClassroomProvider, useClassrooms } from "../../contexts/ClassroomContext";
import { AppShell, type ShellTab } from "../../components/layout/AppShell";
import { Select } from "../../components/ui";
import TeacherDashboard from "./Dashboard";
import QuestionBank from "./QuestionBank";
import TeacherAssignments from "./Assignments";
import Roster from "./Roster";
import Doubts from "./Doubts";

function ClassroomSwitcher() {
  const { classrooms, selectedId, select, loading, error, refresh } = useClassrooms();

  if (error) {
    return (
      <div className="rounded-md border border-alert-100 bg-alert-50 px-3 py-2.5">
        <p className="flex items-start gap-1.5 text-[11.5px] leading-snug text-alert-700">
          <CircleAlert className="mt-px h-3.5 w-3.5 shrink-0" />
          <span>
            Classroom list failed to load: <span className="font-semibold">{error}</span>
          </span>
        </p>
        <button
          onClick={() => refresh()}
          className="mt-1.5 text-[11.5px] font-semibold text-alert-700 underline underline-offset-2 hover:text-alert-600"
        >
          Retry
        </button>
      </div>
    );
  }
  if (loading) {
    return <div className="h-10 animate-pulse rounded-md bg-paper-deep" />;
  }
  if (classrooms.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-line-strong px-3 py-2.5 text-[12px] leading-relaxed text-ink-400">
        No classroom yet — create one in <span className="font-semibold text-ink-600">Roster & Codes</span>.
      </p>
    );
  }
  return (
    <div>
      <p className="label-caps mb-1.5">Classroom</p>
      <Select
        value={selectedId ?? ""}
        onChange={(e) => select(e.target.value)}
        className="py-2 text-[13px] font-medium"
      >
        {classrooms.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </Select>
    </div>
  );
}

function TeacherShell() {
  const { classrooms } = useClassrooms();
  const [openDoubts, setOpenDoubts] = useState(0);

  useEffect(() => {
    if (classrooms.length === 0) {
      setOpenDoubts(0);
      return;
    }
    let cancelled = false;
    const fetchCount = async () => {
      const { count, error } = await supabase
        .from("doubts")
        .select("id", { count: "exact", head: true })
        .in(
          "classroom_id",
          classrooms.map((c) => c.id)
        )
        .eq("status", "open");
      if (!cancelled && !error) setOpenDoubts(count ?? 0);
    };
    fetchCount();
    const t = window.setInterval(fetchCount, 45_000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, [classrooms]);

  const tabs = useMemo<ShellTab[]>(
    () => [
      { key: "dashboard", label: "Dashboard", icon: LayoutDashboard, path: "/t/dashboard", element: <TeacherDashboard /> },
      { key: "bank", label: "Question Bank", icon: LibraryBig, path: "/t/bank", element: <QuestionBank /> },
      { key: "assignments", label: "Assignments", icon: FileText, path: "/t/assignments", element: <TeacherAssignments /> },
      { key: "roster", label: "Roster & Codes", icon: UsersRound, path: "/t/roster", element: <Roster /> },
      {
        key: "doubts",
        label: "Doubts Inbox",
        icon: MessageCircleQuestion,
        path: "/t/doubts",
        element: <Doubts />,
        alert: openDoubts > 0,
      },
    ],
    [openDoubts]
  );

  return <AppShell tabs={tabs} roleLabel="Teacher Portal" contextBar={<ClassroomSwitcher />} />;
}

export default function TeacherPortal() {
  return (
    <ClassroomProvider>
      <TeacherShell />
    </ClassroomProvider>
  );
}
