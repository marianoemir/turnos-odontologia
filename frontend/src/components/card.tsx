import type { HTMLAttributes, PropsWithChildren } from "react";
import "./ui.css";

type CardProps = PropsWithChildren<HTMLAttributes<HTMLElement>>;

export function Card({ children, className, ...props }: CardProps) {
  return (
    <section className={`card ${className ?? ""}`} {...props}>
      {children}
    </section>
  );
}
