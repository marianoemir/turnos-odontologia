import { useState } from "react";

import { Button } from "../components/button";
import { TextField } from "../components/text-field";
import type { HistoriaClinicaOut } from "../types/api-hc";
import type { ApiError } from "../types/errors";
import {
  useActualizarHistoriaClinica,
  useCrearHistoriaClinica,
} from "../services/hc";

interface CabeceraCampos {
  antecedentes: string;
  alergias: string;
  observaciones: string;
}

function aTexto(valor: string | null | undefined): string {
  return valor ?? "";
}

function camposDeHistoria(hc: HistoriaClinicaOut): CabeceraCampos {
  return {
    antecedentes: aTexto(hc.antecedentes),
    alergias: aTexto(hc.alergias),
    observaciones: aTexto(hc.observaciones),
  };
}

function VistaLectura({
  campos,
  onEditar,
}: {
  campos: CabeceraCampos;
  onEditar: () => void;
}) {
  return (
    <section aria-label="Cabecera de historia clínica">
      <div>
        <p>Antecedentes</p>
        <p>{campos.antecedentes}</p>
      </div>
      <div>
        <p>Alergias</p>
        <p>{campos.alergias}</p>
      </div>
      <div>
        <p>Observaciones</p>
        <p>{campos.observaciones}</p>
      </div>
      <Button onClick={onEditar} type="button">
        Editar cabecera
      </Button>
    </section>
  );
}

function FormularioCabecera({
  titulo,
  submitLabel,
  valoresIniciales,
  onCancelar,
  onSubmit,
  pendiente,
  errorMensaje,
}: {
  titulo: string;
  submitLabel: string;
  valoresIniciales: CabeceraCampos;
  onCancelar?: () => void;
  onSubmit: (valores: CabeceraCampos) => void;
  pendiente: boolean;
  errorMensaje: string | null;
}) {
  const [valores, setValores] = useState<CabeceraCampos>(valoresIniciales);

  return (
    <form
      aria-label={titulo}
      onSubmit={(evento) => {
        evento.preventDefault();
        if (!pendiente) {
          onSubmit(valores);
        }
      }}
    >
      <TextField
        label="Antecedentes"
        value={valores.antecedentes}
        onChange={(evento) =>
          setValores((prev) => ({ ...prev, antecedentes: evento.target.value }))
        }
        disabled={pendiente}
      />
      <TextField
        label="Alergias"
        value={valores.alergias}
        onChange={(evento) =>
          setValores((prev) => ({ ...prev, alergias: evento.target.value }))
        }
        disabled={pendiente}
      />
      <TextField
        label="Observaciones"
        value={valores.observaciones}
        onChange={(evento) =>
          setValores((prev) => ({ ...prev, observaciones: evento.target.value }))
        }
        disabled={pendiente}
      />
      {errorMensaje ? <p role="alert">{errorMensaje}</p> : null}
      <div>
        {onCancelar ? (
          <Button
            disabled={pendiente}
            onClick={onCancelar}
            type="button"
            variant="secondary"
          >
            Cancelar
          </Button>
        ) : null}
        <Button disabled={pendiente} type="submit">
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

function mensajeErrorApi(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    const msg = (error as { message?: unknown }).message;
    if (typeof msg === "string" && msg.length > 0) {
      return msg;
    }
  }
  return "No se pudo guardar la cabecera.";
}

export function HistoriaClinicaCabeceraExistente({
  historia,
}: {
  historia: HistoriaClinicaOut;
}) {
  const [modo, setModo] = useState<"lectura" | "edicion">("lectura");
  const [errorMensaje, setErrorMensaje] = useState<string | null>(null);
  const actualizar = useActualizarHistoriaClinica();

  const valoresServidor = camposDeHistoria(historia);

  async function guardar(valores: CabeceraCampos): Promise<void> {
    setErrorMensaje(null);
    const base = camposDeHistoria(historia);
    const body: {
      antecedentes?: string;
      alergias?: string;
      observaciones?: string;
    } = {};
    if (valores.antecedentes !== base.antecedentes) {
      body.antecedentes = valores.antecedentes;
    }
    if (valores.alergias !== base.alergias) {
      body.alergias = valores.alergias;
    }
    if (valores.observaciones !== base.observaciones) {
      body.observaciones = valores.observaciones;
    }
    if (Object.keys(body).length === 0) {
      setModo("lectura");
      return;
    }
    try {
      await actualizar.mutateAsync({ hcId: historia.id, body });
      setModo("lectura");
    } catch (error) {
      setErrorMensaje(mensajeErrorApi(error));
      setModo("lectura");
    }
  }

  if (modo === "lectura") {
    return (
      <>
        {errorMensaje ? <p role="alert">{errorMensaje}</p> : null}
        <VistaLectura
          campos={valoresServidor}
          onEditar={() => {
            setErrorMensaje(null);
            setModo("edicion");
          }}
        />
      </>
    );
  }

  return (
    <FormularioCabecera
      key={historia.id}
      titulo="Editar cabecera"
      submitLabel="Guardar cabecera"
      valoresIniciales={valoresServidor}
      onCancelar={() => {
        setErrorMensaje(null);
        setModo("lectura");
      }}
      onSubmit={(valores) => {
        void guardar(valores);
      }}
      pendiente={actualizar.isPending}
      errorMensaje={errorMensaje}
    />
  );
}

export function HistoriaClinicaCabeceraCrear({
  pacienteId,
}: {
  pacienteId: string;
}) {
  const crear = useCrearHistoriaClinica();
  const [errorMensaje, setErrorMensaje] = useState<string | null>(null);
  const iniciales: CabeceraCampos = {
    antecedentes: "",
    alergias: "",
    observaciones: "",
  };

  async function crearHistoria(valores: CabeceraCampos): Promise<void> {
    setErrorMensaje(null);
    try {
      await crear.mutateAsync({
        paciente_id: pacienteId,
        antecedentes: valores.antecedentes,
        alergias: valores.alergias,
        observaciones: valores.observaciones,
      });
    } catch (error) {
      const apiError = error as ApiError | null;
      if (apiError?.status === 409) {
        setErrorMensaje(
          apiError.detalle || apiError.message || "Conflicto al crear la historia clínica.",
        );
      } else {
        setErrorMensaje(mensajeErrorApi(error));
      }
    }
  }

  return (
    <FormularioCabecera
      titulo="Crear historia clínica"
      submitLabel="Crear historia clínica"
      valoresIniciales={iniciales}
      onSubmit={(valores) => void crearHistoria(valores)}
      pendiente={crear.isPending}
      errorMensaje={errorMensaje}
    />
  );
}
