import { PageHeader } from "@/components/shared/page-header";
import { ReportsView } from "@/components/admin/reports-view";

export const metadata = { title: "Attendance reports" };

export default function AttendanceReportsPage() {
  return (
    <div className="grid gap-6">
      <PageHeader title="Attendance reports" description="Use the Today, This week and This month presets for daily, weekly and monthly reports." />
      <ReportsView exclude={["leave"]} defaultPreset="today" />
    </div>
  );
}
