"use client";
import Link from "../../components/v2/route-link";
import { NavigationPendingContext } from "../../components/v2/route-link";
import { RouteSkeleton } from "../../components/v2/route-skeleton";
import { useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { SidebarSection } from "../../components/v2/app-shell";
import { Button, Drawer } from "../../components/v2/primitives";
import { Icon, type IconName } from "../../components/v2/icon";
import { BrandMark } from "../../components/v2/brand";



import { useAuth } from "../../lib/auth/auth-provider";
import { useOptionalProfile } from "../../lib/auth/profile-context";
import { useRouter } from "next/navigation";
import { FeedbackBanner } from "../../components/v2/primitives";
const navigation: { title: string; items: [string, IconName][] }[] = [
  { title: "Overview", items: [["Dashboard", "dashboard"]] },
  {
    title: "Money",
    items: [
      ["Transactions", "ledger"],
      ["Accounts", "accounts"],
      ["Recurring", "recurring"],
    ],
  },
  {
    title: "Planning",
    items: [
      ["Budgets", "budgets"],
      ["Goals", "goals"],
    ],
  },
  { title: "Insights", items: [["Analytics", "analytics"]] },
  { title: "Account", items: [["Settings", "settings"]] },
];
export function PrototypeShell({ children, liveAccounts = false, liveTransactions = false, liveRecurring = false, liveDashboard = false, liveAnalytics = false, liveBudgets = false, liveGoals = false, liveSettings = false }: { children: ReactNode; liveAccounts?:boolean; liveTransactions?:boolean; liveRecurring?:boolean; liveDashboard?:boolean; liveAnalytics?:boolean; liveBudgets?:boolean; liveGoals?:boolean; liveSettings?:boolean }) {
  const path = usePathname();
  const { user, signOut } = useAuth();
  const profile = useOptionalProfile()?.profile;
  const router = useRouter();
  const name = profile?.displayName || user?.email || "Signed-in user";
  const [signingOut, setSigningOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const logoutPending = useRef(false);
  async function logout() {
    if (logoutPending.current) return;
    logoutPending.current = true;
    setSigningOut(true);
    const result = await signOut();
    if (result.error) { setLogoutError(result.error.message); setSigningOut(false); logoutPending.current = false; }
    else router.replace("/v2/login");
  }
  const [open, setOpen] = useState(false);
  const [navigating, setNavigating] = useState(false);
  const nav = (
    <div className="v2-sidebar-content">
      <Link href="/v2/dashboard" className="v2-brand">
        <BrandMark />
        <span>
          Expense Tracker<small>Personal finance</small>
        </span>
      </Link>
      <nav aria-label="Main navigation">
        {navigation.map((group) => (
          <SidebarSection key={group.title} label={group.title}>
            {group.items.map(([label, icon]) => (
              <Link
                onClick={() => setOpen(false)}
                onNavigate={() => { if (path !== `/v2/${label.toLowerCase()}`) setNavigating(true); }}
                key={label}
                className={`v2-nav-item ${path === `/v2/${label.toLowerCase()}` || (label === "Accounts" && path.startsWith("/v2/accounts/")) ? "is-active" : ""}`}
                aria-current={
                  path === `/v2/${label.toLowerCase()}` || (label === "Accounts" && path.startsWith("/v2/accounts/")) ? "page" : undefined
                }
                href={`/v2/${label.toLowerCase()}`}
              >
                <Icon name={icon} />
                {label}
              </Link>
            ))}
          </SidebarSection>
        ))}
      </nav>
      <div className="v2-user">
        <span className="v2-avatar" aria-hidden="true">
          {name.slice(0, 2).toUpperCase()}
        </span>
        <div>
          <strong>{name}</strong>
          <span>EGP · Cairo</span>
          <Button variant="text" loading={signingOut} onClick={logout}>
            Sign out
          </Button>
        </div>
      </div>
    </div>
  );
  return (
    <NavigationPendingContext value={setNavigating}><div className="v2-shell p4-workspace">
      <a className="v2-skip" href="#v2-main">
        Skip to content
      </a>
      <aside className="v2-sidebar">{nav}</aside>
      <header className="v2-mobile-header">
        <Link href="/v2/dashboard" className="v2-brand">
          <BrandMark /><span>Expense Tracker</span>
        </Link>
        <Button
          variant="ghost"
          aria-label="Open navigation"
          aria-expanded={open}
          onClick={() => setOpen(true)}
        >
          <Icon name="menu" />
        </Button>
      </header>
      <main id="v2-main" className="v2-main" tabIndex={-1} data-route-pending={navigating} aria-busy={navigating || undefined}>
        {navigating && <RouteSkeleton />}
        {logoutError && <FeedbackBanner tone="error" title={logoutError} />}
        {liveAccounts || liveTransactions || liveRecurring || liveDashboard || liveAnalytics || liveBudgets || liveGoals || liveSettings || user ? (
          children
        ) : (
          <section className="p4-panel">
            <h1>Your session has ended</h1>
            <p>Sign in to return to your workspace.</p>
            <Link className="v2-button v2-button--primary" href="/v2/login">
              Sign in
            </Link>
          </section>
        )}
      </main>
      {open && (
        <Drawer
          title="Navigation"
          description="Explore your financial workspace."
          onClose={() => setOpen(false)}
        >
          {nav}
        </Drawer>
      )}
    </div></NavigationPendingContext>
  );
}
