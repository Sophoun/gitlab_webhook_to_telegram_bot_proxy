import { Suspense } from "react";
import { Sidebar } from "../../components/dashboard/Sidebar";
import { TeamPage } from "../../components/dashboard/review/TeamPage";

export default function ReviewTeamPage() {
  return (
    <Suspense>
    <Sidebar>
      <Suspense>
        <TeamPage />
      </Suspense>
    </Sidebar>
    </Suspense>
  );
}
