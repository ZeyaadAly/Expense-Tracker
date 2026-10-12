import type { Metadata } from "next";
import { RecurringPage } from "../../../features/v2/recurring-page";
export const metadata: Metadata = { title: "recurring · Expense Tracker V2" };
export default function Page() { return <RecurringPage />; }
