import type { ButtonHTMLAttributes, PropsWithChildren } from "react";
import "./ui.css";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

type ButtonProps = PropsWithChildren<
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }
>;

export function Button({
  children,
  className,
  type = "button",
  variant = "primary",
  ...props
}: ButtonProps) {
  return (
    <button className={`btn btn--${variant} ${className ?? ""}`} type={type} {...props}>
      {children}
    </button>
  );
}
