import type { Metadata } from "next";
import { TransactionsPage } from "../../../features/v2/transactions-page";
export const metadata: Metadata = {
  title: "transactions · Expense Tracker V2",
};
export default function Page() {
  return <TransactionsPage />;
}
