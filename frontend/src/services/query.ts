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
  turnos: { all: ["turnos"] as const },
} as const;

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
