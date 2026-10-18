import type { Metadata } from "next";
import type { ReactNode } from "react";
import "../../v2/v2.css";
import "../../v2/prototype.css";
import "../../v2/refinement.css";
import { AuthProvider } from "../../../lib/auth/auth-provider";
import { ProtectedBoundary } from "../../../features/v2/protected-boundary";
import { v2FontClasses } from "../../../lib/v2-fonts";

export const metadata: Metadata = {
  title: "Expense Tracker V2",
  robots: { index: false, follow: false },
};

export default function PublicV2Layout({ children }: { children: ReactNode }) {
  return <div className={`v2-theme ${v2FontClasses}`}><AuthProvider><ProtectedBoundary>{children}</ProtectedBoundary></AuthProvider></div>;
}
