"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/modal";

/**
 * Confirmación con el modal de la plataforma, en lugar del `confirm()` del
 * navegador (una ventana del sistema operativo, fuera de la marca).
 *
 *   if (!(await confirmarDeMarca({ mensaje: "¿Eliminar este perfil?", accion: "Eliminar" }))) return;
 */

type Pedido = { titulo: string; mensaje: string; accion: string; resolver: (ok: boolean) => void };

let mostrar: ((pedido: Pedido) => void) | null = null;

export function confirmarDeMarca({ titulo = "Confirmar", mensaje, accion = "Confirmar" }: { titulo?: string; mensaje: string; accion?: string }): Promise<boolean> {
  return new Promise((resolver) => {
    if (!mostrar) {
      resolver(false); // sin el componente montado no se confirma nada
      return;
    }
    mostrar({ titulo, mensaje, accion, resolver });
  });
}

export function ConfirmacionDeMarca() {
  const [pedido, setPedido] = useState<Pedido | null>(null);
  useEffect(() => {
    mostrar = (nuevo) => {
      setPedido((anterior) => {
        anterior?.resolver(false);
        return nuevo;
      });
    };
    return () => {
      mostrar = null;
    };
  }, []);
  const responder = (ok: boolean) => {
    pedido?.resolver(ok);
    setPedido(null);
  };
  return (
    <Modal
      open={pedido !== null}
      onClose={() => responder(false)}
      title={pedido?.titulo ?? ""}
      size="md"
      footer={
        <>
          <button type="button" onClick={() => responder(false)} className="rounded-md border border-ink-200 bg-white px-3.5 py-2 text-[12.5px] font-semibold text-ink-700 transition hover:bg-ink-50">
            Cancelar
          </button>
          <button type="button" onClick={() => responder(true)} className="rounded-md bg-err-700 px-3.5 py-2 text-[12.5px] font-semibold text-white hover:bg-err-400">
            {pedido?.accion}
          </button>
        </>
      }
    >
      <p className="text-[12.5px] leading-relaxed text-ink-700">{pedido?.mensaje}</p>
    </Modal>
  );
}
