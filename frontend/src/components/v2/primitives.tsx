"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { Icon } from "./icon";

export type Tone = "success" | "warning" | "error" | "info";
export function Button({
  variant = "primary",
  loading = false,
  children,
  className = "",
  disabled,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "ghost" | "text";
  loading?: boolean;
}) {
  return (
    <button
      {...props}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`v2-button v2-button--${variant} ${className}`}
    >
      {loading ? <span className="v2-spinner" aria-hidden="true" /> : null}
      {children}
      {loading ? <span className="v2-sr-only"> — loading</span> : null}
    </button>
  );
}

export function FormField({
  label,
  id,
  hint,
  error,
  children,
  required,
}: {
  label: string;
  id: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  required?: boolean;
}) {
  return (
    <div className="v2-field">
      <label htmlFor={id}>
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </label>
      {children}
      {hint ? (
        <p className="v2-helper" id={`${id}-hint`}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p className="v2-field-error" id={`${id}-error`}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
type InputProps = InputHTMLAttributes<HTMLInputElement>;
export function TextInput(props: InputProps) {
  return <input {...props} className={`v2-input ${props.className ?? ""}`} />;
}
export function MoneyInput(props: InputProps) {
  return (
    <div className="v2-input-affix">
      <TextInput {...props} type="text" inputMode="decimal" />
      <span aria-hidden="true">EGP</span>
    </div>
  );
}
export function SearchInput(props: InputProps) {
  return (
    <div className="v2-input-affix v2-search-input">
      <Icon name="search" />
      <TextInput {...props} type="search" />
    </div>
  );
}
export function PasswordInput(props: InputProps) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="v2-password">
      <TextInput {...props} type={visible ? "text" : "password"} />
      <Button
        variant="ghost"
        disabled={props.disabled}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        onClick={() => setVisible(!visible)}
      >
        <Icon name="eye" />
      </Button>
    </div>
  );
}
export function DateInput(props: InputProps) {
  return <TextInput {...props} type="date" />;
}
export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`v2-input ${props.className ?? ""}`} />;
}
export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`v2-input v2-textarea ${props.className ?? ""}`}
    />
  );
}
export function Checkbox({ label, ...props }: InputProps & { label: string }) {
  return (
    <label className="v2-check">
      <input {...props} type="checkbox" />
      <span>{label}</span>
    </label>
  );
}
export function Toggle({ label, ...props }: InputProps & { label: string }) {
  return (
    <label className="v2-check v2-toggle">
      <input {...props} type="checkbox" role="switch" />
      <span>{label}</span>
    </label>
  );
}
export function SegmentedControl({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <fieldset className="v2-segmented">
      <legend className="v2-label">{label}</legend>
      <div>
        {options.map((option) => (
          <label key={option}>
            <input
              type="radio"
              name={id}
              value={option}
              checked={value === option}
              onChange={() => onChange(option)}
            />
            <span>{option}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function FeedbackBanner({
  tone,
  title,
  children,
  action,
}: {
  tone: Tone;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div
      className={`v2-feedback v2-feedback--${tone}`}
      role={tone === "error" ? "alert" : "status"}
    >
      <Icon
        name={
          tone === "success"
            ? "check"
            : tone === "warning" || tone === "error"
              ? "warning"
              : "info"
        }
      />
      <div>
        <strong>{title}</strong>
        {children ? <div className="v2-helper">{children}</div> : null}
        {action}
      </div>
    </div>
  );
}
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="v2-empty">
      <Icon name="ledger" />
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function ErrorState({
  title = "This section is unavailable",
  description = "Your existing data has not changed.",
  onRetry,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
}) {
  return (
    <FeedbackBanner tone="error" title={title}>
      {description}
      {onRetry ? (
        <Button variant="text" onClick={onRetry}>
          Retry this section
        </Button>
      ) : null}
    </FeedbackBanner>
  );
}
export function StaleIndicator({
  children = "Last loaded values · refresh failed",
}: {
  children?: ReactNode;
}) {
  return (
    <span className="v2-stale">
      <Icon name="warning" />
      {children}
    </span>
  );
}
export function ArchivedState({
  children = "Archived · retained in history",
}: {
  children?: ReactNode;
}) {
  return <span className="v2-badge">{children}</span>;
}
export function Skeleton({
  variant = "metric",
}: {
  variant?: "metric" | "account" | "transaction" | "chart" | "budget" | "goal";
}) {
  return (
    <div className={`v2-skeleton v2-skeleton--${variant}`} role="status">
      <span className="v2-sr-only">Loading {variant}</span>
      <i />
      <i />
      <i />
    </div>
  );
}

export type DialogState = "default" | "pending" | "error" | "uncertain";
export function DialogShell({
  title,
  description,
  children,
  onClose,
  state = "default",
  presentation = "dialog",
}: {
  title: string;
  description: string;
  children: ReactNode;
  onClose: () => void;
  state?: DialogState;
  presentation?: "dialog" | "drawer" | "mobile-full";
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const pending = state === "pending";
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    // Native cancellation must be stopped synchronously on the dialog itself.
    const cancel = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!pending) onClose();
    };
    node.addEventListener("cancel", cancel);
    if (pending) {
      // Disabling a focused submit button can move focus outside the modal.
      const enabledControl = node.querySelector<HTMLElement>(
        "button:not(:disabled)",
      );
      (enabledControl ?? node).focus();
    }
    return () => node.removeEventListener("cancel", cancel);
  }, [pending, onClose]);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const trigger = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    node.showModal();
    node.querySelector<HTMLElement>("[data-initial-focus]")?.focus();
    return () => {
      node.close();
      document.body.style.overflow = overflow;
      if (trigger instanceof HTMLElement && trigger.isConnected)
        trigger.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      tabIndex={-1}
      className={`v2-dialog v2-dialog--${presentation}`}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      aria-busy={pending}
      onCancel={(event) => {
        event.preventDefault();
        if (!pending) onClose();
      }}
      onKeyDown={(event) => {
        // Intercept Escape before the browser's native close action, including
        // while the submit button has become disabled during a pending write.
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          if (!pending) onClose();
          return;
        }
        if (event.key !== "Tab") return;
        const controls = Array.from(
          event.currentTarget.querySelectorAll<HTMLElement>(
            'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]',
          ),
        ).filter(
          (node) =>
            node.getClientRects().length &&
            !(
              node instanceof HTMLInputElement &&
              node.type === "radio" &&
              !node.checked
            ),
        );
        const first = controls[0],
          last = controls.at(-1);
        if (!first) {
          event.preventDefault();
          event.currentTarget.focus();
        } else if (
          event.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === event.currentTarget)
        ) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }}
    >
      <header className="v2-dialog-header">
        <h2 id={titleId}>{title}</h2>
        <Button
          variant="ghost"
          aria-label={`Close ${title}`}
          disabled={pending}
          onClick={onClose}
        >
          <Icon name="close" />
        </Button>
      </header>
      <p id={descriptionId} className="v2-secondary">
        {description}
      </p>
      {state === "error" ? (
        <FeedbackBanner tone="error" title="Could not complete this action">
          Keep your draft and try again.
        </FeedbackBanner>
      ) : null}
      {state === "uncertain" ? (
        <FeedbackBanner tone="warning" title="Outcome is uncertain">
          Check the latest records before submitting again. Do not automatically
          retry.
        </FeedbackBanner>
      ) : null}
      {children}
    </dialog>
  );
}
export function Drawer(
  props: Omit<Parameters<typeof DialogShell>[0], "presentation">,
) {
  return <DialogShell {...props} presentation="drawer" />;
}
export function MobileFullScreenDialog(
  props: Omit<Parameters<typeof DialogShell>[0], "presentation">,
) {
  return <DialogShell {...props} presentation="mobile-full" />;
}
export function ConfirmationDialog({
  title,
  description,
  onConfirm,
  onClose,
  state,
  confirmLabel = "Confirm",
  pendingPreview,
}: {
  title: string;
  description: string;
  onConfirm: () => void;
  onClose: () => void;
  state?: DialogState;
  confirmLabel?: string;
  pendingPreview?: () => void;
}) {
  return (
    <DialogShell
      title={title}
      description={description}
      onClose={onClose}
      state={state}
    >
      <div className="v2-actions">
        <Button
          variant="secondary"
          data-initial-focus
          disabled={state === "pending"}
          onClick={onClose}
        >
          Cancel
        </Button>
        <Button
          variant="danger"
          loading={state === "pending"}
          onClick={onConfirm}
        >
          {confirmLabel}
        </Button>
      </div>
      {state === "pending" && pendingPreview ? (
        <Button variant="text" onClick={pendingPreview}>
          Finish pending preview
        </Button>
      ) : null}
    </DialogShell>
  );
}

export function Pagination({
  hasPrevious,
  hasNext,
  pending = false,
  onPrevious,
  onNext,
}: {
  hasPrevious: boolean;
  hasNext: boolean;
  pending?: boolean;
  onPrevious: () => void;
  onNext: () => void;
}) {
  return (
    <nav className="v2-pagination" aria-label="List pagination">
      <span className="v2-helper">25 records per page</span>
      <div className="v2-actions">
        <Button
          variant="secondary"
          disabled={!hasPrevious || pending}
          onClick={onPrevious}
        >
          Previous
        </Button>
        <Button
          variant="secondary"
          loading={pending}
          disabled={!hasNext}
          onClick={onNext}
        >
          Next
        </Button>
      </div>
    </nav>
  );
}
