import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { filtrarPasos } from "@/lib/ayuda/ciclo";
import { permisosAyuda } from "@/lib/ayuda/fichas";
import { rolesPorPermiso } from "@/lib/ayuda/roles";
import { MATRIZ } from "@/lib/rbac/catalogo";
import VistaCiclo from "./vista-ciclo";

vi.stubGlobal("React", React);

const ROLES = rolesPorPermiso(MATRIZ, [], permisosAyuda());
const todo = () => true;

describe("vista «Ciclo del cliente»", () => {
  it("numera los pasos, marca «estás aquí» y enlaza la pantalla", () => {
    const html = renderToStaticMarkup(
      React.createElement(VistaCiclo, {
        pasos: filtrarPasos(""),
        rolesAyuda: ROLES,
        rol: "Staff",
        permisos: MATRIZ.Staff ?? [],
        actual: { fichaId: "balance.detalle" },
        pestanaActual: "prevalidador",
        modulo: "INV",
        puedeAbrir: todo,
      }),
    );
    expect(html).toContain("Asignar el equipo del cliente");
    expect(html).toContain("Cerrar la conciliación en firme");
    expect(html.match(/estás aquí/g)?.length).toBeGreaterThanOrEqual(1);
    expect(html).toContain('href="/modulos/inv"');
    expect(html).toContain("Tu rol puede");
  });
});
