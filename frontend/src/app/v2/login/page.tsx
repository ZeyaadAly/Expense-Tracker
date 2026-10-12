import type { Metadata } from "next";
import { AuthPage } from "../../../features/v2/auth";
export const metadata: Metadata = { title: "login · Expense Tracker V2" };
export default function Page() {
  return <AuthPage route="login" />;
}
