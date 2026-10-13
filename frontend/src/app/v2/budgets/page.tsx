import type { Metadata } from "next";
import { BudgetsPage } from "../../../features/v2/budgets-page";
export const metadata: Metadata = { title: "budgets · Expense Tracker V2" };
export default function Page(){return <BudgetsPage/>;}
