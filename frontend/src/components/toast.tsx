import { useEffect, useRef, useState } from "react";
import type { PropsWithChildren } from "react";
import "./ui.css";

type ToastProps = PropsWithChildren<{
  duration?: number;
  onDismiss: () => void;
}>;

export function Toast({ children, duration = 5000, onDismiss }: ToastProps) {
  const [focused, setFocused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const remaining = useRef(duration);
  const startedAt = useRef<number | undefined>(undefined);
  const paused = focused || hovered;

  useEffect(() => {
    if (paused) {
      return;
    }

    startedAt.current = Date.now();
    const timer = window.setTimeout(onDismiss, remaining.current);
    return () => {
      window.clearTimeout(timer);
      if (startedAt.current !== undefined) {
        remaining.current = Math.max(
          0,
          remaining.current - (Date.now() - startedAt.current),
        );
        startedAt.current = undefined;
      }
    };
  }, [duration, onDismiss, paused]);

  return (
    <div
      className="toast"
      onBlur={() => setFocused(false)}
      onFocus={() => setFocused(true)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      role="status"
      tabIndex={0}
    >
      {children}
    </div>
  );
}
