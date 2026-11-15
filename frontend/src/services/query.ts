import {
  useMutation,
  useQueryClient,
  type MutationFunction,
} from "@tanstack/react-query";

/**
 * Cada recurso usa una raíz estable. Las futuras claves más específicas se
 * anidan bajo esta raíz, por ejemplo `["turnos", "agenda", fecha]`.
 */
export const resourceKeys = {
  pacientes: { all: ["pacientes"] as const },
  profesionales: { all: ["profesionales"] as const },
  prestaciones: { all: ["prestaciones"] as const },
  sillones: { all: ["sillones"] as const },
  horarios: { all: ["horarios"] as const },
  bloqueos: { all: ["bloqueos"] as const },
  turnos: { all: ["turnos"] as const },
  roles: { all: ["roles"] as const },
  sucursales: { all: ["sucursales"] as const },
  usuariosSucursal: { all: ["usuarios-sucursal"] as const },
  caja: { all: ["caja"] as const },
  liquidaciones: { all: ["liquidaciones"] as const },
} as const;

/** Clave de consulta de caja por fecha, anidada bajo la raíz del recurso. */
export function cajaPorFechaQueryKey(fecha: string) {
  return [...resourceKeys.caja.all, fecha] as const;
}

type Resource = keyof typeof resourceKeys;

/**
 * Las mutaciones exitosas invalidan la raíz de su recurso para que sus
 * consultas dependientes obtengan datos actuales.
 */
export function useResourceMutation<TData, TVariables>(
  resource: Resource,
  mutationFn: MutationFunction<TData, TVariables>,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn,
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: resourceKeys[resource].all,
      }),
  });
}
