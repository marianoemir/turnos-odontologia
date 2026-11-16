import { useMemo, useRef, useState } from "react";

import { Modal } from "../components/modal";
import { useCrearOdontograma } from "../services/hc";
import { usePrestaciones, useProfesionales } from "../services/catalogo";
import type { OdontogramaOut, PlanTratamientoOut } from "../types/api-hc";
import type { ApiError } from "../types/errors";

function nombreProfesional(
  profesionalId: string,
  profesionales: Array<{ id: string; nombre?: string }> | undefined,
): string {
  const p = profesionales?.find((x) => x.id === profesionalId);
  if (!p) return profesionalId;
  const nombre = (p.nombre ?? "").trim();
  return nombre || profesionalId;
}

function nombrePrestacion(
  prestacionId: string,
  prestaciones: Array<{ id: string; nombre?: string }> | undefined,
): string {
  const p = prestaciones?.find((x) => x.id === prestacionId);
  return p?.nombre ?? prestacionId;
}

export function PanelPieza({
  pieza,
  pacienteId,
  observaciones,
  planes,
  onFocusPieza,
}: {
  pieza: string;
  pacienteId: string;
  observaciones: OdontogramaOut[];
  planes: PlanTratamientoOut[];
  onFocusPieza: () => void;
}) {
  const [estadoNuevo, setEstadoNuevo] = useState("");
  const [profesionalId, setProfesionalId] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitError, setSubmitError] = useState<ApiError | null>(null);
  const [exito, setExito] = useState(false);
  const registrarRef = useRef<HTMLButtonElement>(null);

  const profesionales = useProfesionales(true);
  const prestaciones = usePrestaciones(true);
  const crear = useCrearOdontograma();

  const historial = useMemo(
    () => observaciones.filter((o) => o.pieza === pieza),
    [observaciones, pieza],
  );

  const itemsPieza = useMemo(() => {
    const items: Array<{
      id: string;
      prestacion_id: string;
      estado: string;
      monto_centavos?: number;
    }> = [];
    for (const plan of planes) {
      for (const item of plan.items ?? []) {
        if (item.pieza === pieza) {
          items.push(item);
        }
      }
    }
    return items;
  }, [planes, pieza]);

  const onConfirmar = () => {
    setSubmitError(null);
    setExito(false);
    const body = {
      pieza,
      estado: estadoNuevo,
      profesional_id: profesionalId,
      fecha: new Date().toISOString(),
    };
    crear.mutate(
      { pacienteId, body },
      {
        onSuccess: () => {
          setConfirmOpen(false);
          setEstadoNuevo("");
          setExito(true);
          // Tras alta exitosa, foco a la celda de la pieza (D11).
          // Modal restaura foco al trigger al cerrar; re-aplicar foco a celda después.
          setTimeout(() => onFocusPieza(), 50);
        },
        onError: (err) => {
          setConfirmOpen(false);
          setSubmitError(err as ApiError);
          // Modal devuelve foco al botón al cerrar; mantenerlo (no éxito).
        },
      },
    );
  };

  const deshabilitado = crear.isPending;

  return (
    <div>
      <h3>Pieza {pieza}</h3>

      <section aria-label="Historial de pieza">
        <h4>Historial</h4>
        {historial.length === 0 ? (
          <p>Sin registros para esta pieza.</p>
        ) : (
          <ul>
            {historial.map((obs) => (
              <li key={obs.id} data-testid="historial-pieza-item">
                <span>{obs.fecha}</span>
                <span>
                  {" "}
                  {nombreProfesional(obs.profesional_id, profesionales.data)}
                </span>
                <span> {obs.estado}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Ítems de plan de la pieza">
        <h4>Ítems de plan</h4>
        {itemsPieza.length === 0 ? (
          <p>Sin ítems de plan para esta pieza.</p>
        ) : (
          <ul>
            {itemsPieza.map((item) => (
              <li key={item.id}>
                <span>
                  {nombrePrestacion(item.prestacion_id, prestaciones.data)}
                </span>
                <span> {item.estado}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Registrar estado de pieza">
        <h4>Registrar estado</h4>
        <label>
          Estado
          <input
            aria-label="Estado de la pieza"
            value={estadoNuevo}
            onChange={(e) => setEstadoNuevo(e.target.value)}
            disabled={deshabilitado}
          />
        </label>
        <label>
          Profesional
          <select
            aria-label="Profesional de la pieza"
            value={profesionalId}
            onChange={(e) => setProfesionalId(e.target.value)}
            disabled={deshabilitado}
          >
            <option value="">Seleccionar</option>
            {(profesionales.data ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre || p.id}
              </option>
            ))}
          </select>
        </label>
        <button
          ref={registrarRef}
          type="button"
          onClick={() => {
            setSubmitError(null);
            setConfirmOpen(true);
          }}
          disabled={deshabilitado}
        >
          Registrar estado
        </button>

        <Modal
          open={confirmOpen}
          title="Confirmar registro de estado"
          onClose={() => {
            if (!crear.isPending) setConfirmOpen(false);
          }}
        >
          <p>¿Confirmar el nuevo estado para la pieza {pieza}?</p>
          <button type="button" onClick={() => setConfirmOpen(false)} disabled={deshabilitado}>
            Cancelar
          </button>
          <button type="button" onClick={onConfirmar} disabled={deshabilitado}>
            Confirmar
          </button>
        </Modal>

        {submitError ? (
          <p role="alert">{submitError.message ?? submitError.detalle ?? "Error al registrar estado"}</p>
        ) : null}
        {exito && !submitError ? <p role="status">Estado registrado.</p> : null}
      </section>
    </div>
  );
}
