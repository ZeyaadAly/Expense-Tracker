import type { Metadata } from "next";
import { PrototypePage } from "../../../features/v2/pages";
export const metadata: Metadata = { title: "analytics · Expense Tracker V2" };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>;
}) {
  const query = await searchParams;
  return <PrototypePage route="analytics" initialState={query.state} />;
}
