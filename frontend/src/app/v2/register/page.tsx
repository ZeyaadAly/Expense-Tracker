import type { Metadata } from "next";
import { AuthPage } from "../../../features/v2/auth";
export const metadata: Metadata = { title: "register · Expense Tracker V2" };
export default function Page() {
  return <AuthPage route="register" />;
}
