import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { TABS_BALANCE } from "@/app/(app)/balance/[id]/tabs";
import { TABS_CARGUE } from "@/app/(app)/modulos/[codigo]/[id]/tabs";
import { TABS_PLAN_RUSSELL } from "@/app/(app)/config/mapeo/tabs";
import { ESTADO_CERRADO, ESTADO_EN_PROCESO, ESTADO_EN_PROCESO_CON_ALERTAS } from "@/lib/balance/estado-balance";
import { MODULOS_IMPORT } from "@/lib/modulos/descriptores";
import { PERMISOS } from "@/lib/rbac/catalogo";
import { fichaAyuda, permisosAyuda, permisosDeFicha, todasLasFichas } from "./fichas";
import { PANTALLAS } from "./pantallas";
import { REGLAS } from "./reglas";
import type { AccionAyuda, FichaAyuda } from "./tipos";

const RAIZ = path.resolve(__dirname, "../../..");
const APP = path.join(RAIZ, "src/app/(app)");
const CODIGOS_PERMISO = new Set(PERMISOS.map((p) => p.code));

function acciones(ficha: FichaAyuda): AccionAyuda[] {
  return [...ficha.etapas, ...(ficha.pestanas ?? []).flatMap((p) => p.etapas)].flatMap((e) => e.acciones);
}

/** ¿Hay una página para la ruta? Recorre los segmentos aceptando carpetas dinámicas «[x]». */
function existePagina(href: string): boolean {
  let dir = APP;
  for (const seg of href.split("/").filter(Boolean)) {
    if (existsSync(path.join(dir, seg))) {
      dir = path.join(dir, seg);
      continue;
    }
    const dinamica = readdirSync(dir).find((d) => d.startsWith("[") && !d.startsWith("[["));
    if (!dinamica) return false;
    dir = path.join(dir, dinamica);
  }
  return existsSync(path.join(dir, "page.tsx"));
}

const FICHAS = todasLasFichas();

describe("fichas de ayuda", () => {
  it("cada ficha tiene propósito y al menos una acción", () => {
    for (const f of FICHAS) {
      expect(f.proposito.trim(), f.id).not.toBe("");
      expect(acciones(f).length, f.id).toBeGreaterThan(0);
    }
  });

  it("cada permiso citado existe en el catálogo y cada vía cita al menos uno", () => {
    for (const f of FICHAS) {
      for (const a of acciones(f)) {
        expect(a.regla.length, `${f.id} · ${a.nombre}`).toBeGreaterThan(0);
        // Solo «cualquier usuario» (Mi perfil) tiene una vía sin permisos.
        if (a.regla === REGLAS.cualquierUsuario) continue;
        for (const via of a.regla) expect(via.permisos.length, `${f.id} · ${a.nombre}`).toBeGreaterThan(0);
      }
      for (const p of permisosDeFicha(f)) expect(CODIGOS_PERMISO.has(p), `${f.id} cita ${p}`).toBe(true);
    }
  });

  it("no repite acciones dentro de una misma etapa", () => {
    for (const f of FICHAS) {
      for (const e of [...f.etapas, ...(f.pestanas ?? []).flatMap((p) => p.etapas)]) {
        const nombres = e.acciones.map((a) => a.nombre);
        expect(new Set(nombres).size, `${f.id} · ${e.titulo}`).toBe(nombres.length);
      }
    }
  });

  it("las pestañas son las de la pantalla", () => {
    const balance = fichaAyuda({ fichaId: "balance.detalle" })!;
    expect(balance.pestanas?.map((p) => p.id)).toEqual([...TABS_BALANCE]);
    const plan = fichaAyuda({ fichaId: "catalogo.plan_russell" })!;
    expect(plan.pestanas?.map((p) => p.id)).toEqual([...TABS_PLAN_RUSSELL]);
    for (const codigo of Object.keys(MODULOS_IMPORT)) {
      const cargue = fichaAyuda({ fichaId: "modulo.cargue", modulo: codigo })!;
      for (const p of cargue.pestanas ?? []) expect(TABS_CARGUE as readonly string[], `${codigo} · ${p.id}`).toContain(p.id);
    }
  });

  it("cada módulo ve solo sus pestañas y preguntas propias", () => {
    const pestanas = (codigo: string) => fichaAyuda({ fichaId: "modulo.cargue", modulo: codigo })!.pestanas!.map((p) => p.id);
    expect(pestanas("NOM")).toContain("subcuenta");
    expect(pestanas("NOM")).not.toContain("cruceTercero");
    expect(pestanas("CAR")).toContain("cruceTercero");
    expect(pestanas("INV")).toEqual(["consolidado", "detalle", "cruce", "novedades", "versiones"]);
    const nombres = (codigo: string, id: "modulo.cargados" | "modulo.borrador") =>
      acciones(fichaAyuda({ fichaId: id, modulo: codigo })!).map((a) => a.nombre);
    expect(nombres("ING", "modulo.cargados")).toContain("¿Confirmas que excluye el IVA?");
    expect(nombres("NOM", "modulo.cargados")).not.toContain("¿Confirmas que excluye el IVA?");
    expect(nombres("INV", "modulo.borrador")).toContain("Verificaciones");
    expect(nombres("CAR", "modulo.borrador")).not.toContain("Verificaciones");
  });

  it("los estados del balance usan las etiquetas de la pantalla", () => {
    const etiquetas = fichaAyuda({ fichaId: "balance.listado" })!.estados!.map((e) => e.etiqueta);
    expect(etiquetas).toEqual(expect.arrayContaining([ESTADO_EN_PROCESO, ESTADO_EN_PROCESO_CON_ALERTAS, ESTADO_CERRADO]));
  });

  it("cada enlace relacionado lleva a una página que existe", () => {
    for (const f of FICHAS) for (const r of f.relacionadas ?? []) expect(existePagina(r.href), `${f.id} → ${r.href}`).toBe(true);
  });

  it("cada pantalla enlazable lleva a una página que existe, en todos los módulos", () => {
    for (const [fichaId, pantalla] of Object.entries(PANTALLAS)) {
      for (const codigo of Object.keys(MODULOS_IMPORT)) expect(existePagina(pantalla!.href(codigo)), `${fichaId} · ${codigo}`).toBe(true);
    }
  });

  it("los filtros de cuentas muestran lo de cada módulo", () => {
    const etapas = (codigo: string) => fichaAyuda({ fichaId: "parametros.filtros_cuentas", modulo: codigo })!.etapas.map((e) => e.titulo);
    expect(etapas("INV")).toEqual(["Prefijos del prevalidador", "Subgrupos que concilia"]);
    expect(etapas("AFI")).toEqual(["Prefijos del prevalidador", "Subgrupos que concilia", "Activo y su depreciación"]);
    expect(etapas("NOM")).toEqual(["Prefijos del prevalidador", "Cuentas que concilia"]);
    const nombres = (codigo: string) =>
      acciones(fichaAyuda({ fichaId: "parametros.filtros_cuentas", modulo: codigo })!).map((a) => a.nombre);
    expect(nombres("CAR")).toContain("Origen: Nacional · Exterior");
    expect(nombres("ING")).not.toContain("Origen: Nacional · Exterior");
    expect(nombres("NOM")).toContain("Categoría: Concilia · Solo visible");
  });

  it("cada fuente existe y verifica los permisos que cita la acción", () => {
    for (const f of FICHAS) {
      for (const a of acciones(f)) {
        if (!a.fuente) continue;
        const archivo = path.join(RAIZ, a.fuente.archivo);
        expect(existsSync(archivo), a.fuente.archivo).toBe(true);
        const codigo = readFileSync(archivo, "utf8");
        expect(codigo, `${a.fuente.archivo} · ${a.fuente.funcion}`).toMatch(new RegExp(`function ${a.fuente.funcion}\\b`));
        for (const p of a.regla.flatMap((v) => v.permisos)) {
          expect(codigo.includes(`"${p}"`), `${a.fuente.archivo} no cita ${p} (${a.nombre})`).toBe(true);
        }
      }
    }
  });

  it("al navegador solo viajan los permisos que la ayuda cita", () => {
    const enviados = permisosAyuda();
    expect(enviados).toContain("soporte:ver");
    for (const f of FICHAS) for (const p of permisosDeFicha(f)) expect(enviados).toContain(p);
    expect(enviados).not.toContain("auditoria:ia");
    expect(enviados).not.toContain("conexiones:administrar");
  });
});
