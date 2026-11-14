import type { HTMLAttributes } from "react";
import "./ui.css";

type SkeletonProps = HTMLAttributes<HTMLDivElement>;

export function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      {...props}
      aria-busy="true"
      className={`sk ${className ?? ""}`}
      role="status"
    />
  );
}
