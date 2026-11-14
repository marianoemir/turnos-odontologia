import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Modal } from "./modal";
import { Toast } from "./toast";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function ModalExample() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button onClick={() => setOpen(true)} type="button">Abrir confirmación</button>
      <Modal onClose={() => setOpen(false)} open={open} title="Cancelar turno">
        <button type="button">Volver</button>
        <button type="button">Cancelar turno</button>
      </Modal>
    </>
  );
}

function ToastExample() {
  const [visible, setVisible] = useState(false);

  return (
    <>
      <button onClick={() => setVisible(true)} type="button">Mostrar aviso</button>
      {visible ? <Toast duration={1000} onDismiss={() => setVisible(false)}>Turno guardado</Toast> : null}
    </>
  );
}

describe("overlays", () => {
  it("traps focus, closes on Escape, and returns focus to its trigger", async () => {
    const user = userEvent.setup();
    render(<ModalExample />);

    const trigger = screen.getByRole("button", { name: "Abrir confirmación" });
    await user.click(trigger);

    expect(screen.getByRole("dialog", { name: "Cancelar turno" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Volver" })).toHaveFocus();

    await user.tab({ shift: true });
    expect(screen.getByRole("button", { name: "Cancelar turno" })).toHaveFocus();

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("announces a toast and pauses auto-dismiss while hovered or focused", () => {
    vi.useFakeTimers();
    render(<ToastExample />);

    fireEvent.click(screen.getByRole("button", { name: "Mostrar aviso" }));
    const toast = screen.getByRole("status");

    expect(toast).toHaveTextContent("Turno guardado");
    fireEvent.mouseEnter(toast);
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByRole("status")).toBeInTheDocument();

    fireEvent.mouseLeave(toast);
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Mostrar aviso" }));
    const focusedToast = screen.getByRole("status");
    fireEvent.focus(focusedToast);
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByRole("status")).toBeInTheDocument();

    fireEvent.blur(focusedToast);
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("resumes a toast for its remaining duration after a pause", () => {
    vi.useFakeTimers();
    render(<ToastExample />);

    fireEvent.click(screen.getByRole("button", { name: "Mostrar aviso" }));
    const toast = screen.getByRole("status");
    act(() => vi.advanceTimersByTime(400));

    fireEvent.mouseEnter(toast);
    act(() => vi.advanceTimersByTime(1000));
    fireEvent.mouseLeave(toast);
    act(() => vi.advanceTimersByTime(599));
    expect(screen.getByRole("status")).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
