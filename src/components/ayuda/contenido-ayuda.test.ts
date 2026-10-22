import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { FICHA_BALANCE_DETALLE } from "@/lib/ayuda/fichas/balance";
import { REGLAS } from "@/lib/ayuda/reglas";
import { rolesPorPermiso } from "@/lib/ayuda/roles";
import type { FichaAyuda } from "@/lib/ayuda/tipos";
import { MATRIZ } from "@/lib/rbac/catalogo";
import ContenidoAyuda, { type ContenidoAyudaProps } from "./contenido-ayuda";

vi.stubGlobal("React", React);

const ROLES = rolesPorPermiso(MATRIZ, [], Object.values(REGLAS).flatMap((r) => r.flatMap((v) => v.permisos)));

function render(props: Partial<ContenidoAyudaProps>): string {
  const permisos = props.permisos ?? MATRIZ.Staff ?? [];
  return renderToStaticMarkup(
    React.createElement(ContenidoAyuda, {
      ficha: FICHA_BALANCE_DETALLE,
      rolesAyuda: ROLES,
      rol: "Staff",
      permisos,
      puedeAbrir: (p: string) => permisos.includes(p),
      pestanaId: null,
      pestanaAnunciada: null,
      onPestana: () => {},
      buscando: false,
      ...props,
    }),
  );
}

describe("ContenidoAyuda", () => {
  it("muestra quién de la operación puede cada acción y sobre qué clientes", () => {
    const html = render({});
    expect(html).toContain("Todos los roles");
    expect(html).toMatch(/Senior<span[^>]*> · sus clientes<\/span>/);
    // Los administradores no se listan; lo que solo ellos hacen se dice así.
    expect(html).not.toMatch(/>Administrador</);
    expect(html).not.toMatch(/>Superadministrador</);
    expect(html).toContain("Solo administradores");
  });

  it("marca con texto lo que el rol del usuario puede hacer", () => {
    const ficha: FichaAyuda = {
      id: "prueba",
      titulo: "Prueba",
      proposito: "Ficha de prueba.",
      etapas: [
        {
          titulo: "Etapa",
          acciones: [
            { nombre: "Ver", queHace: "Consulta.", regla: REGLAS.verBalance },
            { nombre: "Cerrar", queHace: "Cierra.", regla: REGLAS.revisarBalance },
          ],
        },
      ],
    };
    expect(render({ ficha }).match(/Tu rol puede/g)).toHaveLength(1);
    expect(render({ ficha, rol: "Senior", permisos: MATRIZ.Senior }).match(/Tu rol puede/g)).toHaveLength(2);
  });

  it("abre la pestaña elegida y señala en cuál está el usuario", () => {
    const html = render({ pestanaId: "prevalidador", pestanaAnunciada: "prevalidador" });
    expect(html).toContain("Aprobar prevalidador");
    expect(html).toContain("· estás aquí");
    expect(html).not.toContain("Dejar pendiente por asignar");
  });

  it("solo enlaza las páginas que el usuario puede abrir", () => {
    expect(render({})).toContain('href="/config/mapeo-cliente"');
    expect(render({ permisos: ["balance:ver"] })).not.toContain('href="/config/mapeo-cliente"');
  });

  it("sin ficha lo dice y ofrece la Mesa de ayuda", () => {
    const html = render({ ficha: null });
    expect(html).toContain("Aún no hay ayuda para esta pantalla.");
    expect(html).toContain('href="/reportes"');
    expect(render({ ficha: null, permisos: [] })).not.toContain('href="/reportes"');
  });
});
