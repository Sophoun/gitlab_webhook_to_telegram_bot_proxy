import { Suspense } from "react";
import { Sidebar } from "../components/dashboard/Sidebar";
import { ReviewOverview } from "../components/dashboard/review/ReviewOverview";

export default function ReviewPage() {
  return (
    <Sidebar>
      <Suspense>
        <ReviewOverview />
      </Suspense>
    </Sidebar>
  );
}
