import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import "./v2.css";
import "./prototype.css";
import { AuthProvider } from "../../lib/auth/auth-provider";
import { ProtectedBoundary } from "../../features/v2/protected-boundary";
import { v2FontClasses } from "../../lib/v2-fonts";

export const metadata: Metadata = {
  title: "Expense Tracker V2",
  robots: { index: false, follow: false },
};

export default function V2Layout({ children }: { children: ReactNode }) {
  // Deployment flag opens the real session boundary, never fixture identity.
  if (process.env.NODE_ENV !== "development" && process.env.V2_APP_ENABLED !== "true") notFound();
  return (
    <div className={`v2-theme ${v2FontClasses}`}>
      <AuthProvider><ProtectedBoundary>{children}</ProtectedBoundary></AuthProvider>
    </div>
  );
}
