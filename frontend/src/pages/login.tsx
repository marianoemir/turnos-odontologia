import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate, useSearchParams } from "react-router-dom";
import { z } from "zod";

import { ApiError } from "../types/errors";
import { Button } from "../components/button";
import { Card } from "../components/card";
import { TextField } from "../components/text-field";
import { login } from "../auth/login";
import { safeReturnTo } from "../auth/navigation";
import { useSession } from "../auth/use-session";

const loginSchema = z.object({
  dni: z.string().trim().min(1, "Ingresá tu DNI.").max(32, "El DNI no puede superar los 32 caracteres."),
  password: z.string().min(1, "Ingresá tu contraseña.").max(128, "La contraseña no puede superar los 128 caracteres."),
  sucursalId: z.string().optional(),
});

type LoginValues = z.infer<typeof loginSchema>;

const DETALLE_SUCURSAL_REQUERIDA =
  "Debe especificar una sucursal_id entre las asociadas";

function isSucursalRequiredError(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    error.status === 422 &&
    error.causa === "sucursal_requerida" &&
    error.detalle === DETALLE_SUCURSAL_REQUERIDA
  );
}

function messageForLoginError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return "Credenciales inválidas.";
    if (error.status === 403 && error.causa === "sucursal_no_asociada") {
      return "La sucursal indicada no está autorizada.";
    }
    if (error.status === 403) return "No es posible iniciar sesión con esta cuenta.";
    if (error.status === 422) return "Revisá los datos ingresados.";
  }
  return "No fue posible iniciar sesión. Intentá nuevamente.";
}

export default function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { startSession } = useSession();
  const [requiresSucursal, setRequiresSucursal] = useState(false);
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    setError,
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema) });

  async function onSubmit(values: LoginValues): Promise<void> {
    let sucursalId: string | undefined;
    if (requiresSucursal) {
      const parsedSucursalId = z.string().uuid("Ingresá una sucursal ID UUID válida.").safeParse(values.sucursalId);
      if (!parsedSucursalId.success) {
        setError("sucursalId", { message: parsedSucursalId.error.issues[0]?.message });
        return;
      }
      sucursalId = parsedSucursalId.data;
    }

    try {
      const session = await login(values.dni, values.password, sucursalId);
      startSession(session);
      navigate(safeReturnTo(searchParams.get("returnTo"), session.rol), { replace: true });
    } catch (error) {
      if (isSucursalRequiredError(error) && !requiresSucursal) {
        setRequiresSucursal(true);
        return;
      }
      setError("root", { message: messageForLoginError(error) });
    }
  }

  return (
    <main className="public-layout">
      <Card>
        <h1>Ingresar</h1>
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <TextField
            autoComplete="username"
            error={errors.dni?.message}
            label="DNI"
            {...register("dni")}
          />
          <TextField
            autoComplete="current-password"
            error={errors.password?.message}
            label="Contraseña"
            type="password"
            {...register("password")}
          />
          {requiresSucursal ? (
            <TextField
              autoComplete="off"
              error={errors.sucursalId?.message}
              helpText="Ingresá el identificador UUID provisto por tu canal operativo autorizado."
              inputMode="text"
              label="Sucursal ID"
              {...register("sucursalId")}
            />
          ) : null}
          {errors.root?.message ? <p role="alert">{errors.root.message}</p> : null}
          <Button disabled={isSubmitting} type="submit">Ingresar</Button>
        </form>
      </Card>
    </main>
  );
}
