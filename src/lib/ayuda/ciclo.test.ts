import { describe, expect, it } from "vitest";
import { MATRIZ } from "@/lib/rbac/catalogo";
import { CODIGOS_MODULOS, resolverAyuda } from "./resolver";
import { cicloDisponible, enlaceDePaso, estaEnPaso, filtrarPasos, PASOS_CICLO } from "./ciclo";
import { fichaAyuda, permisosAyuda } from "./fichas";
import { chipsDeRoles, rolesDeRegla, rolesPorPermiso } from "./roles";
import type { AccionAyuda } from "./tipos";

const ROLES = rolesPorPermiso(MATRIZ, [], permisosAyuda());

describe("ciclo del cliente", () => {
  it("cada paso es una acción de su pantalla, con la misma regla, en todos los módulos", () => {
    for (const codigo of CODIGOS_MODULOS) {
      for (const paso of PASOS_CICLO) {
        const [lugar] = paso.donde;
        const ficha = fichaAyuda({ fichaId: lugar!.fichaId, modulo: codigo })!;
        const acciones: AccionAyuda[] = lugar!.pestana
          ? ficha.pestanas!.find((p) => p.id === lugar!.pestana)!.etapas.flatMap((e) => e.acciones)
          : ficha.etapas.flatMap((e) => e.acciones);
        expect(acciones.some((a) => a.regla === paso.regla), `${codigo} · ${paso.titulo}`).toBe(true);
      }
    }
  });

  it("cada paso lo hace algún rol de la operación y enlaza a una pantalla", () => {
    for (const paso of PASOS_CICLO) {
      const chips = chipsDeRoles(rolesDeRegla(paso.regla, ROLES));
      expect(chips.length, paso.titulo).toBeGreaterThan(0);
      expect(chips.some((c) => c.texto.startsWith("Solo ")), paso.titulo).toBe(false);
      expect(enlaceDePaso(paso, "NOM"), paso.titulo).not.toBeNull();
    }
    expect(enlaceDePaso(PASOS_CICLO.find((p) => p.titulo === "Cerrar la conciliación en firme")!, "CAR")?.href).toBe("/modulos/car");
  });

  it("marca el paso de la pantalla y la pestaña en que está el usuario", () => {
    const aprobar = PASOS_CICLO.find((p) => p.titulo === "Aprobar el prevalidador")!;
    const cerrar = PASOS_CICLO.find((p) => p.titulo === "Cerrar el balance")!;
    const detalle = { fichaId: "balance.detalle" as const };
    expect(estaEnPaso(aprobar, detalle, "prevalidador")).toBe(true);
    expect(estaEnPaso(aprobar, detalle, "breakdown")).toBe(false);
    expect(estaEnPaso(cerrar, detalle, "breakdown")).toBe(true);
    expect(estaEnPaso(cerrar, null, null)).toBe(false);
  });

  it("la vista del ciclo solo está en Balance, sus borradores y los Módulos", () => {
    const con = ["/balance", "/balance/12", "/balance/12/diff", "/balance/borradores/3", "/modulos/nom", "/modulos/inv/borradores/4", "/modulos/car/7"];
    const sin = [
      "/config/mapeo",
      "/config/mapeo-cliente",
      "/config/conceptos-nomina",
      "/config/clientes",
      "/config/usuarios",
      "/estructura",
      "/perfil",
      "/config/prevalidador/nom",
      "/config/parametros",
      "/reportes",
      "/inicio",
    ];
    for (const ruta of con) expect(cicloDisponible(resolverAyuda(ruta)), ruta).toBe(true);
    for (const ruta of sin) expect(cicloDisponible(resolverAyuda(ruta)), ruta).toBe(false);
  });

  it("la búsqueda conserva el número de cada paso", () => {
    expect(filtrarPasos("")).toHaveLength(PASOS_CICLO.length);
    const [prevalidador] = filtrarPasos("PREVALIDADOR");
    expect(prevalidador?.numero).toBe(PASOS_CICLO.findIndex((p) => p.titulo === "Aprobar el prevalidador") + 1);
  });
});
