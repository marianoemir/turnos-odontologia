import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "../components/button";
import { Card } from "../components/card";
import { EmptyState } from "../components/empty-state";
import { Modal } from "../components/modal";
import { Select } from "../components/select";
import { Skeleton } from "../components/skeleton";
import { TextField } from "../components/text-field";
import { ApiError } from "../types/errors";
import type { CajaOut, CobroOut, CobroCreate, MedioCobro, ConceptoCobro } from "../types/api-caja";
import {
  abrirCaja,
  cerrarCaja,
  obtenerCajaPorFecha,
  parseMontoCajaACentavos,
  parsePesosACentavos,
  registrarCobro,
} from "../services/caja";
import { cajaPorFechaQueryKey, resourceKeys } from "../services/query";

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

function esUuid(valor: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    valor.trim(),
  );
}

function mensajeError(error: unknown, fallback: string): string {
  if (!(error instanceof ApiError)) return fallback;
  return error.message || error.detalle || fallback;
}

export default function CajaPage() {
  const [fecha, setFecha] = useState<string>(() => hoyBuenosAires());
  const [montoApertura, setMontoApertura] = useState("0");
  const [montoCierre, setMontoCierre] = useState("0");
  const [abrirError, setAbrirError] = useState<string | null>(null);
  const [cerrarError, setCerrarError] = useState<string | null>(null);
  const [cerrarPaso2, setCerrarPaso2] = useState(false);

  const [cobroMedio, setCobroMedio] = useState<MedioCobro>("efectivo");
  const [cobroConcepto, setCobroConcepto] = useState<ConceptoCobro>("total");
  const [cobroMonto, setCobroMonto] = useState("");
  const [cobroTurnoId, setCobroTurnoId] = useState("");
  const [cobroNomenclador, setCobroNomenclador] = useState("");
  const [cobroCobertura, setCobroCobertura] = useState("0");
  const [cobroError, setCobroError] = useState<string | null>(null);
  const [cobrosCreados, setCobrosCreados] = useState<CobroOut[]>([]);

  const queryClient = useQueryClient();
  const queryKey = cajaPorFechaQueryKey(fecha);

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
      void queryClient.invalidateQueries({ queryKey: resourceKeys.caja.all });
    },
    onError: (error: unknown) => {
      if (error instanceof ApiError && error.status === 409) {
        setAbrirError(error.message || error.detalle || "Conflicto al abrir caja");
        void queryClient.invalidateQueries({ queryKey: resourceKeys.caja.all });
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
      void queryClient.invalidateQueries({ queryKey: resourceKeys.caja.all });
    },
    onError: (error: unknown) => {
      setCerrarError(error instanceof ApiError ? error.message : "No se pudo cerrar la caja");
    },
  });

  const cobroMut = useMutation({
    mutationFn: async (payload: CobroCreate) => registrarCobro(payload),
    onSuccess: (creado) => {
      setCobroError(null);
      setCobroMonto("");
      setCobroTurnoId("");
      setCobroNomenclador("");
      setCobroCobertura("0");
      setCobrosCreados((prev) => [creado, ...prev]);
      void queryClient.invalidateQueries({ queryKey: resourceKeys.caja.all });
    },
    onError: (error: unknown) => {
      if (error instanceof ApiError && error.status === 409 && error.causa === "caja_no_abierta") {
        setCobroError("Hay que abrir la caja del día para registrar cobros.");
        return;
      }
      if (error instanceof ApiError && error.status === 404 && error.kind === "no_encontrado") {
        setCobroError(mensajeError(error, "No se encontró el recurso indicado."));
        return;
      }
      if (error instanceof ApiError && error.status === 422) {
        setCobroError(mensajeError(error, "La request tiene campos inválidos."));
        return;
      }
      setCobroError(mensajeError(error, "No se pudo registrar el cobro."));
    },
  });

  function enviarCobro() {
    setCobroError(null);
    const turnoTrim = cobroTurnoId.trim();
    if (turnoTrim !== "" && !esUuid(turnoTrim)) {
      setCobroError("El turno debe ser un UUID v�lido.");
      return;
    }
    let montoCentavos: number;
    try {
      montoCentavos = parsePesosACentavos(cobroMonto);
    } catch {
      setCobroError("El monto es inválido.");
      return;
    }
    const payload: CobroCreate = {
      medio: cobroMedio,
      concepto: cobroConcepto,
      monto_centavos: montoCentavos,
    };
    if (turnoTrim !== "") {
      payload.turno_id = turnoTrim;
    }
    if (cobroMedio === "obra_social") {
      payload.nomenclador_codigo = cobroNomenclador;
      try {
        payload.cobertura_centavos = parseMontoCajaACentavos(cobroCobertura);
      } catch {
        setCobroError("La cobertura es inválida.");
        return;
      }
    }
    cobroMut.mutate(payload);
  }

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

      <Card style={{ marginTop: 16 }}>
        <h2>Registrar cobro</h2>
        <div style={{ display: "grid", gap: 8 }}>
          <Select
            label="Medio"
            value={cobroMedio}
            onChange={(e) => setCobroMedio(e.target.value as MedioCobro)}
            options={[
              { value: "efectivo", label: "Efectivo" },
              { value: "tarjeta", label: "Tarjeta" },
              { value: "transferencia", label: "Transferencia" },
              { value: "mercado_pago", label: "Mercado Pago" },
              { value: "obra_social", label: "Obra social" },
            ]}
          />
          <Select
            label="Concepto"
            value={cobroConcepto}
            onChange={(e) => setCobroConcepto(e.target.value as ConceptoCobro)}
            options={[
              { value: "sena", label: "Seña" },
              { value: "saldo", label: "Saldo" },
              { value: "total", label: "Total" },
            ]}
          />
          <TextField
            label="Monto (pesos)"
            value={cobroMonto}
            onChange={(e) => setCobroMonto(e.target.value)}
          />
          <TextField
            label="ID de turno (opcional)"
            value={cobroTurnoId}
            onChange={(e) => setCobroTurnoId(e.target.value)}
          />
          {cobroMedio === "obra_social" ? (
            <>
              <TextField
                label="Nomenclador"
                value={cobroNomenclador}
                onChange={(e) => setCobroNomenclador(e.target.value)}
              />
              <TextField
                label="Cobertura (pesos)"
                value={cobroCobertura}
                onChange={(e) => setCobroCobertura(e.target.value)}
              />
            </>
          ) : null}
          <div>
            <Button disabled={cobroMut.isPending} onClick={enviarCobro}>
              Registrar cobro
            </Button>
          </div>
          {cobroError ? <p role="alert">{cobroError}</p> : null}
        </div>
      </Card>

      {cobrosCreados.length > 0 ? (
        <Card style={{ marginTop: 16 }}>
          <h2>Cobros registrados</h2>
          <ul>
            {cobrosCreados.map((c) => {
              const simMp =
                c.simulado === true &&
                typeof c.referencia_externa === "string" &&
                c.referencia_externa.startsWith("SIM-MP-");
              return (
                <li key={c.id} style={{ marginBottom: 8 }}>
                  <p>
                    Estado: <strong>{c.estado}</strong> — Concepto: {c.concepto} — Medio:{" "}
                    {c.medio} — Monto: {formatCentavos(c.monto_centavos)}
                  </p>
                  {simMp ? (
                    <p>
                      <strong>Simulado (Mercado Pago)</strong> — Referencia:{" "}
                      {c.referencia_externa}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </Card>
      ) : null}

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
