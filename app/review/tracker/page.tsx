import { Suspense } from "react";
import { Sidebar } from "../../components/dashboard/Sidebar";
import { TrackerPage } from "../../components/dashboard/review/TrackerPage";

export default function ReviewTrackerPage() {
  return (
    <Sidebar>
      <Suspense>
        <TrackerPage />
      </Suspense>
    </Sidebar>
  );
}
