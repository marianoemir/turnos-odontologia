/**
 * Pantalla de no encontrado (design D10).
 *
 * Se renderiza dentro del `<Outlet/>` del shell, como ruta catch-all `*`: la
 * navegación sigue disponible y la ruta no declarada (o con el segmento
 * obligatorio ausente) no lanza.
 */
export default function NotFound() {
  return (
    <section>
      <h1 className="app-title">No encontrado</h1>
      <p>La dirección no existe o le falta un dato.</p>
    </section>
  );
}
