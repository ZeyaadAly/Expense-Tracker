import type { ReactNode } from "react";
import { Button } from "./button";

const tones = {
  success: "border-success bg-success-surface text-success",
  error: "border-danger bg-danger-surface text-danger",
  info: "border-info bg-info-surface text-info",
  warning: "border-warning bg-warning-surface text-warning",
};

export type Feedback = { tone: keyof typeof tones; message: string };

export function FeedbackBanner({ tone, message, action, onDismiss }: Feedback & { action?: { label: string; onClick: () => void }; onDismiss?: () => void }) {
  return <div role={tone === "error" || tone === "warning" ? "alert" : "status"} className={`flex min-w-0 flex-col gap-3 rounded-card border p-4 md:flex-row md:items-center ${tones[tone]}`}>
    <p className="min-w-0 flex-1 wrap-anywhere">{message}</p>
    {action ? <Button variant="secondary" onClick={action.onClick}>{action.label}</Button> : null}
    {onDismiss ? <Button variant="text" aria-label="Dismiss message" onClick={onDismiss}>Dismiss</Button> : null}
  </div>;
}

export function EmptyState({ title, message, action }: { title: string; message: string; action?: ReactNode }) {
  return <div role="status" className="flex min-h-48 flex-col items-center justify-center gap-3 rounded-card border border-border bg-surface p-6 text-center">
    <h3 className="text-lg font-semibold">{title}</h3><p className="text-muted">{message}</p>{action}
  </div>;
}

export function ErrorState({ title, message = "Please try again.", onRetry }: { title: string; message?: string; onRetry: () => void }) {
  return <div role="alert" className="flex min-h-40 flex-col items-start gap-3 rounded-card border border-danger bg-danger-surface p-6">
    <h3 className="font-semibold text-danger">{title}</h3><p className="text-danger wrap-anywhere">{message}</p><Button variant="secondary" onClick={onRetry}>Retry</Button>
  </div>;
}

export function LoadingState({ variant = "list", updating = false }: { variant?: "list" | "value"; updating?: boolean }) {
  if (variant === "value") return <div aria-hidden="true" className="h-9 w-3/4 animate-pulse rounded-control bg-border motion-reduce:animate-none" />;
  return <div role="status" aria-label={updating ? "Updating transactions" : "Loading transactions"} className="space-y-3 rounded-card border border-border bg-surface p-4">
    <p className="text-muted">{updating ? "Updating transactions…" : "Loading transactions…"}</p>
    {Array.from({ length: 5 }, (_, index) => <div aria-hidden="true" key={index} className={`h-24 animate-pulse rounded-control bg-surface-muted md:h-16 motion-reduce:animate-none ${index > 2 ? "hidden md:block" : ""}`} />)}
  </div>;
}
