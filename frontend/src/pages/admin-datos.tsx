/**
 * Exportación de datos de `/admin/datos` (C-22, task 5.1; design D7).
 *
 * El token vive en memoria y viaja solo por `Authorization`, por eso la
 * descarga no es un enlace directo: se llama a `GET /export` con `apiRequest`
 * (plazo de 60 s) y el cliente arma un `Blob` JSON y lo entrega con un nombre
 * fechado. El contenido no se guarda en la caché de consultas ni en el estado
 * de la pantalla, y la URL del `Blob` se revoca tras la descarga. El archivo es
 * el mismo contenido reserializado por el navegador, no los bytes del servidor.
 * La autorización real es del backend (403 si el rol no es `admin`).
 */
import { useCallback, useState } from "react";

import { Button } from "../components/button";
import { TextField } from "../components/text-field";
import { Toast } from "../components/toast";
import { apiRequest } from "../services/http";
import { ApiError } from "../types/errors";
import { SeccionImportacion } from "./admin-datos-importacion";

const TIMEOUT_EXPORTACION_MS = 60_000;
const MAXIMO_DIAS = 30;
const MS_POR_DIA = 86_400_000;

const MENSAJE_422 =
  "El servidor rechazó el período indicado. Revisá las fechas (máximo 30 días).";
const MENSAJE_GENERICO = "No se pudo generar la exportación. Intentá de nuevo.";

/** `YYYY-MM-DD` a milisegundos UTC (solo para contar días); `NaN` si no es válida. */
function aDiaUtc(fecha: string): number {
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha);
  if (partes === null) {
    return Number.NaN;
  }
  return Date.UTC(Number(partes[1]), Number(partes[2]) - 1, Number(partes[3]));
}

/** Mensaje de error del período, o `null` si se puede enviar. */
function validarPeriodo(desde: string, hasta: string): string | null {
  if (desde === "" || hasta === "") {
    return null;
  }
  const inicio = aDiaUtc(desde);
  const fin = aDiaUtc(hasta);
  if (Number.isNaN(inicio) || Number.isNaN(fin)) {
    return "Ingresá fechas válidas.";
  }
  if (inicio > fin) {
    return "«Desde» no puede ser posterior a «Hasta».";
  }
  const dias = (fin - inicio) / MS_POR_DIA + 1;
  if (dias > MAXIMO_DIAS) {
    return "El período no puede superar los 30 días.";
  }
  return null;
}

function rutaDeExport(desde: string, hasta: string): string {
  const parametros = new URLSearchParams();
  if (desde !== "") parametros.set("desde", desde);
  if (hasta !== "") parametros.set("hasta", hasta);
  const consulta = parametros.toString();
  return consulta === "" ? "/export" : `/export?${consulta}`;
}

/** `export-turnos-YYYYMMDD-HHMMSS.json` con la fecha y hora locales. */
function nombreDeArchivo(ahora: Date): string {
  const dos = (n: number): string => String(n).padStart(2, "0");
  const fecha = `${ahora.getFullYear()}${dos(ahora.getMonth() + 1)}${dos(ahora.getDate())}`;
  const hora = `${dos(ahora.getHours())}${dos(ahora.getMinutes())}${dos(ahora.getSeconds())}`;
  return `export-turnos-${fecha}-${hora}.json`;
}

function entregarArchivo(contenido: unknown): void {
  const blob = new Blob([JSON.stringify(contenido)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = nombreDeArchivo(new Date());
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export default function AdminDatosPage() {
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [errorPeriodo, setErrorPeriodo] = useState<string | null>(null);
  const [mensajeError, setMensajeError] = useState<string | null>(null);
  const [descargando, setDescargando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const cerrarAviso = useCallback(() => setAviso(null), []);

  async function descargar(): Promise<void> {
    setAviso(null);
    setMensajeError(null);
    const problema = validarPeriodo(desde, hasta);
    if (problema !== null) {
      setErrorPeriodo(problema);
      return;
    }
    setErrorPeriodo(null);
    setDescargando(true);
    try {
      const exportacion = await apiRequest<unknown>(rutaDeExport(desde, hasta), {
        timeoutMs: TIMEOUT_EXPORTACION_MS,
      });
      entregarArchivo(exportacion);
      setAviso("Exportación descargada.");
    } catch (error) {
      if (error instanceof ApiError && error.status === 422) {
        setMensajeError(MENSAJE_422);
      } else {
        setMensajeError(MENSAJE_GENERICO);
      }
    } finally {
      setDescargando(false);
    }
  }

  return (
    <section>
      <h1 className="app-title">Datos</h1>

      <section aria-labelledby="contrato-exportacion">
        <h2 id="contrato-exportacion">Contrato de salida</h2>
        <ul>
          <li>Formato: JSON UTF-8 sin BOM, versión de contrato 1.0.</li>
          <li>
            Período: por defecto los últimos 30 días; se puede acotar con Desde y Hasta, con un
            máximo de 30 días inclusive.
          </li>
          <li>Incluye: pacientes, historia_clinica, agenda y caja.</li>
          <li>No incluye: secretos, credenciales ni tokens.</li>
          <li>Tamaño esperado: menos de 10 MB.</li>
        </ul>
      </section>

      <section aria-labelledby="descarga-exportacion">
        <h2 id="descarga-exportacion">Exportar datos</h2>
        <TextField
          label="Desde"
          onChange={(evento) => setDesde(evento.target.value)}
          type="date"
          value={desde}
        />
        <TextField
          error={errorPeriodo ?? undefined}
          label="Hasta"
          onChange={(evento) => setHasta(evento.target.value)}
          type="date"
          value={hasta}
        />
        {mensajeError !== null ? <p role="alert">{mensajeError}</p> : null}
        <div>
          <Button disabled={descargando} onClick={() => void descargar()}>
            {descargando ? "Generando…" : "Descargar exportación"}
          </Button>
        </div>
      </section>

      <SeccionImportacion />
      {aviso !== null ? <Toast onDismiss={cerrarAviso}>{aviso}</Toast> : null}
    </section>
  );
}
