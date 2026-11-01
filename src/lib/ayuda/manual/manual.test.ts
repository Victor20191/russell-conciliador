import { describe, expect, it } from "vitest";
import { RUTA_LOGO_BLANCO } from "@/lib/marca/html";
import { MODULOS_IMPORT } from "@/lib/modulos/descriptores";
import { MATRIZ } from "@/lib/rbac/catalogo";
import { PASOS_CICLO } from "../ciclo";
import { fichaAyuda, permisosAyuda } from "../fichas";
import { AREAS_QUIEN_HACE_QUE } from "../quien-hace-que";
import type { FichaId } from "../resolver";
import { rolesPorPermiso } from "../roles";
import { combinarVariantes, etiquetaSolo, fichaManual, fusionarOrdenado, MARCADOR_MODULO, type FichaManual } from "./combinar";
import { documentoManual, unidadesManual, type DatosManual } from "./html";

const MODULOS = Object.values(MODULOS_IMPORT);
const DE_MODULO: FichaId[] = [
  "modulo.cargados",
  "modulo.borradores",
  "modulo.borrador",
  "modulo.cargue",
  "modulo.patrones",
  "modulo.formatos_propios",
  "parametros.filtros_cuentas",
];
const combinada = (id: FichaId) =>
  combinarVariantes(MODULOS.map((d) => ({ etiqueta: d.label, ficha: fichaAyuda({ fichaId: id, modulo: d.codigo })! })));

describe("manual: juntar las pantallas de los módulos", () => {
  it("une listas conservando el orden de cada una", () => {
    const r = fusionarOrdenado(
      [
        { variante: "A", items: ["uno", "dos", "cuatro"] },
        { variante: "B", items: ["uno", "tres", "cuatro"] },
      ],
      (x) => x,
    );
    expect(r.map((o) => o[0]!.item)).toEqual(["uno", "tres", "dos", "cuatro"]);
    expect(r.map((o) => o.map((x) => x.variante).join(""))).toEqual(["AB", "B", "A", "AB"]);
  });

  it("no pierde ninguna acción ni condición de ningún módulo", () => {
    const igual = (texto: string, original: string, modulo: string) => texto === original || texto === original.replaceAll(modulo, MARCADOR_MODULO);
    for (const id of DE_MODULO) {
      const f = combinada(id);
      const etapas = [...f.etapas.map((e) => ({ pestana: "", e })), ...f.pestanas.flatMap((p) => p.etapas.map((e) => ({ pestana: p.id, e })))];
      for (const d of MODULOS) {
        const original = fichaAyuda({ fichaId: id, modulo: d.codigo })!;
        const propias = [
          ...original.etapas.flatMap((e) => e.acciones.map((a) => ({ pestana: "", etapa: e.titulo, a }))),
          ...(original.pestanas ?? []).flatMap((p) => p.etapas.flatMap((e) => e.acciones.map((a) => ({ pestana: p.id, etapa: e.titulo, a })))),
        ];
        for (const { pestana, etapa, a } of propias) {
          const enEtapa = etapas
            .filter((x) => x.pestana === pestana && x.e.en?.includes(d.label) && igual(x.e.titulo, etapa, d.label))
            .flatMap((x) => x.e.acciones);
          const hallada = enEtapa.find((x) => x.en?.includes(d.label) && igual(x.nombre, a.nombre, d.label));
          expect(hallada, `${id} · ${d.label} · ${etapa} · ${a.nombre}`).toBeDefined();
          for (const c of a.condiciones ?? []) {
            expect(
              hallada!.condiciones.some((x) => x.en?.includes(d.label) && [c, c.replaceAll(d.label, MARCADOR_MODULO)].includes(x.texto)),
              `${id} · ${d.label} · ${a.nombre} · ${c}`,
            ).toBe(true);
          }
        }
      }
    }
  });

  it("lo de un solo módulo conserva su nombre; lo de varios, el marcador", () => {
    const f = combinada("modulo.cargados");
    expect(f.titulo).toBe(MARCADOR_MODULO);
    const cargar = f.etapas[0]!.acciones[0]!;
    expect(cargar.nombre).toBe(`Cargar ${MARCADOR_MODULO}`);
    expect(cargar.en).toHaveLength(MODULOS.length);
    const soloUno = [...f.etapas.flatMap((e) => e.acciones)].filter((a) => a.en?.length === 1);
    expect(soloUno.every((a) => !a.nombre.includes(MARCADOR_MODULO))).toBe(true);
  });

  it("rotula lo que no está en todas las variantes", () => {
    const todos = ["Inventarios", "Activos Fijos", "Cartera", "Cuentas por Pagar", "Ingresos", "Nómina"];
    expect(etiquetaSolo(todos, todos)).toBeNull();
    expect(etiquetaSolo(undefined, todos)).toBeNull();
    expect(etiquetaSolo(["Nómina"], todos)).toBe("Solo en Nómina");
    expect(etiquetaSolo(["Cartera", "Cuentas por Pagar"], todos)).toBe("En Cartera y Cuentas por Pagar");
    expect(etiquetaSolo(todos.slice(1), todos)).toBe("En todos menos Inventarios");
    expect(etiquetaSolo(["Nómina"], [])).toBeNull();
  });
});

describe("manual: documento", () => {
  const roles = rolesPorPermiso(MATRIZ, [], permisosAyuda());
  const ficha = (id: FichaId): FichaManual => (DE_MODULO.includes(id) ? combinada(id) : fichaManual(fichaAyuda({ fichaId: id })!));
  const datos: DatosManual = {
    version: "9.9.9",
    fecha: "1 de enero de 2030",
    roles,
    ciclo: PASOS_CICLO.map((p, i) => ({ numero: i + 1, titulo: p.titulo, descripcion: p.descripcion, regla: p.regla, donde: "Clientes" })),
    capitulos: AREAS_QUIEN_HACE_QUE.map((a, i) => ({
      id: `cap-${i + 1}`,
      titulo: a.titulo,
      intro: [],
      pantallas: a.fichas.map((id) => ({ id: id.replace(".", "-"), ficha: ficha(id) })),
    })),
  };

  it("trae portada, contenido, guía, ciclo y una unidad por pantalla", () => {
    const unidades = unidadesManual(datos);
    const pantallas = AREAS_QUIEN_HACE_QUE.flatMap((a) => a.fichas);
    expect(unidades.map((u) => u.id).slice(0, 4)).toEqual(["portada", "contenido", "como-usar", "ciclo"]);
    expect(unidades).toHaveLength(4 + pantallas.length);
    const html = documentoManual(unidades, "");
    expect(html).not.toMatch(/undefined|\[object Object\]/);
    expect(html).toContain("Versión 9.9.9");
    expect(unidades[0]!.html).toContain(RUTA_LOGO_BLANCO); // el logotipo oficial, sin redibujar
    expect(html).toContain('<span class="chip">Solo administradores</span>');
  });

  it("pone los números del contenido y no repite el capítulo con su primera pantalla homónima", () => {
    const html = unidadesManual(datos, new Map([["como-usar", 3]]))[1]!.html;
    expect(html).toMatch(/Cómo usar este manual<\/span><span class="toc-pag">3</);
    const mesa = unidadesManual(datos).find((u) => u.id === "soporte-mesa_ayuda")!;
    expect(mesa.contenido.map((e) => e.nivel)).toEqual([1]);
    expect(mesa.html).not.toContain("<h2");
  });
});
