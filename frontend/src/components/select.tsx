import { useId } from "react";
import type { SelectHTMLAttributes } from "react";
import "./ui.css";

type Option = { label: string; value: string };
type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  error?: string;
  helpText?: string;
  label: string;
  options: Option[];
};

export function Select({
  error,
  helpText,
  id: suppliedId,
  label,
  options,
  ...props
}: SelectProps) {
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
      <select
        {...props}
        aria-describedby={describedBy || undefined}
        aria-invalid={error ? true : undefined}
        className={`select ${props.className ?? ""}`}
        id={id}
      >
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      {helpText ? <p className="field__hint" id={helpId}>{helpText}</p> : null}
      {error ? <p className="field__error" id={errorId} role="alert">{error}</p> : null}
    </div>
  );
}
