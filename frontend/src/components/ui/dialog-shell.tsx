"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { Button } from "./button";

export function DialogShell({ title, description, children, pending = false, fullScreenMobile = false, initialFocus = "input:checked", onClose }: { title: string; description: string; children: ReactNode; pending?: boolean; fullScreenMobile?: boolean; initialFocus?: string; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const trigger = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.showModal();
    dialog.querySelector<HTMLElement>(initialFocus)?.focus();
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      if (trigger instanceof HTMLElement && trigger.isConnected && trigger.getClientRects().length) trigger.focus();
      else document.getElementById("transactions-heading")?.focus();
    };
  }, [initialFocus]);

  return <dialog ref={dialogRef} aria-labelledby={titleId} aria-describedby={descriptionId} aria-modal="true" aria-busy={pending} className={`dialog-shell ${fullScreenMobile ? "dialog-full-mobile" : "dialog-confirmation"}`} onCancel={(event) => { event.preventDefault(); if (!pending) onClose(); }} onKeyDown={(event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      if (!pending) onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const elements = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]')).filter((element) => element.getClientRects().length && !(element instanceof HTMLInputElement && element.type === "radio" && !element.checked));
    const first = elements[0];
    const last = elements[elements.length - 1];
    if (!first) { event.preventDefault(); return; }
    if (event.shiftKey && (document.activeElement === first || document.activeElement === event.currentTarget)) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }}>
    <div className="flex items-start justify-between gap-3">
      <h2 id={titleId} className="min-w-0 text-xl leading-7 font-semibold">{title}</h2>
      <Button variant="text" disabled={pending} onClick={onClose} aria-label={`Close ${title.toLowerCase()}`} className="-mt-2 -mr-2 shrink-0">×</Button>
    </div>
    <p id={descriptionId} className="mt-2 text-sm leading-5 text-muted">{description}</p>
    {children}
  </dialog>;
}
