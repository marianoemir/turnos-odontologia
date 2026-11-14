import "./ui.css";

const labels = {
  pendiente: "Pendiente",
  confirmado: "Confirmado",
  atendido: "Atendido",
  ausente: "Ausente",
  cancelado: "Cancelado",
} as const;

type EstadoBadgeProps = { status: keyof typeof labels };

export function EstadoBadge({ status }: EstadoBadgeProps) {
  return <span className={`estado estado--${status}`}>{labels[status]}</span>;
}
