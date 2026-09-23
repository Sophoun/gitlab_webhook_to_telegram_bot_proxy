import { Suspense } from "react";
import { Sidebar } from "../../components/dashboard/Sidebar";
import { TrackerPage } from "../../components/dashboard/review/TrackerPage";

export default function ReviewTrackerPage() {
  return (
    <Suspense>
    <Sidebar>
      <Suspense>
        <TrackerPage />
      </Suspense>
    </Sidebar>
    </Suspense>
  );
}
