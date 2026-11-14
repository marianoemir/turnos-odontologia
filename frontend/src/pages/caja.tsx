import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "../components/button";
import { Card } from "../components/card";
import { EmptyState } from "../components/empty-state";
import { Modal } from "../components/modal";
import { Skeleton } from "../components/skeleton";
import { TextField } from "../components/text-field";
import { ApiError } from "../types/errors";
import type { CajaOut } from "../types/api-caja";
import {
  abrirCaja,
  cerrarCaja,
  obtenerCajaPorFecha,
  parseMontoCajaACentavos,
} from "../services/caja";

const TZ_BA = "America/Argentina/Buenos_Aires";

function hoyBuenosAires(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: TZ_BA });
}

function formatCentavos(centavos: number): string {
  const signo = centavos < 0 ? "-" : "";
  const abs = Math.abs(Math.trunc(centavos));
  const pesos = Math.trunc(abs / 100);
  const resto = abs % 100;
  const restoStr = resto < 10 ? `0${resto}` : String(resto);
  const miles = String(pesos).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${signo}$ ${miles},${restoStr}`;
}

function esNoCaja(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}

export default function CajaPage() {
  const [fecha, setFecha] = useState<string>(() => hoyBuenosAires());
  const [montoApertura, setMontoApertura] = useState("0");
  const [montoCierre, setMontoCierre] = useState("0");
  const [abrirError, setAbrirError] = useState<string | null>(null);
  const [cerrarError, setCerrarError] = useState<string | null>(null);
  const [cerrarPaso2, setCerrarPaso2] = useState(false);

  const queryClient = useQueryClient();
  const queryKey = ["caja", fecha] as const;

  const cajaQuery = useQuery<CajaOut, unknown>({
    queryKey,
    queryFn: () => obtenerCajaPorFecha(fecha),
    retry: false,
  });

  const abrirMut = useMutation({
    mutationFn: async () => {
      setAbrirError(null);
      const centavos = parseMontoCajaACentavos(montoApertura);
      return abrirCaja({ monto_apertura_centavos: centavos });
    },
    onSuccess: () => {
      setAbrirError(null);
      void queryClient.invalidateQueries({ queryKey });
    },
    onError: (error: unknown) => {
      if (error instanceof ApiError && error.status === 409) {
        setAbrirError(error.message || error.detalle || "Conflicto al abrir caja");
        void queryClient.invalidateQueries({ queryKey });
        return;
      }
      setAbrirError(error instanceof ApiError ? error.message : "No se pudo abrir la caja");
    },
  });

  const cerrarMut = useMutation({
    mutationFn: async () => {
      const centavos = parseMontoCajaACentavos(montoCierre);
      return cerrarCaja({ fecha, monto_cierre_contado_centavos: centavos });
    },
    onSuccess: () => {
      setCerrarError(null);
      setCerrarPaso2(false);
      void queryClient.invalidateQueries({ queryKey });
    },
    onError: (error: unknown) => {
      setCerrarError(error instanceof ApiError ? error.message : "No se pudo cerrar la caja");
    },
  });

  const error = cajaQuery.error;
  const esPermiso = error instanceof ApiError && error.status === 403;
  const sinCaja = esNoCaja(error);
  const puedeAbrir = sinCaja && fecha === hoyBuenosAires();

  const contenido = useMemo(() => {
    if (cajaQuery.isPending) {
      return <Skeleton style={{ width: "100%" }} />;
    }
    if (esPermiso) {
      return <p role="alert">Permiso insuficiente para ver la caja.</p>;
    }
    if (sinCaja) {
      return (
        <div>
          <EmptyState
            description="No hay caja registrada para la fecha seleccionada."
            title="Sin caja para la fecha"
          />
          {puedeAbrir ? (
            <div style={{ marginTop: 12 }}>
              <TextField
                label="Monto de apertura (pesos)"
                value={montoApertura}
                onChange={(e) => setMontoApertura(e.target.value)}
              />
              <Button
                disabled={abrirMut.isPending}
                onClick={() => {
                  setAbrirError(null);
                  abrirMut.mutate();
                }}
              >
                Abrir caja
              </Button>
            </div>
          ) : null}
        </div>
      );
    }
    if (cajaQuery.isError) {
      return <p role="alert">No se pudo cargar la caja.</p>;
    }
    const caja = cajaQuery.data;
    if (!caja) return null;

    const abierta = caja.estado === "abierta";
    return (
      <div>
        <Card>
          <p>
            Estado: <strong>{abierta ? "abierta" : "cerrada"}</strong>
          </p>
          <p>Apertura: {formatCentavos(caja.monto_apertura_centavos)}</p>
          <div>
            <h2>Totales por medio</h2>
            <ul>
              {Object.entries(caja.totales_por_medio_centavos).map(([medio, total]) => (
                <li key={medio}>
                  {medio}: {formatCentavos(total)}
                </li>
              ))}
            </ul>
          </div>
          {caja.estado === "cerrada" ? (
            <div>
              <p>Monto esperado: {formatCentavos(caja.monto_esperado_centavos ?? 0)}</p>
              <p>Monto contado: {formatCentavos(caja.monto_cierre_contado_centavos ?? 0)}</p>
              <p>
                <strong>Diferencia: {formatCentavos(caja.diferencia_centavos ?? 0)}</strong>
              </p>
            </div>
          ) : null}
        </Card>

        {abierta ? (
          <div style={{ marginTop: 12 }}>
            <TextField
              label="Monto contado al cierre (pesos)"
              value={montoCierre}
              onChange={(e) => setMontoCierre(e.target.value)}
            />
            <Button
              disabled={cerrarMut.isPending}
              onClick={() => {
                setCerrarError(null);
                setCerrarPaso2(true);
              }}
            >
              Cerrar caja
            </Button>
            {cerrarError ? <p role="alert">{cerrarError}</p> : null}
          </div>
        ) : null}
      </div>
    );
  }, [
    cajaQuery.isPending,
    cajaQuery.isError,
    cajaQuery.data,
    esPermiso,
    sinCaja,
    puedeAbrir,
    montoApertura,
    abrirMut,
    montoCierre,
    cerrarMut,
    cerrarError,
  ]);

  return (
    <section>
      <h1 className="app-title">Caja</h1>
      <div>
        <label htmlFor="fecha-caja">Fecha</label>
        <input
          id="fecha-caja"
          type="date"
          value={fecha}
          onChange={(e) => setFecha(e.target.value)}
        />
      </div>
      {abrirError ? <p role="alert">{abrirError}</p> : null}
      {contenido}

      <Modal
        open={cerrarPaso2}
        onClose={() => setCerrarPaso2(false)}
        title="Confirmar cierre de caja"
      >
        <p>
          Vas a cerrar la caja del {fecha} con monto contado {montoCierre || "0"}.
          Esta acción es irreversible.
        </p>
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <Button variant="secondary" onClick={() => setCerrarPaso2(false)}>
            Cancelar
          </Button>
          <Button disabled={cerrarMut.isPending} onClick={() => cerrarMut.mutate()}>
            Confirmar cierre
          </Button>
        </div>
      </Modal>
    </section>
  );
}
