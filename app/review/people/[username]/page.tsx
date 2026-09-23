import { Suspense } from "react";
import { Sidebar } from "../../../components/dashboard/Sidebar";
import { PersonProfile } from "../../../components/dashboard/review/PersonProfile";

export default async function PersonPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  return (
    <Suspense>
    <Sidebar>
      <PersonProfile username={decodeURIComponent(username)} />
    </Sidebar>
    </Suspense>
  );
}
