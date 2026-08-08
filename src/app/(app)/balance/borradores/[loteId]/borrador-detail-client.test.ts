import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  AvisoAutoCorreccionSoloHojas,
  type CambiosBorrador,
  combinarRevisionesReubicacion,
  construirCodigoAFilaNum,
  esAlertaNodo,
  etiquetaPerfilSoloHojas,
  filasAfectadasPorCambio,
  filtrarReubicacionesPendientes,
  GestionarAgrupadoraModal,
  NombreCuentaArbol,
  ProteccionSubtotalesPanel,
  retirarConfirmacionesLocales,
  siguienteEnfoqueCambioEstructural,
} from "./borrador-detail-client";
import type { CuentaReubicacion, IndiceReubicacion, NodoBorrador } from "@/lib/balance/borrador";
import type { RevisionReubicacionStaging } from "@/lib/balance/staging-borrador";
import { UMBRALES_ALERTAS_DEFECTO } from "@/lib/balance/umbrales-alertas";

const revisionGuardada: RevisionReubicacionStaging = {
  filaNum: 737,
  justificacion: "Reubicación revisada por criterio contable.",
  revisadaPor: "Usuario de prueba",
  revisadaPorId: 10,
  revisadaEn: "2026-07-28T15:00:00.000Z",
};

function agrupadoraManualVacia(
  codigo: string,
  montos: Partial<Pick<NodoBorrador, "saldoInicial" | "debitos" | "creditos" | "saldoFinal">> = {},
): NodoBorrador {
  return {
    filaNum: 1,
    codigo,
    codigoCrudo: codigo,
    nombre: "CUENTA DE PRUEBA",
    nivel: codigo.length,
    tipoFila: "agrupadora",
    tipoFilaForzado: "agrupadora",
    saldoInicial: 0,
    debitos: 0,
    creditos: 0,
    saldoFinal: 0,
    descuadre: null,
    subtotalDuplicado: false,
    hijos: [],
    ...montos,
  };
}

describe("filtro de alertas del borrador", () => {
  it.each([
    ["32130105", { saldoFinal: 2_128_795_465.81 }],
    ["6160030101", { debitos: 317_282_490, creditos: 347_454, saldoFinal: 1_041_123_679 }],
    ["73870205", { debitos: 584_000, saldoFinal: 584_000 }],
    ["73870206", { saldoFinal: 400_000 }],
  ])("incluye la agrupadora manual huérfana %s que aporta al descuadre", (codigo, montos) => {
    expect(esAlertaNodo(agrupadoraManualVacia(codigo, montos), UMBRALES_ALERTAS_DEFECTO)).toBe(true);
  });

  it("usa el umbral de descuadre e incluye también el saldo inicial", () => {
    const bajoUmbral = agrupadoraManualVacia("11050501", { saldoInicial: 1_999 });
    const enUmbral = agrupadoraManualVacia("11050502", { saldoInicial: 2_000 });

    expect(esAlertaNodo(bajoUmbral, UMBRALES_ALERTAS_DEFECTO)).toBe(false);
    expect(esAlertaNodo(enUmbral, UMBRALES_ALERTAS_DEFECTO)).toBe(true);
  });

  it("ignora agrupadoras manuales vacías sin materialidad, con hijos o ya omitidas", () => {
    const sinMonto = agrupadoraManualVacia("11050503");
    const conHijo = agrupadoraManualVacia("11050504", { saldoFinal: 100_000 });
    conHijo.hijos = [{ ...agrupadoraManualVacia("1105050401", { saldoFinal: 100_000 }), tipoFila: "movimiento", tipoFilaForzado: null }];
    const omitida = { ...agrupadoraManualVacia("11050505", { saldoFinal: 100_000 }), omitida: true };

    expect(esAlertaNodo(sinMonto, UMBRALES_ALERTAS_DEFECTO)).toBe(false);
    expect(esAlertaNodo(conHijo, UMBRALES_ALERTAS_DEFECTO)).toBe(false);
    expect(esAlertaNodo(omitida, UMBRALES_ALERTAS_DEFECTO)).toBe(false);
  });
});

describe("estado visual de las revisiones de reubicación", () => {
  it("mantiene la cuenta revisada con la confirmación de la acción mientras llega el refresh", () => {
    const riesgos = [{ filaNum: 737 }];
    const sinRevision = combinarRevisionesReubicacion([], []);
    expect(filtrarReubicacionesPendientes(riesgos, sinRevision)).toEqual(riesgos);

    const confirmada = combinarRevisionesReubicacion([], [revisionGuardada]);
    expect(filtrarReubicacionesPendientes(riesgos, confirmada)).toEqual([]);
    expect(confirmada.get(737)).toEqual(revisionGuardada);
  });

  it("prioriza la confirmación local más reciente hasta que las props se actualicen", () => {
    const anterior = {
      ...revisionGuardada,
      justificacion: "Justificación anterior conservada en las props.",
      revisadaEn: "2026-07-28T14:00:00.000Z",
    };
    const combinadas = combinarRevisionesReubicacion([anterior], [revisionGuardada]);

    expect(combinadas.get(737)).toEqual(revisionGuardada);
  });

  it("adopta una revisión posterior recibida por el refresh", () => {
    const posterior = {
      ...revisionGuardada,
      justificacion: "Justificación posterior recibida desde el servidor.",
      revisadaEn: "2026-07-28T16:00:00.000Z",
    };
    const combinadas = combinarRevisionesReubicacion([posterior], [revisionGuardada]);

    expect(combinadas.get(737)).toEqual(posterior);
  });

  it("retira solo la alerta cuya aprobación ya fue confirmada por el servidor", () => {
    const riesgos = [{ filaNum: 737 }, { filaNum: 910 }];
    const confirmada = combinarRevisionesReubicacion([], [revisionGuardada]);

    expect(filtrarReubicacionesPendientes(riesgos, confirmada)).toEqual([{ filaNum: 910 }]);
  });

  it("no deja reaparecer el padre ni la revisión aprobados al guardar una reversión posterior", () => {
    const otraRevision = { ...revisionGuardada, filaNum: 910 };
    const resultado = retirarConfirmacionesLocales(
      { 737: 60, 910: 75 },
      [revisionGuardada, otraRevision],
      [737],
    );

    expect(resultado.padresConfirmados).toEqual({ 910: 75 });
    expect(resultado.revisionesConfirmadas).toEqual([otraRevision]);
  });
});

describe("enfoque tras cambios estructurales", () => {
  it("crea un enfoque para la nueva ubicación de una reclasificación", () => {
    expect(siguienteEnfoqueCambioEstructural(null, 412)).toEqual({
      origen: 412,
      destino: null,
      secuencia: 1,
    });
  });

  it("renueva la secuencia al repetir un cambio y conserva el destino cuando existe", () => {
    const anterior = siguienteEnfoqueCambioEstructural(null, 412);

    expect(siguienteEnfoqueCambioEstructural(anterior, 412, 98)).toEqual({
      origen: 412,
      destino: 98,
      secuencia: 2,
    });
  });
});

function cambiosVacios(overrides: Partial<CambiosBorrador> = {}): CambiosBorrador {
  return {
    override: {},
    desacopladas: {},
    omitidas: {},
    padres: {},
    memorizarPadres: {},
    soloHojas: false,
    autoCorregido: false,
    ...overrides,
  };
}

describe("traducción código de cuenta → fila enfocable", () => {
  it("se queda con la PRIMERA fila cruda de cada código (misma cuenta repetida por tercero)", () => {
    const mapa = construirCodigoAFilaNum([
      { filaNum: 10, codigo: "110505" },
      { filaNum: 11, codigo: "110505" },
      { filaNum: 12, codigo: "130505" },
    ]);

    expect(mapa.get("110505")).toBe(10);
    expect(mapa.get("130505")).toBe(12);
    expect(mapa.has("999999")).toBe(false);
  });
});

describe("fila afectada por un cambio revertido (descartar el último cambio)", () => {
  const codigoAFilaNum = construirCodigoAFilaNum([
    { filaNum: 100, codigo: "110505" },
    { filaNum: 200, codigo: "130505" },
  ]);

  it("detecta la cuenta reclasificada (override por código)", () => {
    const actual = cambiosVacios({ override: { "110505": "movimiento" } });
    const restaurado = cambiosVacios();

    expect(filasAfectadasPorCambio(actual, restaurado, codigoAFilaNum)).toEqual([100]);
  });

  it("detecta la cuenta desacoplada/reacoplada (por código)", () => {
    const actual = cambiosVacios({ desacopladas: { "130505": true } });
    const restaurado = cambiosVacios();

    expect(filasAfectadasPorCambio(actual, restaurado, codigoAFilaNum)).toEqual([200]);
  });

  it("detecta la fila omitida/incluida (por filaNum, sin traducción de código)", () => {
    const actual = cambiosVacios({ omitidas: { 412: true } });
    const restaurado = cambiosVacios();

    expect(filasAfectadasPorCambio(actual, restaurado, codigoAFilaNum)).toEqual([412]);
  });

  it("detecta la fila re-parentada (por filaNum)", () => {
    const actual = cambiosVacios({ padres: { 412: 98 } });
    const restaurado = cambiosVacios();

    expect(filasAfectadasPorCambio(actual, restaurado, codigoAFilaNum)).toEqual([412]);
  });

  it("prioriza la fila propia de un cambio que también reubicó a sus hijas (convertir en agrupadora)", () => {
    const actual = cambiosVacios({
      override: { "110505": "agrupadora" },
      padres: { 412: 100, 413: 100 },
    });
    const restaurado = cambiosVacios();

    expect(filasAfectadasPorCambio(actual, restaurado, codigoAFilaNum)).toEqual([100, 412, 413]);
  });

  it("no devuelve ninguna fila para un cambio global (modo «solo hojas»)", () => {
    const actual = cambiosVacios({ soloHojas: true, autoCorregido: true });
    const restaurado = cambiosVacios();

    expect(filasAfectadasPorCambio(actual, restaurado, codigoAFilaNum)).toEqual([]);
  });

  it("no devuelve nada si las dos fotografías son idénticas", () => {
    const estado = cambiosVacios({ omitidas: { 412: true } });

    expect(filasAfectadasPorCambio(estado, estado, codigoAFilaNum)).toEqual([]);
  });
});

describe("nombre de cuenta con descuadre en el árbol", () => {
  it("conserva la señal visual sin activar ayuda al pasar el cursor", () => {
    const html = renderToStaticMarkup(
      createElement(NombreCuentaArbol, {
        nombre: "GENERALES",
        omitida: false,
        descuadrado: true,
        descuadreAccionable: true,
        umbralDescuadre: 2_000,
      }),
    );

    expect(html).toContain("GENERALES");
    expect(html).toContain("text-err-700");
    expect(html).toContain("underline");
    expect(html).not.toContain("title=");
    expect(html).not.toContain("tabindex=");
    expect(html).not.toContain("cursor-help");
  });

  it("conserva la ayuda distinta del aviso informativo", () => {
    const html = renderToStaticMarkup(
      createElement(NombreCuentaArbol, {
        nombre: "GENERALES",
        omitida: false,
        descuadrado: true,
        descuadreAccionable: false,
        umbralDescuadre: 2_000,
      }),
    );

    expect(html).toContain("text-err-500");
    expect(html).toContain("underline");
    expect(html).toContain("tabindex=\"0\"");
    expect(html).toContain("cursor-help");
  });
});

describe("protección contra doble conteo", () => {
  it("distingue el estado triestado configurado en el perfil", () => {
    expect(etiquetaPerfilSoloHojas(true)).toBe("Perfil: solo hojas activo");
    expect(etiquetaPerfilSoloHojas(false)).toBe("Perfil: forzado desactivado");
    expect(etiquetaPerfilSoloHojas(null)).toBe("Perfil: detección automática");
    expect(etiquetaPerfilSoloHojas(undefined)).toBe("Perfil: cliente pendiente");
  });

  it("presenta la protección estándar como estado y el forzado dentro de ajustes avanzados", () => {
    const html = renderToStaticMarkup(
      createElement(ProteccionSubtotalesPanel, {
        perfilSoloHojas: true,
        soloHojas: false,
        autoCorregido: false,
        analisis: { ayuda: false, n: 3 },
        onForzar: () => undefined,
        onDeshacer: () => undefined,
      }),
    );

    expect(html).toContain("Protección estándar contra subtotales activa");
    expect(html).toContain("Perfil: solo hojas activo");
    expect(html).toContain("Ajustes avanzados de jerarquía");
    expect(html).toContain("Forzar modo solo hojas (3)");
    expect(html).not.toContain('type="checkbox"');
  });

  it("ofrece una acción directa para deshacer la auto-corrección", () => {
    const html = renderToStaticMarkup(
      createElement(AvisoAutoCorreccionSoloHojas, {
        cuentas: 7,
        onDeshacer: () => undefined,
      }),
    );

    expect(html).toContain("Corrección automática de anidado");
    expect(html).toContain("Deshacer auto-corrección");
    expect(html).toContain("7");
  });
});

describe("selector de movimientos de una agrupadora manual", () => {
  it("muestra en la candidata el saldo final y no su saldo inicial", () => {
    const origen: CuentaReubicacion = {
      filaNum: 10,
      codigo: "28059501",
      codigoCrudo: "28059501",
      nombre: "CONSIGNACIONES SIN IDENTIFICAR",
      tipoFila: "movimiento",
      omitida: false,
      subtotalDuplicado: false,
      padre: null,
      padreManual: null,
      ruta: [],
      descendientes: [],
      busqueda: "28059501 consignaciones sin identificar",
      saldoInicial: 900,
      debitos: 100,
      creditos: 200,
      saldoFinal: 800,
    };
    const candidata: CuentaReubicacion = {
      filaNum: 20,
      codigo: "11050501",
      codigoCrudo: "11050501",
      nombre: "CAJA GENERAL RECAUDOS",
      tipoFila: "movimiento",
      omitida: false,
      subtotalDuplicado: false,
      padre: null,
      padreManual: null,
      ruta: [],
      descendientes: [],
      busqueda: "11050501 caja general recaudos",
      saldoInicial: 12_345.67,
      debitos: 300,
      creditos: 400,
      saldoFinal: -98_765.43,
    };
    const cuentas = [origen, candidata];
    const indice: IndiceReubicacion = {
      cuentas,
      porFila: new Map(cuentas.map((cuenta) => [cuenta.filaNum, cuenta])),
    };

    const html = renderToStaticMarkup(
      createElement(GestionarAgrupadoraModal, {
        indice,
        filaNum: origen.filaNum,
        onConfirmar: () => undefined,
        onClose: () => undefined,
      }),
    );

    expect(html).toContain("CAJA GENERAL RECAUDOS");
    expect(html).toContain("Saldo actual");
    expect(html).toContain("-$ 98.765,43");
    expect(html).not.toContain("$ 12.345,67");
    expect(html).toContain("tabular-nums");
    expect(html).toContain("whitespace-nowrap");
  });
});
