import { useParams } from "react-router-dom";

import { useNoindex } from "../app/use-noindex";
import { Button } from "../components/button";
import { Card } from "../components/card";
import { useConfirmarToken } from "../services/reserva-publica";
import type { ResolucionTokenOut } from "../types/api-reserva-publica";
import { ApiError } from "../types/errors";

function horaDe(iso: string): string {
  const coincidencia = /T(\d{2}:\d{2})/.exec(iso);
  return coincidencia === null ? iso : coincidencia[1];
}

function accionPreviaDeError(
  error: unknown,
): "confirmar" | "cancelar" | undefined {
  if (typeof error !== "object" || error === null) {
    return undefined;
  }
  const accion = (error as { accion_previa?: unknown }).accion_previa;
  return accion === "confirmar" || accion === "cancelar" ? accion : undefined;
}

function esYaUsado(error: unknown): boolean {
  return error instanceof ApiError && error.status === 409 && error.causa === "ya_usado";
}

export default function ConfirmarPage() {
  useNoindex();
  const { token } = useParams();
  const mutacion = useConfirmarToken();

  function ejecutar(): void {
    if (!token || mutacion.isPending) {
      return;
    }
    mutacion.mutate(token);
  }

  const enviando = mutacion.isPending;
  let contenido = (
    <Card>
      <p>Confirmá tu turno cuando estés listo. Esta acción no se ejecuta sola.</p>
      <Button
        onClick={ejecutar}
        disabled={enviando}
        aria-busy={enviando || undefined}
        style={{ minHeight: "2.75rem", minWidth: "2.75rem" }}
      >
        Confirmar turno
      </Button>
    </Card>
  );

  if (mutacion.isSuccess) {
    const data: ResolucionTokenOut = mutacion.data;
    if (data.resultado === "confirmado") {
      contenido = (
        <Card aria-label="Resultado">
          <h2>Turno confirmado</h2>
          <dl>
            <dt>Turno</dt>
            <dd>{data.turno_id}</dd>
            <dt>Inicio</dt>
            <dd>{horaDe(data.inicio)}</dd>
            <dt>Estado</dt>
            <dd>confirmado</dd>
          </dl>
        </Card>
      );
    } else if (data.resultado === "expirado") {
      contenido = (
        <Card aria-label="Resultado">
          <h2>Enlace expirado</h2>
          <p>El enlace expiró y no se pudo confirmar el turno.</p>
        </Card>
      );
    } else {
      contenido = (
        <Card aria-label="Resultado">
          <h2>Resultado</h2>
          <p>{data.resultado}</p>
        </Card>
      );
    }
  } else if (mutacion.isError) {
    const error = mutacion.error;
    if (esYaUsado(error)) {
      const accionPrevia = accionPreviaDeError(error);
      const mensaje =
        error instanceof ApiError && error.message.length > 0
          ? error.message
          : "Este enlace ya fue utilizado.";
      contenido = (
        <Card aria-label="Resultado">
          <h2>Enlace ya usado</h2>
          {accionPrevia ? (
            <p>
              Acción previa: <strong>{accionPrevia}</strong>
            </p>
          ) : (
            <p>{mensaje}</p>
          )}
        </Card>
      );
    } else if (error instanceof ApiError && error.status === 404) {
      contenido = (
        <Card aria-label="Resultado">
          <h2>Enlace no encontrado</h2>
          <p>No se encontró un turno para este enlace.</p>
        </Card>
      );
    } else if (error instanceof ApiError && error.status === 422) {
      contenido = (
        <Card aria-label="Resultado">
          <h2>Enlace inválido</h2>
          <p>El enlace no es válido. Revisá que esté completo.</p>
        </Card>
      );
    } else {
      const mensaje =
        error instanceof ApiError
          ? error.message
          : "Ocurrió un error al procesar el enlace.";
      contenido = (
        <Card aria-label="Resultado">
          <p role="alert">{mensaje}</p>
          <Button
            onClick={ejecutar}
            style={{ minHeight: "2.75rem", minWidth: "2.75rem" }}
          >
            Reintentar
          </Button>
        </Card>
      );
    }
  }

  return (
    <section>
      <h1 className="app-title">Confirmar turno</h1>
      {contenido}
    </section>
  );
}
