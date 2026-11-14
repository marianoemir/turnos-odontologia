import { useEffect, useId, useRef } from "react";
import type { KeyboardEvent, PropsWithChildren } from "react";
import "./ui.css";

type ModalProps = PropsWithChildren<{
  onClose: () => void;
  open: boolean;
  title: string;
}>;

function getFocusable(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  )];
}

export function Modal({ children, onClose, open, title }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    if (open) {
      triggerRef.current = document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
      const dialog = dialogRef.current;
      getFocusable(dialog ?? document.body)[0]?.focus();
      return;
    }

    triggerRef.current?.focus();
  }, [open]);

  if (!open) {
    return null;
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }

    if (event.key !== "Tab") {
      return;
    }

    const focusable = getFocusable(event.currentTarget);
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first || !last) {
      event.preventDefault();
      return;
    }

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div className="modal-backdrop">
      <div
        aria-labelledby={titleId}
        aria-modal="true"
        className="modal"
        onKeyDown={handleKeyDown}
        ref={dialogRef}
        role="dialog"
      >
        <h2 className="modal__title" id={titleId}>{title}</h2>
        {children}
      </div>
    </div>
  );
}
