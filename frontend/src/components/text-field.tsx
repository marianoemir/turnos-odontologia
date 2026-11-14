import { useId } from "react";
import type { InputHTMLAttributes } from "react";
import "./ui.css";

type TextFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  error?: string;
  helpText?: string;
  label: string;
};

export function TextField({
  error,
  helpText,
  id: suppliedId,
  label,
  ...props
}: TextFieldProps) {
  const generatedId = useId();
  const id = suppliedId ?? generatedId;
  const helpId = `${id}-help`;
  const errorId = `${id}-error`;
  const describedBy = [helpText ? helpId : undefined, error ? errorId : undefined]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>{label}</label>
      <input
        {...props}
        aria-describedby={describedBy || undefined}
        aria-invalid={error ? true : undefined}
        className={`input ${props.className ?? ""}`}
        id={id}
      />
      {helpText ? <p className="field__hint" id={helpId}>{helpText}</p> : null}
      {error ? <p className="field__error" id={errorId} role="alert">{error}</p> : null}
    </div>
  );
}
