/**
 * Límite de error del contenido (design D10).
 *
 * Se monta **dentro** del shell, envolviendo sólo el `<Outlet/>`: cuando una
 * pantalla lanza durante el render, el fallback reemplaza el contenido y la
 * navegación lateral sigue visible (la app no queda en blanco). Montarlo por
 * fuera del shell taparía la navegación, que es justo lo que la spec prohíbe.
 */
import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { hayError: boolean };

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hayError: false };

  static getDerivedStateFromError(): State {
    return { hayError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("Fallo de render en el shell", error, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.hayError) {
      return (
        <section role="alert">
          <h2 className="app-title">No se pudo mostrar esta pantalla</h2>
          <p>Ocurrió un error al mostrar el contenido. Probá con otra sección.</p>
        </section>
      );
    }

    return this.props.children;
  }
}
