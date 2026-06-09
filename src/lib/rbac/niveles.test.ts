import { describe, test, expect } from "vitest";
import {
  ACCION_NIVEL,
  NIVELES,
  nivelDeAccion,
  nivelesDeModulo,
  permisosDeNivel,
  nivelActual,
  esNivelParcial,
  type Nivel,
  type PermisoLite,
} from "./niveles";
import { PERMISOS } from "./catalogo";

// Constructor de permisos sintéticos para un módulo de prueba.
let nextId = 1;
const p = (action: string, module = "mod"): PermisoLite => ({
  id: nextId++,
  code: `${module}:${action}`,
  module,
  action,
});

// Módulo sintético con una acción por nivel (rangos 1..4).
const MOD = [p("ver"), p("comentar"), p("crear"), p("configurar")];
const [VER, COMENTAR, CREAR, CONFIGURAR] = MOD;

// Los permisos del catálogo no llevan `id`; se mapean a PermisoLite con ids
// estables (únicos dentro del módulo, que es lo único que usan las funciones).
const liteDeCatalogo = (module: string): PermisoLite[] =>
  PERMISOS.filter((perm) => perm.module === module).map((perm, i) => ({
    id: i + 1,
    code: perm.code,
    module: perm.module,
    action: perm.action,
  }));

describe("nivelDeAccion", () => {
  test("mapea cada acción del catálogo a su nivel", () => {
    expect(nivelDeAccion("ver")).toBe("ver");
    expect(nivelDeAccion("comentar")).toBe("comentar");
    for (const a of ["crear", "editar", "ejecutar", "revisar"]) {
      expect(nivelDeAccion(a)).toBe("operar");
    }
    for (const a of ["configurar", "asignar", "supervisar", "eliminar"]) {
      expect(nivelDeAccion(a)).toBe("administrar");
    }
  });

  test("fail-safe: una acción desconocida cae a 'administrar' (lo más restrictivo)", () => {
    expect(nivelDeAccion("exportar")).toBe("administrar");
    expect(nivelDeAccion("")).toBe("administrar");
  });

  test("ACCION_NIVEL cubre exactamente las 10 acciones del modelo", () => {
    expect(Object.keys(ACCION_NIVEL).sort()).toEqual(
      ["asignar", "comentar", "configurar", "crear", "editar", "ejecutar", "eliminar", "revisar", "supervisar", "ver"],
    );
  });
});

describe("nivelesDeModulo", () => {
  test("siempre ofrece 'ninguno' primero y solo los niveles presentes, en orden ascendente", () => {
    expect(nivelesDeModulo(MOD)).toEqual(["ninguno", "ver", "comentar", "operar", "administrar"]);
  });

  test("omite niveles sin acción presente en el módulo", () => {
    // ver(1) + eliminar(administrar) → no hay comentar ni operar.
    const perms = [p("ver"), p("eliminar")];
    expect(nivelesDeModulo(perms)).toEqual(["ninguno", "ver", "administrar"]);
  });

  test("un módulo vacío solo ofrece 'ninguno'", () => {
    expect(nivelesDeModulo([])).toEqual(["ninguno"]);
  });
});

describe("permisosDeNivel (acumulativo por rango)", () => {
  test("'ninguno' no concede nada", () => {
    expect(permisosDeNivel(MOD, "ninguno")).toEqual([]);
  });

  test("cada nivel concede su acción y todas las inferiores", () => {
    expect(new Set(permisosDeNivel(MOD, "ver"))).toEqual(new Set([VER.id]));
    expect(new Set(permisosDeNivel(MOD, "comentar"))).toEqual(new Set([VER.id, COMENTAR.id]));
    expect(new Set(permisosDeNivel(MOD, "operar"))).toEqual(new Set([VER.id, COMENTAR.id, CREAR.id]));
    expect(new Set(permisosDeNivel(MOD, "administrar"))).toEqual(
      new Set([VER.id, COMENTAR.id, CREAR.id, CONFIGURAR.id]),
    );
  });

  test("acumula por RANGO aunque falte el nivel intermedio (no concede el nivel ausente)", () => {
    // Módulo con ver(1) y asignar(administrar=4): elegir 'operar' (3) no añade nada
    // por encima de 'ver' porque asignar es rango 4 > 3.
    const perms = [p("ver"), p("asignar")];
    const [v] = perms;
    expect(new Set(permisosDeNivel(perms, "operar"))).toEqual(new Set([v.id]));
  });
});

describe("nivelActual (nivel mostrado en la celda)", () => {
  test("sin concesiones → 'ninguno'", () => {
    expect(nivelActual(MOD, new Set())).toBe("ninguno");
  });

  test("devuelve el nivel del permiso concedido de mayor rango", () => {
    expect(nivelActual(MOD, new Set([VER.id]))).toBe("ver");
    expect(nivelActual(MOD, new Set([VER.id, COMENTAR.id, CREAR.id]))).toBe("operar");
    expect(nivelActual(MOD, new Set([VER.id, COMENTAR.id, CREAR.id, CONFIGURAR.id]))).toBe("administrar");
  });

  test("LOSSY conocido: una concesión parcial de nivel alto se muestra por su nivel, no por su completitud", () => {
    // Solo 'configurar' (administrar) sin ver/comentar/crear → la celda dice 'administrar'.
    expect(nivelActual(MOD, new Set([CONFIGURAR.id]))).toBe("administrar");
    // Solo 'crear' (operar) sin ver/comentar → la celda dice 'operar'.
    expect(nivelActual(MOD, new Set([CREAR.id]))).toBe("operar");
  });

  test("ignora ids concedidos que no pertenecen al módulo", () => {
    expect(nivelActual(MOD, new Set([99999]))).toBe("ninguno");
  });
});

describe("esNivelParcial", () => {
  test("una concesión acumulativa completa (o vacía) NO es parcial", () => {
    expect(esNivelParcial(MOD, new Set())).toBe(false); // ninguno
    expect(esNivelParcial(MOD, new Set([VER.id]))).toBe(false);
    expect(esNivelParcial(MOD, new Set([VER.id, COMENTAR.id]))).toBe(false);
    expect(esNivelParcial(MOD, new Set([VER.id, COMENTAR.id, CREAR.id]))).toBe(false);
    expect(esNivelParcial(MOD, new Set([VER.id, COMENTAR.id, CREAR.id, CONFIGURAR.id]))).toBe(false);
  });

  test("una concesión con huecos por debajo de su nivel SÍ es parcial", () => {
    // solo configurar (administrar), sin ver/comentar/crear
    expect(esNivelParcial(MOD, new Set([CONFIGURAR.id]))).toBe(true);
    // ver + configurar: faltan comentar y crear
    expect(esNivelParcial(MOD, new Set([VER.id, CONFIGURAR.id]))).toBe(true);
    // solo crear (operar), sin ver/comentar
    expect(esNivelParcial(MOD, new Set([CREAR.id]))).toBe(true);
  });

  test("caso real del seed: Gerente en 'clientes' (solo supervisar) es parcial; Staff completo no lo es", () => {
    const clientes = liteDeCatalogo("clientes");
    const id = (action: string) => clientes.find((perm) => perm.action === action)!.id;
    // Gerente real: ver, comentar, supervisar (sin crear/editar/configurar) → administrar parcial.
    expect(esNivelParcial(clientes, new Set([id("ver"), id("comentar"), id("supervisar")]))).toBe(true);
    // Una concesión "operar" completa (ver+comentar+crear+editar) NO es parcial.
    expect(esNivelParcial(clientes, new Set([id("ver"), id("comentar"), id("crear"), id("editar")]))).toBe(false);
  });
});

describe("round-trip nivel → permisos → nivel", () => {
  test("re-materializar un nivel EXPANDE una concesión parcial (normalización al guardar)", () => {
    // Estado real: solo 'configurar'. nivelActual = administrar.
    const granted = new Set([CONFIGURAR.id]);
    const nivel = nivelActual(MOD, granted);
    expect(nivel).toBe("administrar");
    // Guardar ese nivel concede TODO el paquete acumulativo, no solo lo que había:
    const resultantes = new Set(permisosDeNivel(MOD, nivel));
    expect(resultantes).toEqual(new Set([VER.id, COMENTAR.id, CREAR.id, CONFIGURAR.id]));
    // Documenta la pérdida de información: el resultado ⊋ la concesión original.
    expect(resultantes.size).toBeGreaterThan(granted.size);
  });

  test("una concesión acumulativa sí es un punto fijo del round-trip", () => {
    const granted = new Set([VER.id, COMENTAR.id]); // == nivel 'comentar'
    const nivel = nivelActual(MOD, granted);
    expect(nivel).toBe("comentar");
    expect(new Set(permisosDeNivel(MOD, nivel))).toEqual(granted);
  });
});

describe("integración con el catálogo real (módulo 'clientes')", () => {
  const clientes = liteDeCatalogo("clientes");

  test("el seed de 'clientes' ofrece los cinco niveles", () => {
    // clientes tiene ver, comentar, crear/editar (operar) y supervisar/configurar (administrar).
    expect(nivelesDeModulo(clientes)).toEqual(["ninguno", "ver", "comentar", "operar", "administrar"]);
  });

  test("supervisar y configurar comparten nivel 'administrar' (raíz de la conflación documentada)", () => {
    expect(nivelDeAccion("supervisar")).toBe(nivelDeAccion("configurar"));
    expect(nivelDeAccion("supervisar")).toBe("administrar");
  });
});

describe("invariantes globales", () => {
  test("todo nivel concedible por un módulo es también un nivel ofrecido por ese módulo", () => {
    // Para cada módulo del catálogo y cada nivel ofrecido, permisosDeNivel no
    // concede acciones de un nivel que el módulo no ofrezca.
    const modulos = [...new Set(PERMISOS.map((perm) => perm.module))];
    for (const mod of modulos) {
      const perms = liteDeCatalogo(mod);
      const ofrecidos = new Set<Nivel>(nivelesDeModulo(perms));
      for (const nivel of NIVELES) {
        for (const id of permisosDeNivel(perms, nivel)) {
          const accion = perms.find((perm) => perm.id === id)!.action;
          expect(ofrecidos.has(nivelDeAccion(accion))).toBe(true);
        }
      }
    }
  });
});
