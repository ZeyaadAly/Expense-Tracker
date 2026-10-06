"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "../../lib/auth/auth-provider";
import { protectedPaths, safeNext } from "../../lib/auth/redirects";
import { usableSession } from "../../lib/auth/session-store";
import { PrototypeProvider } from "./prototype-context";
import { Skeleton } from "../../components/v2/primitives";
export function ProtectedBoundary({ children }: { children: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const { session, loading, epoch, expired } = useAuth();
  const protectedRoute = protectedPaths.has(path);
  const ready = !loading && usableSession(session);
  const previousUser = useRef<string | null>(null);
  useEffect(() => {
    if (!protectedRoute) return;
    if (!loading && !ready) {
      const next = safeNext(path + window.location.search);
      router.replace(`/v2/login?next=${encodeURIComponent(next)}${expired ? "&reason=expired" : ""}`);
    } else if (ready && previousUser.current !== session!.user.id) {
      document.getElementById("v2-main")?.focus();
    }
    previousUser.current = ready ? session!.user.id : null;
  }, [path, protectedRoute, ready, loading, session, expired, router]);
  if (!protectedRoute) return children;
  if (!ready) return <main className="v2-main"><h1>Preparing your workspace</h1><p role="status">{loading ? "Checking your session…" : expired ? "Your session expired. Sign in again." : "Returning to sign in…"}</p><Skeleton variant="chart" /></main>;
  // Unmount fixture state on sign-out/user changes; token refresh keeps it intact.
  return <PrototypeProvider key={`${session!.user.id}:${epoch}`}>{children}</PrototypeProvider>;
}
