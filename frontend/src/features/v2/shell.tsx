"use client";
import Link from "next/link";
import { useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { SidebarSection } from "../../components/v2/app-shell";
import { Button, Drawer } from "../../components/v2/primitives";
import { Icon, type IconName } from "../../components/v2/icon";
import { usePrototype } from "./prototype-context";
import { useAuth } from "../../lib/auth/auth-provider";
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
export function PrototypeShell({ children, liveAccounts = false }: { children: ReactNode; liveAccounts?:boolean }) {
  const path = usePathname();
  const { session } = usePrototype();
  const { user, signOut } = useAuth();
  const router = useRouter();
  const name = user?.email ?? "Signed-in user";
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
  const nav = (
    <div className="v2-sidebar-content">
      <Link href="/v2/dashboard" className="v2-brand">
        <span className="v2-mark">
          e<span>.</span>
        </span>
        <span>
          Expense Tracker<small>Your financial workspace</small>
        </span>
      </Link>
      <nav aria-label="Main navigation">
        {navigation.map((group) => (
          <SidebarSection key={group.title} label={group.title}>
            {group.items.map(([label, icon]) => (
              <Link
                onClick={() => setOpen(false)}
                key={label}
                className={`v2-nav-item ${path === `/v2/${label.toLowerCase()}` ? "is-active" : ""}`}
                aria-current={
                  path === `/v2/${label.toLowerCase()}` ? "page" : undefined
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
          <span>EGP · Africa/Cairo</span>
          <Button variant="text" style={{ color: "inherit", background: "transparent", padding: 0 }} loading={signingOut} onClick={logout}>
            Sign out
          </Button>
        </div>
      </div>
    </div>
  );
  return (
    <div className="v2-shell p4-workspace">
      <a className="v2-skip" href="#v2-main">
        Skip to content
      </a>
      <aside className="v2-sidebar">{nav}</aside>
      <header className="v2-mobile-header">
        <Link href="/v2/dashboard">
          Expense Tracker <span>V2</span>
        </Link>
        <Button
          variant="ghost"
          aria-label="Open navigation"
          onClick={() => setOpen(true)}
        >
          <Icon name="menu" />
        </Button>
      </header>
      <main id="v2-main" className="v2-main" tabIndex={-1}>
        <p className="p4-prototype-label">{liveAccounts ? "Development · connected accounts" : "Prototype · fictional data"}</p>
        {logoutError && <FeedbackBanner tone="error" title={logoutError} />}
        {liveAccounts || session ? (
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
    </div>
  );
}
