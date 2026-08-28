import { Suspense } from "react";
import { Sidebar } from "../../components/dashboard/Sidebar";
import { PerformanceReview } from "../../components/dashboard/review/PerformanceReview";

export default function PerformancePage() {
  return (
    <Sidebar>
      <Suspense fallback={<div className="p-6 text-center text-muted-foreground">Loading...</div>}>
        <PerformanceReview />
      </Suspense>
    </Sidebar>
  );
}
