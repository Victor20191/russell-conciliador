import { describe, it, expect } from "vitest";
import {
  bloqueoAnexoPorVerificacionesCriticasModulo,
  bloqueoCrucePorVerificacionesCriticasModulo,
  bloqueoVerificacionesCriticasModulo,
  MODULOS_IMPORT,
  descriptorModulo,
  modulosSoportados,
} from "./descriptores";

describe("descriptores de módulos", () => {
  it("registra los 6 módulos de conciliación", () => {
    expect(modulosSoportados().sort()).toEqual(["AFI", "CAR", "CXP", "ING", "INV", "NOM"]);
  });

  for (const [codigo, d] of Object.entries(MODULOS_IMPORT)) {
    describe(`${codigo} · ${d.label}`, () => {
      const nombres = d.columnas.map((c) => c.nombre);

      it("el código del descriptor coincide con su clave", () => {
        expect(d.codigo).toBe(codigo);
        expect(descriptorModulo(codigo)).toBe(d);
      });

      it("clasificador y valor apuntan a columnas existentes", () => {
        expect(nombres).toContain(d.clasificador);
        expect(nombres).toContain(d.valor);
      });

      it("la columna del valor es numérica (moneda/numero)", () => {
        const col = d.columnas.find((c) => c.nombre === d.valor)!;
        expect(["moneda", "numero"]).toContain(col.tipo);
      });

      it("tiene al menos una columna requerida y nombres únicos", () => {
        expect(d.columnas.some((c) => c.requerido)).toBe(true);
        expect(new Set(nombres).size).toBe(nombres.length);
      });

      it("noNegativos y derivar referencian columnas válidas", () => {
        for (const c of d.noNegativos ?? []) expect(nombres).toContain(c);
        for (const [destino, regla] of Object.entries(d.derivar ?? {})) {
          expect(nombres).toContain(destino);
          const factores = "producto" in regla ? regla.producto : regla.cociente;
          for (const f of factores) expect(nombres).toContain(f);
        }
      });

      it("las verificaciones tienen id único y texto", () => {
        const ids = (d.verificaciones ?? []).map((v) => v.id);
        expect(new Set(ids).size).toBe(ids.length);
        for (const v of d.verificaciones ?? []) expect(v.texto.length).toBeGreaterThan(5);
      });
    });
  }

  it("habilita el cruce por tercero solo en CxC, CxP e Ingresos", () => {
    const habilitados = Object.values(MODULOS_IMPORT)
      .filter((d) => d.crucePorTercero.habilitado)
      .map((d) => d.codigo)
      .sort();
    expect(habilitados).toEqual(["CAR", "CXP", "ING"]);

    // Cartera dejó el rol genérico `tercero` por uno propio (`nit`, requerido): sus
    // reportes traen el identificador y el nombre en columnas separadas y el NIT es el
    // único campo sin el cual no hay conciliación posible (RF-CXC-01).
    const conRolGenericoTercero = Object.values(MODULOS_IMPORT)
      .filter((d) => d.columnas.some((c) => c.nombre === "tercero"))
      .map((d) => d.codigo)
      .sort();
    expect(conRolGenericoTercero).toEqual(["CXP", "ING"]);

    for (const d of Object.values(MODULOS_IMPORT)) {
      if (!d.crucePorTercero.habilitado && !d.crucePorTercero.rolClave) continue;
      const rolClave = d.crucePorTercero.rolClave ?? "tercero";
      expect(d.columnas.some((c) => c.nombre === rolClave), `${d.codigo}: rol ${rolClave}`).toBe(true);
      if (d.crucePorTercero.rolNombre) {
        expect(d.columnas.some((c) => c.nombre === d.crucePorTercero.rolNombre), `${d.codigo}: rol ${d.crucePorTercero.rolNombre}`).toBe(true);
      }
    }
    // La parametrización queda lista para reactivar Nómina sin reconstruir sus roles.
    expect(MODULOS_IMPORT.NOM.crucePorTercero.rolClave).toBe("cedula");
    expect(MODULOS_IMPORT.NOM.crucePorTercero.rolNombre).toBe("empleado");
  });

  it("ING exige ingreso neto y no sugiere automáticamente el total de factura", () => {
    const valor = MODULOS_IMPORT.ING.columnas.find((columna) => columna.nombre === "valor");
    expect(valor?.etiqueta).toBe("Ingreso neto sin impuestos");
    expect(valor?.sinonimos).toEqual(expect.arrayContaining(["subtotal", "base gravable", "venta neta", "valor sin iva"]));
    expect(valor?.sinonimos).not.toContain("total");
    expect(MODULOS_IMPORT.ING.verificaciones?.some((item) => item.id === "ing_sin_impuestos")).toBe(true);
  });

  it("ING solo se puede promover cuando confirma que el valor es neto de impuestos", () => {
    expect(bloqueoVerificacionesCriticasModulo(MODULOS_IMPORT.ING, {
      ing_sin_impuestos: { respuesta: "si" },
    })).toBeNull();
    for (const respuesta of ["no", "na"] as const) {
      expect(bloqueoVerificacionesCriticasModulo(MODULOS_IMPORT.ING, {
        ing_sin_impuestos: { respuesta },
      })).toContain("debe responderse Sí");
    }
  });

  it("bloquea el cruce de un ING histórico que no acredita el valor neto sin impuestos", () => {
    expect(bloqueoCrucePorVerificacionesCriticasModulo(MODULOS_IMPORT.ING, {})).toContain(
      "cargue histórico",
    );
    expect(bloqueoCrucePorVerificacionesCriticasModulo(MODULOS_IMPORT.ING, {
      ing_sin_impuestos: { respuesta: "no" },
    })).toContain("vuelve a cargarlo");
    expect(bloqueoCrucePorVerificacionesCriticasModulo(MODULOS_IMPORT.ING, {
      ing_sin_impuestos: { respuesta: "si" },
    })).toBeNull();
    expect(bloqueoCrucePorVerificacionesCriticasModulo(MODULOS_IMPORT.INV, {})).toBeNull();
  });

  it("impide anexar filas a un ING vigente que no estaba certificado", () => {
    expect(bloqueoAnexoPorVerificacionesCriticasModulo(MODULOS_IMPORT.ING, {})).toContain(
      "recarga completa",
    );
    expect(bloqueoAnexoPorVerificacionesCriticasModulo(MODULOS_IMPORT.ING, {
      ing_sin_impuestos: { respuesta: "no" },
    })).toContain("no un anexo parcial");
    expect(bloqueoAnexoPorVerificacionesCriticasModulo(MODULOS_IMPORT.ING, {
      ing_sin_impuestos: { respuesta: "si" },
    })).toBeNull();
    expect(bloqueoAnexoPorVerificacionesCriticasModulo(MODULOS_IMPORT.CAR, {})).toBeNull();
  });
});

describe("contratos nuevos del descriptor (solo Cartera los usa hoy)", () => {
  const CAR = MODULOS_IMPORT.CAR;

  it("los demás módulos NO declaran ninguno: su comportamiento no cambia", () => {
    for (const d of Object.values(MODULOS_IMPORT)) {
      if (d.codigo === "CAR") continue;
      expect(d.familiasDinamicas, d.codigo).toBeUndefined();
      expect(d.valorDerivado, d.codigo).toBeUndefined();
      expect(d.arrastrables, d.codigo).toBeUndefined();
      expect(d.rolesLlaveItem, d.codigo).toBeUndefined();
      expect(d.usarNegritaComoEstructura, d.codigo).toBeUndefined();
      expect(d.aliasLegado, d.codigo).toBeUndefined();
    }
  });

  it("Cartera declara la familia de rangos de vencimiento con su detector", () => {
    const familia = CAR.familiasDinamicas?.find((f) => f.nombre === "edades");
    expect(familia).toBeDefined();
    expect(familia?.tipo).toBe("moneda");
    expect(familia?.detector("1 - 30 DIAS")).toBe(true);
    expect(familia?.detector("POR VENCER")).toBe(true);
    expect(familia?.detector("Valor Total")).toBe(false);
  });

  it("Cartera deriva el saldo de las edades y deja que la suma mande (RF-CXC-09)", () => {
    expect(CAR.valorDerivado).toEqual({ deFamilia: "edades", prevalece: "familia" });
    // La familia de la que deriva tiene que existir.
    expect(CAR.familiasDinamicas?.some((f) => f.nombre === CAR.valorDerivado?.deFamilia)).toBe(true);
  });

  it("Cartera no rechaza saldos negativos: un anticipo es alerta, no error", () => {
    expect(CAR.noNegativos).toBeUndefined();
  });

  it("los roles declarados en los contratos existen en las columnas", () => {
    const declarados = new Set(CAR.columnas.map((c) => c.nombre));
    for (const rol of [...(CAR.arrastrables ?? []), ...(CAR.rolesLlaveItem ?? [])]) {
      expect(declarados.has(rol), rol).toBe(true);
    }
    for (const nuevo of Object.values(CAR.aliasLegado ?? {})) {
      expect(declarados.has(nuevo), nuevo).toBe(true);
    }
  });

  it("el cruce por tercero de Cartera acota el lado contable a las tres cuentas acordadas", () => {
    expect(CAR.crucePorTercero.cuentasRussell6).toEqual(["130505", "130510", "280505"]);
    expect(CAR.crucePorTercero.exigidoParaCierre).toBe(true);
    // Ningún otro módulo acota por cuenta de seis dígitos todavía.
    for (const d of Object.values(MODULOS_IMPORT)) {
      if (d.codigo === "CAR") continue;
      expect(d.crucePorTercero.cuentasRussell6, d.codigo).toBeUndefined();
    }
  });
});
