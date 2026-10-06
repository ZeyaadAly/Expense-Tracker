import type { Metadata } from "next";
import { PrototypePage } from "../../../features/v2/pages";
export const metadata: Metadata = {
  title: "transactions · Expense Tracker V2",
};
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>;
}) {
  const query = await searchParams;
  return <PrototypePage route="transactions" initialState={query.state} />;
}
