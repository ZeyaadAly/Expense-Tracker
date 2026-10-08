"use client";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "../../lib/auth/auth-provider";
import { isProtectedPath, safeNext } from "../../lib/auth/redirects";
import { usableSession } from "../../lib/auth/session-store";
import { PrototypeProvider } from "./prototype-context";
import { Skeleton, Button, FeedbackBanner } from "../../components/v2/primitives";
import { createProfileClient } from "../../lib/api/profile";
import { createProfileStore } from "../../lib/auth/profile-store";
import { profileDrafts } from "../../lib/auth/profile-draft";

function ProfileGate({userId, children}: {userId:string; children:ReactNode}) {
  const router=useRouter();
  const {invalidateSession,signOut}=useAuth();
  const [store]=useState(()=>createProfileStore(userId,createProfileClient(userId),profileDrafts));
  const state=useSyncExternalStore(store.subscribe,store.getSnapshot,store.getServerSnapshot);
  useEffect(()=>store.start(),[store]);
  useEffect(()=>{
    if(state.error?.auth) { invalidateSession(); void signOut(); router.replace('/v2/login?reason=expired'); }
  },[state.error,router,invalidateSession,signOut]);
  useEffect(()=>{if(state.profile)document.getElementById('v2-main')?.focus();},[state.profile]);
  if(state.loading) return <main className="v2-main"><h1>Preparing your workspace</h1><p role="status">Preparing your profile…</p><Skeleton variant="chart" /></main>;
  if(state.error) return <main className="v2-main"><h1>Prepare your workspace</h1><FeedbackBanner tone="error" title={state.error.message} /><Button onClick={store.retry}>Retry</Button></main>;
  return children;
}
export function ProtectedBoundary({ children }: { children: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const { session, loading, epoch, expired } = useAuth();
  const protectedRoute = isProtectedPath(path);
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
  return <ProfileGate key={`${session!.user.id}:${epoch}`} userId={session!.user.id}>{path === '/v2/transactions' ? children : <PrototypeProvider>{children}</PrototypeProvider>}</ProfileGate>;
}
