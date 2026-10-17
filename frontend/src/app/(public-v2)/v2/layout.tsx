import type { Metadata } from "next";
import type { ReactNode } from "react";
import "../../v2/v2.css";
import "../../v2/prototype.css";
import { AuthProvider } from "../../../lib/auth/auth-provider";
import { ProtectedBoundary } from "../../../features/v2/protected-boundary";

export const metadata: Metadata = {
  title: "Expense Tracker V2",
  robots: { index: false, follow: false },
};

export default function PublicV2Layout({ children }: { children: ReactNode }) {
  return <div className="v2-theme"><AuthProvider><ProtectedBoundary>{children}</ProtectedBoundary></AuthProvider></div>;
}
