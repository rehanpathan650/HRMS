import { PageHeader } from "@/components/shared/page-header";
import { ReportsView } from "@/components/admin/reports-view";

export const metadata = { title: "Reports" };

export default function ReportsPage() {
  return (
    <div className="grid gap-6">
      <PageHeader title="Reports" description="Daily, weekly and monthly reports across attendance, hours and leave. Export to CSV or Excel." />
      <ReportsView />
    </div>
  );
}
