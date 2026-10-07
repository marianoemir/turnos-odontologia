/**
 * PROVISORIO hasta C-02 (catalogo-recursos).
 * Formas copiadas de knowledge-base/04_modelo_de_datos.md; C-02 las reemplaza
 * por las reales sin cambiar el servicio (task 5.2).
 */
export interface Profesional {
  id: string;
}

export interface SillonBox {
  id: string;
  activo: boolean;
}

export interface Prestacion {
  id: string;
  duracionMin: number;
}

export interface HorarioAtencion {
  profesionalId: string;
  diaSemana: number; // 0-6
  desdeMin: number; // minutos desde medianoche
  hastaMin: number;
}

export interface Bloqueo {
  profesionalId: string | null; // null = aplica a sillón o global
  sillonId: string | null;
  desde: Date;
  hasta: Date;
}
