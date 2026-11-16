import { useState } from "react";

import { useProfesionales } from "../services/catalogo";
import { useCrearEntradaHc, useEntradasHc } from "../services/hc";
import type { ApiError } from "../types/errors";

function nombreProfesional(
  profesionalId: string,
  profesionales: Array<{ id: string; nombre?: string; apellido?: string }> | undefined,
): string {
  const profesional = profesionales?.find((item) => item.id === profesionalId);
  if (!profesional) {
    return profesionalId;
  }
  const nombre = [profesional.nombre, profesional.apellido]
    .filter((parte): parte is string => typeof parte === "string" && parte.trim().length > 0)
    .join(" ")
    .trim();
  return nombre || profesionalId;
}

export function EntradasClinicasSection({ hcId }: { hcId: string }) {
  const entradas = useEntradasHc(hcId);
  const profesionales = useProfesionales(true);
  const crear = useCrearEntradaHc();
  const [profesionalId, setProfesionalId] = useState("");
  const [texto, setTexto] = useState("");
  const [error, setError] = useState<ApiError | null>(null);

  function onSubmit(evento: React.FormEvent<HTMLFormElement>): void {
    evento.preventDefault();
    setError(null);
    crear.mutate(
      {
        hcId,
        body: {
          profesional_id: profesionalId,
          fecha: new Date().toISOString(),
          texto,
        },
      },
      {
        onSuccess: () => {
          setTexto("");
        },
        onError: (err) => {
          setError(err as ApiError);
        },
      },
    );
  }

  const lista = entradas.data ?? [];
  const deshabilitado = crear.isPending;

  return (
    <section aria-label="Entradas clínicas">
      <h2>Entradas clínicas</h2>

      {lista.length === 0 ? (
        <p>Sin entradas clínicas registradas.</p>
      ) : (
        <ul>
          {lista.map((entrada) => (
            <li key={entrada.id} data-testid="entrada-clinica-item">
              <span>{nombreProfesional(entrada.profesional_id, profesionales.data)}</span>
              <span> {entrada.fecha}</span>
              <p>{entrada.texto}</p>
            </li>
          ))}
        </ul>
      )}

      <form aria-label="Nueva entrada clínica" onSubmit={onSubmit}>
        <label>
          Profesional
          <select
            aria-label="Profesional de la entrada"
            value={profesionalId}
            onChange={(evento) => setProfesionalId(evento.target.value)}
            disabled={deshabilitado}
          >
            <option value="">Seleccionar</option>
            {(profesionales.data ?? []).map((profesional) => (
              <option key={profesional.id} value={profesional.id}>
                {nombreProfesional(profesional.id, [profesional])}
              </option>
            ))}
          </select>
        </label>
        <label>
          Texto
          <textarea
            aria-label="Texto de la entrada"
            value={texto}
            onChange={(evento) => setTexto(evento.target.value)}
            disabled={deshabilitado}
          />
        </label>
        <button type="submit" disabled={deshabilitado}>
          Registrar entrada
        </button>
      </form>

      {error ? (
        <p role="alert">{error.message ?? error.detalle ?? "Error al registrar entrada"}</p>
      ) : null}
    </section>
  );
}
