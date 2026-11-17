/**
 * `noindex` para las rutas públicas con token (C-21 task 2.2, design D8).
 *
 * `/confirmar/:token` y `/cancelar/:token` llegan por link y no deben
 * indexarse. Como la aplicación es una SPA, la directiva vive en una etiqueta
 * `meta[name="robots"]` que se agrega al montar la pantalla y se retira al
 * desmontarla, para no contaminar el resto de las vistas.
 *
 * Sólo las dos pantallas con token lo usan: `/reservar/:profesional` queda
 * indexable, así que el efecto no puede vivir en `PublicLayout`.
 *
 * En `StrictMode` (desarrollo) el efecto se monta, se limpia y se vuelve a
 * montar: la limpieza retira únicamente la etiqueta creada acá.
 *
 * Límite: esto no cubre crawlers que no ejecutan JavaScript. Una garantía a
 * nivel HTTP exigiría infraestructura o proxy, fuera del alcance de C-21 (D8).
 */
import { useEffect } from "react";

export function useNoindex(): void {
  useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex, nofollow";
    document.head.appendChild(meta);
    return () => {
      meta.remove();
    };
  }, []);
}
