import { EmptyState } from "../components/empty-state";
import { Skeleton } from "../components/skeleton";
import { formatCentavos } from "../services/money";
import { usePrestaciones } from "../services/catalogo";
import type { PlanTratamientoOut } from "../types/api-hc";
import type { ApiError } from "../types/errors";

function nombrePrestacion(
  prestacionId: string,
  prestaciones: Array<{ id: string; nombre?: string }> | undefined,
): string {
  const p = prestaciones?.find((x) => x.id === prestacionId);
  return p?.nombre ?? prestacionId;
}

export function PlanesSection({
  planes,
  isPending,
  isError,
  error,
}: {
  planes: PlanTratamientoOut[] | undefined;
  isPending: boolean;
  isError: boolean;
  error: ApiError | null;
}) {
  const prestaciones = usePrestaciones(true);

  return (
    <section aria-label="Planes de tratamiento">
      <h2>Planes de tratamiento</h2>

      {isPending ? <Skeleton aria-label="Cargando planes" /> : null}

      {isError ? (
        <p role="alert">
          {error?.message ?? error?.detalle ?? "No se pudo cargar la sección de planes."}
        </p>
      ) : null}

      {!isPending && !isError ? (
        (planes ?? []).length === 0 ? (
          <EmptyState
            title="Sin planes de tratamiento"
            description="No hay planes registrados para este paciente."
          />
        ) : (
          <div>
            {(planes ?? []).map((plan) => (
              <article key={plan.id} aria-label={`Plan ${plan.id}`}>
                <p>Estado: {plan.estado}</p>
                <p>Total: {formatCentavos(plan.total_centavos)}</p>
                <p>Cobertura: {formatCentavos(plan.cobertura_centavos)}</p>
                {(plan.items ?? []).length === 0 ? (
                  <p>Sin ítems.</p>
                ) : (
                  <ul>
                    {(plan.items ?? []).map((item) => (
                      <li key={item.id}>
                        <span>Pieza {item.pieza}</span>
                        <span> {nombrePrestacion(item.prestacion_id, prestaciones.data)}</span>
                        <span> {item.estado}</span>
                        <span> {formatCentavos(item.monto_centavos)}</span>
                        {item.monto_cobertura_centavos != null ? (
                          <span> Cobertura ítem: {formatCentavos(item.monto_cobertura_centavos)}</span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            ))}
          </div>
        )
      ) : null}
    </section>
  );
}