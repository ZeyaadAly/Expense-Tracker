import type { ButtonHTMLAttributes } from "react";

const variants = {
  primary: "border-primary bg-primary text-surface hover:border-primary-hover hover:bg-primary-hover",
  secondary: "border-control bg-surface text-foreground hover:bg-surface-muted",
  danger: "border-danger bg-danger text-surface hover:border-danger-hover hover:bg-danger-hover",
  text: "border-transparent bg-transparent text-primary hover:underline",
  "danger-text": "border-transparent bg-transparent text-danger hover:underline",
};

export function Button({ variant = "primary", pending = false, className = "", children, disabled, type = "button", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof variants; pending?: boolean }) {
  const sizing = variant === "text" || variant === "danger-text" ? "px-2 text-sm" : "px-4 text-base";
  return <button {...props} type={type} disabled={disabled || pending} aria-busy={pending || undefined} className={`inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-control border py-2 font-medium transition-colors disabled:cursor-not-allowed disabled:border-border disabled:bg-surface-muted disabled:text-muted disabled:no-underline ${sizing} ${variants[variant]} ${className}`}>
    {pending ? <span aria-hidden="true" className="size-4 shrink-0 animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:animate-none" /> : null}
    {children}
  </button>;
}
