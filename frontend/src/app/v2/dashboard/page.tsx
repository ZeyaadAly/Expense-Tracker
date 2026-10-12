import type { Metadata } from "next";
import { DashboardPage } from "../../../features/v2/dashboard-page";
export const metadata: Metadata = { title: "dashboard · Expense Tracker V2" };
export default function Page() {
  return <DashboardPage />;
}
