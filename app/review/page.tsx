"use client";

import { Sidebar } from "../components/dashboard/Sidebar";
import { ReviewHub } from "../components/dashboard/review/ReviewHub";

export default function ReviewPage() {
  return (
    <Sidebar>
      <ReviewHub />
    </Sidebar>
  );
}
