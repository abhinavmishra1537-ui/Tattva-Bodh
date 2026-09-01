import { useMemo } from "react";
import { CalendarClock, ChartColumn, NotebookPen } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { useStudentAssignments } from "../../hooks/useStudent";
import { AppShell, type ShellTab } from "../../components/layout/AppShell";
import StudentPractice from "./Practice";
import StudentAnalysis from "./Analysis";
import StudentAssignments from "./Assignments";

export default function StudentPortal() {
  const { profile } = useAuth();
  const { urgentCount } = useStudentAssignments(profile?.id);

  const tabs = useMemo<ShellTab[]>(
    () => [
      { key: "practice", label: "Practice", icon: NotebookPen, path: "/s/practice", element: <StudentPractice /> },
      { key: "analysis", label: "My Analysis", icon: ChartColumn, path: "/s/analysis", element: <StudentAnalysis /> },
      {
        key: "assignments",
        label: "Assignments",
        icon: CalendarClock,
        path: "/s/assignments",
        element: <StudentAssignments />,
        alert: urgentCount > 0,
      },
    ],
    [urgentCount]
  );

  return <AppShell tabs={tabs} roleLabel="Student Portal" />;
}
