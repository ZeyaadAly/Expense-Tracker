import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import "./v2.css";
import "./prototype.css";
import { AuthProvider } from "../../lib/auth/auth-provider";
import { ProtectedBoundary } from "../../features/v2/protected-boundary";

export const metadata: Metadata = {
  title: "V2 Design System · Expense Tracker",
  robots: { index: false, follow: false },
};

export default function V2Layout({ children }: { children: ReactNode }) {
  // Fixture review must never become an unauthenticated production application.
  if (process.env.NODE_ENV !== "development") notFound();
  return (
    <div className="v2-theme">
      <AuthProvider><ProtectedBoundary>{children}</ProtectedBoundary></AuthProvider>
    </div>
  );
}
