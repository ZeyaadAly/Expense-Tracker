"use client";

import { useState, type ReactNode } from "react";
import { Icon, type IconName } from "./icon";
import { Button, Drawer } from "./primitives";

const sections: {
  label: string;
  items: { label: string; icon: IconName; target: string }[];
}[] = [
  {
    label: "Overview",
    items: [{ label: "Dashboard", icon: "dashboard", target: "metrics" }],
  },
  {
    label: "Money",
    items: [
      { label: "Transactions", icon: "ledger", target: "ledger" },
      { label: "Accounts", icon: "accounts", target: "accounts" },
      { label: "Recurring", icon: "recurring", target: "recurring" },
    ],
  },
  {
    label: "Planning",
    items: [
      { label: "Budgets", icon: "budgets", target: "planning" },
      { label: "Goals", icon: "goals", target: "goals" },
    ],
  },
  {
    label: "Insights",
    items: [{ label: "Analytics", icon: "analytics", target: "charts" }],
  },
  {
    label: "Account",
    items: [{ label: "Settings", icon: "settings", target: "settings" }],
  },
];
export function UserArea() {
  return (
    <div className="v2-user">
      <span className="v2-avatar" aria-hidden="true">
        DS
      </span>
      <div>
        <strong>Design workspace</strong>
        <span>Static fixtures · no session</span>
      </div>
    </div>
  );
}
export function SidebarItem({
  label,
  icon,
  href,
  active,
  onClick,
}: {
  label: string;
  icon: IconName;
  href: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <a
      href={href}
      className={`v2-nav-item ${active ? "is-active" : ""}`}
      aria-current={active ? "location" : undefined}
      onClick={onClick}
    >
      <Icon name={icon} />
      <span>{label}</span>
    </a>
  );
}
export function SidebarSection({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="v2-nav-section">
      <p>{label}</p>
      {children}
    </div>
  );
}
export function Sidebar({
  active,
  onSelect,
}: {
  active: string;
  onSelect: (target: string) => void;
}) {
  return (
    <div className="v2-sidebar-content">
      <a className="v2-brand" href="#showcase-top">
        <span className="v2-mark" aria-hidden="true">
          e<span>.</span>
        </span>
        <span>
          Expense Tracker<small>V2 / Design system</small>
        </span>
      </a>
      <nav aria-label="Component section navigation">
        {sections.map((section) => (
          <SidebarSection key={section.label} label={section.label}>
            {section.items.map((item) => (
              <SidebarItem
                key={item.target}
                label={item.label}
                icon={item.icon}
                href={`#${item.target}`}
                active={active === item.target}
                onClick={() => onSelect(item.target)}
              />
            ))}
          </SidebarSection>
        ))}
      </nav>
      <UserArea />
    </div>
  );
}
export function MobileHeader({ onOpen }: { onOpen: () => void }) {
  return (
    <header className="v2-mobile-header">
      <a href="#showcase-top" className="v2-mobile-brand">
        Expense Tracker <span>V2</span>
      </a>
      <Button
        variant="ghost"
        aria-label="Open navigation"
        aria-haspopup="dialog"
        onClick={onOpen}
      >
        <Icon name="menu" />
      </Button>
    </header>
  );
}
export function MobileNavigationDrawer({
  active,
  onSelect,
  onClose,
}: {
  active: string;
  onSelect: (target: string) => void;
  onClose: () => void;
}) {
  return (
    <Drawer
      title="Navigation"
      description="Jump to a component section. These are fixture specimens, not application pages."
      onClose={onClose}
    >
      <Sidebar
        active={active}
        onSelect={(target) => {
          onSelect(target);
          onClose();
        }}
      />
    </Drawer>
  );
}
export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  eyebrow?: string;
}) {
  return (
    <header className="v2-page-header">
      <div>
        {eyebrow ? <p className="v2-eyebrow">{eyebrow}</p> : null}
        <h1>{title}</h1>
        {description ? <p className="v2-secondary">{description}</p> : null}
      </div>
      {actions ? <div className="v2-actions">{actions}</div> : null}
    </header>
  );
}
export function V2AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState("metrics");
  return (
    <div className="v2-shell">
      <a className="v2-skip" href="#v2-main">
        Skip to content
      </a>
      <aside className="v2-sidebar">
        <Sidebar active={active} onSelect={setActive} />
      </aside>
      <MobileHeader onOpen={() => setOpen(true)} />
      <main id="v2-main" className="v2-main" tabIndex={-1}>
        {children}
      </main>
      {open ? (
        <MobileNavigationDrawer
          active={active}
          onSelect={setActive}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </div>
  );
}
