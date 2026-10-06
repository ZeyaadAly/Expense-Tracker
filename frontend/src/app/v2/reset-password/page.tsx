import type { Metadata } from "next";
import { AuthPage } from "../../../features/v2/auth";
export const metadata: Metadata = {
  title: "reset-password · Expense Tracker V2",
};
export default function Page() {
  return <AuthPage route="reset-password" />;
}
