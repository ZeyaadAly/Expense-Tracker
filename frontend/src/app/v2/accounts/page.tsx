import type { Metadata } from "next";
import { AccountsPage } from "../../../features/v2/accounts-page";
export const metadata: Metadata = { title: "accounts · Expense Tracker V2" };
export default function Page() { return <AccountsPage />; }
