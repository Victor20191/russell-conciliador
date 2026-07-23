import { describe, it, expect } from "vitest";
import { compararTotalesAgrupacion, construirArbolBorrador, construirIndiceReubicacion, contarNodos, aplanarArbolFiltrado, destinosReubicacion, esDestinoSugerido, normalizarBusquedaCuenta, reclasificarHuerfanas, marcarNoContables, corregirCodigosPlaceholder, contextoTabulador, puedeUbicar, sugerirMovimientosAgrupadora, validarReubicacionesBorrador, type FilaBorrador } from "./borrador";
import { construirVistaBorrador } from "./borrador-vm";
import { reclasificarNoImputables } from "./extraccion/transformar";

function fila(filaNum: number, codigo: string, nombre: string, saldoFinal: number, tipo: FilaBorrador["tipoFila"]): FilaBorrador {
  return { filaNum, codigo, codigoCrudo: codigo, nombre, nivel: codigo.length || null, tipoFila: tipo, saldoInicial: 0, debitos: 0, creditos: 0, saldoFinal };
}

describe("construirArbolBorrador", () => {
  it("anida por prefijo de código en orden de archivo", () => {
    const arbol = construirArbolBorrador([
      fila(1, "1", "ACTIVO", 300, "agrupadora"),
      fila(2, "11", "DISPONIBLE", 300, "agrupadora"),
      fila(3, "1105", "CAJA", 300, "agrupadora"),
      fila(4, "110505", "CAJA GENERAL", 200, "movimiento"),
      fila(5, "110510", "CAJA MENOR", 100, "movimiento"),
    ]);
    expect(arbol).toHaveLength(1); // una raíz "1"
    expect(arbol[0].codigo).toBe("1");
    expect(arbol[0].hijos[0].codigo).toBe("11");
    expect(arbol[0].hijos[0].hijos[0].hijos.map((h) => h.codigo)).toEqual(["110505", "110510"]);
    expect(contarNodos(arbol)).toBe(5);
  });

  it("una fila NO numérica intercalada («<none>») no vacía la pila ni detacha las hijas", () => {
    const filas: FilaBorrador[] = [
      fila(1, "52", "OPERACIONALES", 0, "agrupadora"),
      fila(2, "5220", "ARRENDAMIENTOS", 100, "agrupadora"),
      { ...fila(3, "", "<none>", 0, "total"), codigoCrudo: "<none>" }, // ruido: código vacío
      fila(4, "522003", "RENTING", 60, "agrupadora"),
      fila(5, "52200301", "RENTING", 60, "movimiento"),
      fila(6, "522010", "CONSTRUCCIONES", 40, "agrupadora"),
    ];
    const arbol = construirArbolBorrador(filas);
    // 5220 NO se detacha: conserva sus hijas por prefijo. El «<none>» queda como RAÍZ
    // (ruido), sin colgarse de 5220 ni de nadie; la agrupadora en curso sigue abierta.
    const n52 = arbol.find((n) => n.codigo === "52")!;
    const n5220 = n52.hijos.find((h) => h.codigo === "5220")!;
    expect(n5220.hijos.map((h) => h.codigo)).toEqual(["522003", "522010"]);
    const none = arbol.find((n) => n.codigoCrudo === "<none>");
    expect(none?.tipoFila).toBe("total"); // raíz, no cuelga de ninguna cuenta
    // Como 5220 conserva hijas, `reclasificarHuerfanas` NO la degrada a movimiento.
    reclasificarHuerfanas(filas);
    expect(filas.find((f) => f.codigo === "5220")!.tipoFila).toBe("agrupadora");
  });

  it("código repetido: el encabezado agrupa; su línea de movimiento y su detalle cuelgan debajo", () => {
    const arbol = construirArbolBorrador([
      fila(1, "11", "EFECTIVO Y EQ", 0, "agrupadora"),
      fila(2, "1105", "EFECTIVO", 0, "agrupadora"), // encabezado
      fila(3, "1105", "CAJA GENERAL", 0, "agrupadora"), // código repetido → movimiento
      fila(4, "110505", "BASE", 0, "movimiento"),
    ]);
    const efectivo = arbol[0].hijos[0];
    expect(efectivo.codigo).toBe("1105");
    expect(efectivo.tipoFila).toBe("agrupadora");
    expect(efectivo.hijos.map((h) => h.nombre)).toEqual(["CAJA GENERAL", "BASE"]); // ambos bajo el encabezado
    expect(efectivo.hijos.find((h) => h.nombre === "CAJA GENERAL")?.tipoFila).toBe("movimiento");
  });

  it("código repetido: el encabezado cuadra con su línea de movimiento + detalle, sin doble conteo en el padre", () => {
    const arbol = construirArbolBorrador([
      fila(1, "11", "EFECTIVO Y EQ", 300, "agrupadora"),
      fila(2, "1105", "EFECTIVO", 300, "agrupadora"), // = CAJA GENERAL 100 + BASE 200
      fila(3, "1105", "CAJA GENERAL", 100, "agrupadora"), // → movimiento
      fila(4, "110505", "BASE", 200, "movimiento"),
    ]);
    expect(arbol[0].hijos[0].descuadre).toBe(0); // EFECTIVO: 100 + 200 = 300
    expect(arbol[0].descuadre).toBe(0); // 11 = EFECTIVO(300), sin doble contar CAJA GENERAL
  });

  it("multi-sucursal: dos '1 ACTIVO' → dos raíces con su propio subárbol", () => {
    const arbol = construirArbolBorrador([
      fila(1, "1", "ACTIVO ITAGUI", 100, "agrupadora"),
      fila(2, "1105", "CAJA", 100, "movimiento"),
      fila(3, "1", "ACTIVO PEREIRA", 50, "agrupadora"),
      fila(4, "1105", "CAJA", 50, "movimiento"),
    ]);
    expect(arbol).toHaveLength(2);
    expect(arbol[0].nombre).toBe("ACTIVO ITAGUI");
    expect(arbol[1].nombre).toBe("ACTIVO PEREIRA");
    expect(arbol[1].hijos).toHaveLength(1);
  });

  it("localiza el descuadre por nodo: total ≠ suma de hijos", () => {
    const arbol = construirArbolBorrador([
      fila(1, "11", "DISPONIBLE", 1000, "agrupadora"), // total del archivo 1000…
      fila(2, "110505", "CAJA", 600, "movimiento"),
      fila(3, "110510", "BANCOS", 300, "movimiento"), // …pero hijos suman 900 → Δ 100
    ]);
    expect(arbol[0].descuadre).toBe(100);
  });

  it("silencia gemelos: detalle mal ubicado por código pero que suma bien", () => {
    // El ERP puso el detalle real (14101000, mismo nombre) como HERMANO del subtotal
    // 141000 en vez de como hijo (su código no anida por prefijo). Al sumar cuadra.
    const arbol = construirArbolBorrador([
      fila(1, "1410", "PRODUCTOS EN PROCESO", 100, "agrupadora"),
      fila(2, "141000", "PRODUCTO AGUA", 100, "agrupadora"), // subtotal 100…
      fila(3, "14100001", "MATERIAS AGUA", 0, "movimiento"), // …hijos por prefijo = 0
      fila(4, "14101000", "PRODUCTO AGUA", 100, "movimiento"), // detalle real (hermano por código)
    ]);
    const c141000 = arbol[0].hijos.find((h) => h.codigo === "141000");
    expect(c141000?.descuadre).toBe(0); // subtotal silenciado (su gemelo explica el hueco)
    expect(arbol[0].descuadre).toBe(0); // 1410 tampoco: el gemelo no se cuenta doble
  });

  it("excluye del descuadre el subtotal de 6 díg duplicado de su detalle de 8 díg (MAQUILA)", () => {
    const arbol = construirArbolBorrador([
      fila(1, "1410", "PRODUCTOS EN PROCESO", 9531, "agrupadora"),
      fila(2, "141006", "PROD MAQUILA", 9531, "movimiento"), // subtotal 6 díg…
      fila(3, "14101004", "PROCESO ENVASADO MAQUILA", 9531, "movimiento"), // …detalle 8 díg idéntico
    ]);
    const dup = arbol[0].hijos.find((h) => h.codigo === "141006");
    expect(dup?.subtotalDuplicado).toBe(true);
    expect(arbol[0].descuadre).toBe(0); // 141006 excluido; 14101004 cubre el total
  });

  it("desacople: el movimiento cuelga de la agrupadora abierta por ORDEN, no por prefijo (139005 bajo 1305)", () => {
    const arbol = construirArbolBorrador([
      fila(1, "13", "CXC", 233, "agrupadora"),
      fila(2, "1305", "CLIENTES", 233, "agrupadora"), // total = 100 (130505) + 133 (139005, desacoplada)
      fila(3, "130505", "CLIENTES NAL", 100, "movimiento"),
      fila(4, "139005", "DEUDAS DIFICIL COBRO", 133, "movimiento"), // código 1390 no anida bajo 1305…
    ]);
    const clientes = arbol[0].hijos.find((h) => h.codigo === "1305");
    // …pero por orden cuelga de 1305, así que 1305 cuadra (100 + 133 = 233).
    expect(clientes?.hijos.map((h) => h.codigo)).toEqual(["130505", "139005"]);
    expect(clientes?.descuadre).toBe(0);
  });

  it("una cuenta HERMANA ubicada por orden tras el detalle de otra sube al contenedor común (135531 no cuelga de 135515)", () => {
    const arbol = construirArbolBorrador([
      fila(1, "1355", "ANTICIPO IMPUESTOS", 138, "agrupadora"), // = 100 (135515) + 38 (135531)
      fila(2, "135515", "RETENCION EN LA FUENTE", 100, "agrupadora"),
      fila(3, "13551501", "VENTAS", 100, "movimiento"), // hija real de 135515
      fila(4, "135531", "DESCUENTO IVA", 38, "movimiento"), // 6 díg como 135515 → HERMANA, no hija
    ]);
    const g = arbol[0]; // 1355
    expect(g.hijos.map((h) => h.codigo)).toEqual(["135515", "135531"]); // 135531 sube a 1355
    expect(g.hijos.find((h) => h.codigo === "135515")?.hijos.map((h) => h.codigo)).toEqual(["13551501"]);
    expect(g.hijos.find((h) => h.codigo === "135515")?.descuadre).toBe(0); // 100 = 100, ya no le sobra
    expect(g.descuadre).toBe(0); // 138 = 100 + 38, ya no le falta
  });

  it("desacople MANUAL: una cuenta marcada `desacoplada` sube al ancestro ABIERTO por PREFIJO (139910 sale de 1305 a 13)", () => {
    const marca = (f: FilaBorrador): FilaBorrador => ({ ...f, desacoplada: true });
    const arbol = construirArbolBorrador([
      fila(1, "13", "CXC", 140, "agrupadora"), // = 100 (1305) + 40 (139910)
      fila(2, "1305", "CLIENTES", 100, "agrupadora"),
      fila(3, "130505", "CLIENTES NAL", 100, "movimiento"), // hija real de 1305
      marca(fila(4, "139910", "OTROS DEUDORES", 40, "movimiento")), // el ERP la puso tras 1305; 1399 no anida ahí
    ]);
    const cxc = arbol.find((n) => n.codigo === "13")!;
    const clientes = cxc.hijos.find((h) => h.codigo === "1305")!;
    expect(clientes.hijos.map((h) => h.codigo)).toEqual(["130505"]); // 139910 ya no cuelga de 1305
    expect(clientes.descuadre).toBe(0); // 100 = 100, ya no le sobra
    expect(cxc.hijos.map((h) => h.codigo)).toEqual(["1305", "139910"]); // subió a 13 (ancestro por prefijo)
    expect(cxc.descuadre).toBe(0); // 140 = 100 + 40
  });

  it("desacople sin ancestro por prefijo abierto en la pila → queda como raíz (fuera de la agrupadora ajena)", () => {
    const arbol = construirArbolBorrador([
      fila(1, "13", "CXC", 100, "agrupadora"),
      fila(2, "1305", "CLIENTES", 100, "agrupadora"),
      fila(3, "130505", "CLIENTES NAL", 100, "movimiento"),
      { ...fila(4, "210505", "PROVEEDORES", 40, "movimiento"), desacoplada: true }, // ningún 2x abierto
    ]);
    const clientes = arbol.find((n) => n.codigo === "13")!.hijos.find((h) => h.codigo === "1305")!;
    expect(clientes.hijos.map((h) => h.codigo)).toEqual(["130505"]); // no la absorbe
    expect(clientes.descuadre).toBe(0);
    expect(arbol.some((n) => n.codigo === "210505")).toBe(true); // queda como raíz, ya no infla a 1305
  });

  it("totales al final (summary-below): el subtotal viene DESPUÉS del detalle y se anida por prefijo", () => {
    const mov = (fn: number, cod: string, nom: string, s: number): FilaBorrador => ({ filaNum: fn, codigo: cod, codigoCrudo: cod, nombre: nom, nivel: cod.length, tipoFila: "movimiento", saldoInicial: 0, debitos: 0, creditos: 0, saldoFinal: s });
    const tot = (fn: number, cod: string, nom: string, s: number): FilaBorrador => ({ filaNum: fn, codigo: cod, codigoCrudo: `TOTAL ${cod}`, nombre: nom, nivel: cod.length, tipoFila: "agrupadora", saldoInicial: 0, debitos: 0, creditos: 0, saldoFinal: s });
    const arbol = construirArbolBorrador([
      mov(1, "11050501", "CAJA GENERAL", 100),
      tot(2, "110505", "CAJA GENERAL", 100), // subtotal DESPUÉS del detalle
      mov(3, "11051002", "CAJA MENOR", 30),
      tot(4, "110510", "CAJAS MENORES", 30),
      tot(5, "1105", "CAJA", 130), // subtotal de grupo (110505 + 110510)
    ]);
    const g = arbol.find((n) => n.codigo === "1105");
    expect(g?.hijos.map((h) => h.codigo)).toEqual(["110505", "110510"]);
    expect(g?.hijos.find((h) => h.codigo === "110505")?.hijos.map((h) => h.codigo)).toEqual(["11050501"]);
    expect(g?.descuadre).toBe(0); // 100 + 30 = 130
  });

  it("respeta la anidación del cliente por NIVEL: una cuenta ubicada dentro de un grupo ajeno por código cuadra (531520 en 5305)", () => {
    const arbol = construirArbolBorrador([
      fila(1, "53", "GASTOS NO OPERACIONALES", 130, "agrupadora"),
      fila(2, "5305", "FINANCIEROS", 130, "agrupadora"), // = 100 (530505) + 30 (531520)
      fila(3, "530505", "GASTOS BANCARIOS", 100, "agrupadora"),
      fila(4, "530505005", "GASTOS BANCARIOS", 100, "movimiento"),
      fila(5, "531520", "IMPUESTOS ASUMIDOS", 30, "agrupadora"), // código 5315, pero el cliente lo anidó en 5305
      fila(6, "531520005", "IMPUESTOS ASUMIDOS", 30, "movimiento"),
    ]);
    const fin = arbol[0].hijos.find((h) => h.codigo === "5305");
    expect(fin?.hijos.map((h) => h.codigo)).toEqual(["530505", "531520"]); // 531520 NO salta a 53
    expect(fin?.descuadre).toBe(0); // 100 + 30 = 130
    expect(arbol[0].descuadre).toBe(0); // 53 = 5305(130)
  });

  it("marca un descuadre REAL: la agrupadora no cuadra con las filas que la siguen", () => {
    const arbol = construirArbolBorrador([
      fila(1, "1410", "PRODUCTOS EN PROCESO", 100, "agrupadora"), // total 100…
      fila(2, "141001", "PROCESO X", 80, "movimiento"), // …pero solo la sigue 80
    ]);
    expect(arbol[0].descuadre).toBe(20); // 100 − 80, nada más lo explica
  });

  it("re-parentado MANUAL (padreManual): mueve la fila bajo la agrupadora elegida y ambas cuadran", () => {
    const filas: FilaBorrador[] = [
      fila(1, "11", "DISPONIBLE", 100, "agrupadora"),
      fila(2, "1105", "CAJA", 100, "agrupadora"),
      fila(3, "110510", "CAJA MENOR", 100, "agrupadora"), // = 70 (hijo) + 30 (re-parentado)
      fila(4, "11051003", "CALI", 70, "movimiento"),
      // Huérfano con guion: su código truncó a "1105" → auto anida bajo 1105, pero debe ir bajo 110510.
      { ...fila(5, "1105", "VISITA MEDICA", 30, "movimiento"), codigoCrudo: "1105-10-19", padreManual: 3 },
    ];
    const arbol = construirArbolBorrador(filas);
    const c1105 = arbol[0].hijos.find((h) => h.codigo === "1105")!;
    const c110510 = c1105.hijos.find((h) => h.codigo === "110510")!;
    expect(c110510.hijos.map((h) => h.filaNum)).toEqual([4, 5]); // la re-parentada (fila 5) quedó aquí
    expect(c110510.descuadre).toBe(0); // 100 = 70 + 30
    expect(c1105.hijos.some((h) => h.filaNum === 5)).toBe(false); // ya no cuelga de 1105
    expect(c1105.descuadre).toBe(0); // 100 = 110510(100)
  });

  it("no marca descuadre cuando el nodo cuadra con sus hijos", () => {
    const arbol = construirArbolBorrador([
      fila(1, "11", "DISPONIBLE", 900, "agrupadora"),
      fila(2, "110505", "CAJA", 600, "movimiento"),
      fila(3, "110510", "BANCOS", 300, "movimiento"),
    ]);
    expect(arbol[0].descuadre).toBe(0); // dentro de tolerancia
    expect(arbol[0].hijos[0].descuadre).toBeNull(); // las hojas no se validan
  });
});

describe("omitida (excluir de cálculos, conservar en el crudo)", () => {
  it("una fila OMITIDA no cuenta en el descuadre de su agrupadora", () => {
    const arbol = construirArbolBorrador([
      fila(1, "11", "DISPONIBLE", 600, "agrupadora"),
      fila(2, "110505", "CAJA", 600, "movimiento"),
      { ...fila(3, "110599", "TOTAL RUIDO", 999, "movimiento"), omitida: true }, // omitida: no infla
    ]);
    // 11 = 600 (solo 110505); la omitida (999) no suma → descuadre 0 (antes: −999).
    expect(arbol[0].descuadre).toBe(0);
    // La fila omitida SIGUE en el árbol (se conserva para el comparativo línea a línea).
    expect(arbol[0].hijos.map((h) => h.codigo)).toEqual(["110505", "110599"]);
  });
});

describe("reclasificarNoImputables (pie/total sin código)", () => {
  it("una fila de PIE sin código (Total general) no se cuelga de la última agrupadora ni infla su Δ", () => {
    const filas: FilaBorrador[] = [
      fila(1, "739905", "CIERRE COSTO INDIRECTA", -324, "agrupadora"),
      fila(2, "73990501", "CIERRE COSTO INDIRECTA", -324, "movimiento"),
      { ...fila(3, "", "Total general", -665, "movimiento"), codigoCrudo: "Total general" },
    ];
    reclasificarNoImputables(filas); // pie sin código → total
    const arbol = construirArbolBorrador(filas);
    const cierre = arbol.find((n) => n.codigo === "739905")!;
    expect(cierre.hijos.map((h) => h.codigo)).toEqual(["73990501"]); // el gran total NO cuelga aquí
    expect(cierre.descuadre).toBe(0); // -324 = -324, sin Δ falso (antes: Δ 665)
    const total = arbol.find((n) => n.codigoCrudo === "Total general");
    expect(total?.tipoFila).toBe("total"); // queda como raíz, tipo total, no se cuenta
  });

  it("reclasifica solo los movimientos con código NO numérico; deja intactas las cuentas", () => {
    const filas: FilaBorrador[] = [
      fila(1, "110505", "CAJA", 100, "movimiento"),
      { ...fila(2, "", "Siesa Enterprise Net 1.25.0", 1, "movimiento"), codigoCrudo: "Siesa Enterprise Net 1.25.0" },
      fila(3, "11", "DISPONIBLE", 100, "agrupadora"),
    ];
    const cambiadas = reclasificarNoImputables(filas);
    expect(cambiadas.map((f) => f.nombre)).toEqual(["Siesa Enterprise Net 1.25.0"]);
    expect(filas.find((f) => f.codigo === "110505")?.tipoFila).toBe("movimiento"); // cuenta real intacta
    expect(filas.find((f) => f.codigo === "11")?.tipoFila).toBe("agrupadora"); // agrupadora intacta
  });
});

describe("reclasificarHuerfanas", () => {
  it("reclasifica a movimiento la agrupadora SIN hijos con saldo (el ERP la exportó sin desglose)", () => {
    const filas = [
      fila(1, "2", "PASIVO", 150, "agrupadora"),
      fila(2, "2205", "NACIONALES", 100, "agrupadora"), // sin subcuentas → huérfana
      fila(3, "2305", "COSTOS Y GASTOS", 50, "agrupadora"),
      fila(4, "230505", "HONORARIOS", 50, "movimiento"), // 2305 sí tiene hijo
    ];
    const cambiadas = reclasificarHuerfanas(filas);
    expect(cambiadas.map((f) => f.codigo)).toEqual(["2205"]);
    expect(filas.find((f) => f.codigo === "2205")?.tipoFila).toBe("movimiento");
    expect(filas.find((f) => f.codigo === "2305")?.tipoFila).toBe("agrupadora"); // tiene hijo → intacta
    expect(filas.find((f) => f.codigo === "2")?.tipoFila).toBe("agrupadora"); // clase → intacta
  });

  it("una cuenta cuyos únicos hijos están OMITIDOS se vuelve huérfana (imputable con su saldo)", () => {
    const filas: FilaBorrador[] = [
      fila(1, "11", "DISPONIBLE", 100, "agrupadora"),
      fila(2, "1105", "CAJA", 100, "agrupadora"), // su saldo (100) = el del tercero
      { ...fila(3, "901427659", "901427659", 100, "movimiento"), omitida: true }, // tercero excluido a mano
    ];
    const cambiadas = reclasificarHuerfanas(filas);
    expect(cambiadas.map((f) => f.codigo)).toContain("1105"); // 1105 recuperada como imputable
    expect(filas.find((f) => f.codigo === "1105")?.tipoFila).toBe("movimiento");
    expect(filas.find((f) => f.codigo === "11")?.tipoFila).toBe("agrupadora"); // 11 sigue agrupando a 1105
  });

  it("NO reclasifica una agrupadora sin hijos con saldo 0 (no aporta nada)", () => {
    const filas = [
      fila(1, "1", "ACTIVO", 0, "agrupadora"),
      fila(2, "19", "OTROS ACTIVOS", 0, "agrupadora"), // vacía
    ];
    expect(reclasificarHuerfanas(filas)).toEqual([]);
    expect(filas.every((f) => f.tipoFila === "agrupadora")).toBe(true);
  });

  it("NO recupera un total/pie de código NO numérico (Totales Prueba se queda como total)", () => {
    const filas: FilaBorrador[] = [
      fila(1, "11", "DISPONIBLE", 100, "agrupadora"),
      fila(2, "110505", "CAJA", 100, "movimiento"),
      { ...fila(3, "", "Totales Prueba", 245, "total"), codigoCrudo: "" }, // sin hijos, con saldo, pero no numérico
    ];
    expect(reclasificarHuerfanas(filas)).toEqual([]); // no recupera nada
    expect(filas.find((f) => f.nombre === "Totales Prueba")?.tipoFila).toBe("total"); // sigue total, no cuenta
  });

  it("NO reclasifica una agrupadora con detalle desacoplado por orden (no la deja doble-contar)", () => {
    // 1305 no tiene hijos POR PREFIJO, pero por ORDEN cuelga 139005 → tiene hijo en el árbol.
    const filas = [
      fila(1, "13", "CXC", 233, "agrupadora"),
      fila(2, "1305", "CLIENTES", 233, "agrupadora"),
      fila(3, "139005", "DEUDAS", 233, "movimiento"),
    ];
    expect(reclasificarHuerfanas(filas)).toEqual([]);
    expect(filas.find((f) => f.codigo === "1305")?.tipoFila).toBe("agrupadora");
  });

  it("preserva una agrupadora vacía cuando fue fijada manualmente, sin cambiar el comportamiento automático", () => {
    const automatica = [{ ...fila(1, "73870202", "HONORARIOS", 46_052_892, "agrupadora"), tipoFilaForzado: "agrupadora" as const }];
    const manual = automatica.map((f) => ({ ...f }));

    expect(reclasificarHuerfanas(automatica).map((f) => f.filaNum)).toEqual([1]);
    expect(automatica[0].tipoFila).toBe("movimiento");
    expect(reclasificarHuerfanas(manual, { preservarAgrupadorasForzadas: true })).toEqual([]);
    expect(manual[0].tipoFila).toBe("agrupadora");
  });
});

describe("aplanarArbolFiltrado", () => {
  const arbol = construirArbolBorrador([
    fila(1, "2", "PASIVO", 50, "agrupadora"),
    fila(2, "2105", "OBLIGACIONES", 50, "movimiento"),
    fila(3, "1", "ACTIVO", 100, "agrupadora"),
    fila(4, "1105", "CAJA", 100, "movimiento"),
  ]);

  it("sin filtro devuelve TODOS los nodos en orden de despliegue", () => {
    expect(aplanarArbolFiltrado(arbol).map((x) => x.nodo.codigo)).toEqual(["2", "2105", "1", "1105"]);
  });

  it("con filtro deja solo la rama coincidente (ancestro + subárbol), por prefijo", () => {
    expect(aplanarArbolFiltrado(arbol, ["21"]).map((x) => x.nodo.codigo)).toEqual(["2", "2105"]);
  });

  it("conserva el ORDEN DEL ARCHIVO (summary-below): el detalle sale antes que su subtotal", () => {
    const mov = (fn: number, cod: string): FilaBorrador => ({ filaNum: fn, codigo: cod, codigoCrudo: cod, nombre: cod, nivel: cod.length, tipoFila: "movimiento", saldoInicial: 0, debitos: 0, creditos: 0, saldoFinal: 100 });
    const tot = (fn: number, cod: string): FilaBorrador => ({ filaNum: fn, codigo: cod, codigoCrudo: `TOTAL ${cod}`, nombre: cod, nivel: cod.length, tipoFila: "agrupadora", saldoInicial: 0, debitos: 0, creditos: 0, saldoFinal: 100 });
    const sb = construirArbolBorrador([mov(1, "11050501"), tot(2, "110505"), tot(3, "1105")]);
    // El árbol es 1105 > 110505 > 11050501, pero el export sale en orden de archivo.
    expect(aplanarArbolFiltrado(sb).map((x) => x.nodo.codigo)).toEqual(["11050501", "110505", "1105"]);
  });
});

describe("contextoTabulador + puedeUbicar (tabulador Ubicar)", () => {

  // Caso real: 5220 (movimiento) y varias 5220xx desanidadas como hermanas bajo 52.

  const filas: FilaBorrador[] = [

    fila(1, "52", "OPERACIONALES", 0, "agrupadora"),

    fila(2, "5220", "ARRENDAMIENTOS", 100, "movimiento"), // quedó como movimiento

    fila(3, "522003", "RENTING", 60, "agrupadora"),

    fila(4, "522010", "CONSTRUCCIONES", 40, "agrupadora"),

    fila(5, "522015", "MAQUINARIA", 0, "agrupadora"),

  ];



  it("da los candidatos por prefijo (más profundo primero) y las hermanas", () => {

    // Con 5220 como movimiento, las 5220xx cuelgan de 52 (hermanas entre sí y de 5220).

    const ctx = contextoTabulador(construirArbolBorrador(filas));

    const c522003 = ctx.get(3)!;

    expect(c522003.candidatos.map((c) => c.codigo)).toEqual(["5220", "52"]); // profundo→superficial

    expect(c522003.padre).toBe(1); // cuelga de 52

    expect(c522003.hermanas.map((h) => h.codigo).sort()).toEqual(["5220", "522010", "522015"]);

  });



  it("puedeUbicar: true para las 5220xx mal ubicadas; false para una ya bien anidada", () => {

    const ctx = contextoTabulador(construirArbolBorrador(filas));

    expect(puedeUbicar(ctx.get(3))).toBe(true); // 522003: ancestro 5220 ≠ su padre 52

    // Cuenta bien ubicada: 11050501 bajo 110505 → su ancestro más profundo ES su padre.

    const bien = contextoTabulador(construirArbolBorrador([

      fila(10, "1105", "CAJA", 0, "agrupadora"),

      fila(11, "110505", "CAJA G", 0, "agrupadora"),

      fila(12, "11050501", "CAJA GENERAL", 0, "movimiento"),

    ]));

    expect(puedeUbicar(bien.get(12))).toBe(false);

  });

});

describe("reubicación global de cuentas", () => {
  const filas: FilaBorrador[] = [
    fila(1, "1", "ACTIVO", 100, "agrupadora"),
    fila(2, "11", "DISPONIBLE", 100, "agrupadora"),
    fila(3, "1105", "CAJA", 100, "agrupadora"),
    fila(4, "110505", "CAJA GENERAL", 100, "agrupadora"),
    fila(5, "11050501", "CAJA BOGOTÁ", 100, "movimiento"),
    fila(6, "2", "PASIVO", 100, "agrupadora"),
    fila(7, "21", "OBLIGACIONES", 100, "agrupadora"),
    fila(8, "2105", "BANCOS", 100, "agrupadora"),
    fila(9, "210505", "BANCO NACIONAL", 100, "movimiento"),
  ];

  it("indexa código/nombre sin tildes y ofrece agrupadoras de cualquier rama", () => {
    const indice = construirIndiceReubicacion(construirArbolBorrador(filas.map((f) => ({ ...f }))));
    const origen = indice.porFila.get(5)!;
    const destinos = destinosReubicacion(indice, 5);

    expect(origen.busqueda).toContain("caja bogota");
    expect(normalizarBusquedaCuenta("  BOGOTÁ / Caja  ")).toBe("bogota caja");
    expect(destinos.map((d) => d.filaNum)).not.toContain(origen.padre); // padre actual = operación sin efecto
    expect(destinos.some((d) => d.filaNum === 8)).toBe(true); // otra rama completa
    expect(destinos.every((d) => d.tipoFila === "agrupadora")).toBe(true);
    expect(esDestinoSugerido(origen, destinos[0])).toBe(true); // prefijo PUC primero
  });

  it("excluye la propia cuenta y todos sus descendientes como destinos", () => {
    const indice = construirIndiceReubicacion(construirArbolBorrador(filas.map((f) => ({ ...f }))));
    const destinos = destinosReubicacion(indice, 3).map((d) => d.filaNum);
    expect(destinos).not.toContain(3);
    expect(destinos).not.toContain(4);
    expect(destinos).not.toContain(5);
    expect(destinos).toContain(7);
  });

  it("acepta mover una subrama bajo otra agrupadora y conserva sus hijos", () => {
    const resultado = validarReubicacionesBorrador(filas.map((f) => ({ ...f })), { "3": 7 });
    expect(resultado).toEqual({ ok: true });

    const movidas = filas.map((f) => ({ ...f, padreManual: f.filaNum === 3 ? 7 : f.padreManual }));
    const arbol = construirArbolBorrador(movidas);
    const obligaciones = arbol.find((n) => n.filaNum === 6)!.hijos.find((n) => n.filaNum === 7)!;
    const caja = obligaciones.hijos.find((n) => n.filaNum === 3)!;
    expect(caja.hijos.map((n) => n.filaNum)).toEqual([4]);
    expect(caja.hijos[0].hijos.map((n) => n.filaNum)).toEqual([5]);
  });

  it("rechaza destino movimiento, destino actual, autorreferencia y ciclos", () => {
    expect(validarReubicacionesBorrador(filas.map((f) => ({ ...f })), { "5": 9 })).toMatchObject({ ok: false });
    expect(validarReubicacionesBorrador(filas.map((f) => ({ ...f })), { "5": 4 })).toMatchObject({ ok: false });
    expect(validarReubicacionesBorrador(filas.map((f) => ({ ...f })), { "3": 3 })).toMatchObject({ ok: false });
    expect(validarReubicacionesBorrador(filas.map((f) => ({ ...f })), { "3": 4 })).toMatchObject({ ok: false });
  });

  it("permite restaurar el padre automático de una cuenta reubicada", () => {
    const movidas = filas.map((f) => ({ ...f, padreManual: f.filaNum === 3 ? 7 : f.padreManual }));
    expect(validarReubicacionesBorrador(movidas, { "3": null })).toEqual({ ok: true });
  });

  it("sugiere movimientos hermanos de igual nivel que explican los cuatro valores de HONORARIOS", () => {
    const cuenta = (filaNum: number, codigo: string, nombre: string, si: number, db: number, cr: number, sf: number, tipo: FilaBorrador["tipoFila"]): FilaBorrador => ({
      filaNum, codigo, codigoCrudo: codigo, nombre, nivel: codigo.length, tipoFila: tipo,
      saldoInicial: si, debitos: db, creditos: cr, saldoFinal: sf,
    });
    const caso = [
      cuenta(1, "738702", "GENERALES", 0, 0, 0, 0, "agrupadora"),
      cuenta(2, "73870202", "HONORARIOS", 37_143_394, 8_909_498, 0, 46_052_892, "movimiento"),
      cuenta(3, "61651001", "SERVICIOS MÉDICOS VETERINARIOS", 33_086_000, 7_328_240, 0, 40_414_240, "movimiento"),
      cuenta(4, "61651002", "IVA SERVICIOS VETERINARIOS", 60_610, 29_260, 0, 89_870, "movimiento"),
      cuenta(5, "61651003", "ASESORÍA EN SISTEMAS", 262_390, 0, 0, 262_390, "movimiento"),
      cuenta(6, "61652001", "AYUDAS DIAGNOSTICAS (CV)", 3_307_614, 1_304_200, 0, 4_611_814, "movimiento"),
      cuenta(7, "61652002", "IVA AYUDAS DIAGNOSTICAS", 426_780, 247_798, 0, 674_578, "movimiento"),
      cuenta(8, "73870204", "SERVICIOS", 78_610_830, 24_514_972, 0, 103_125_802, "movimiento"),
    ];
    const indice = construirIndiceReubicacion(construirArbolBorrador(caso));
    const sugeridas = sugerirMovimientosAgrupadora(indice, 2);
    const origen = indice.porFila.get(2)!;
    const seleccion = sugeridas.map((id) => indice.porFila.get(id)!);

    expect(sugeridas).toEqual([3, 4, 5, 6, 7]);
    expect(compararTotalesAgrupacion(origen, seleccion)).toMatchObject({
      coincide: true,
      diferencias: { saldoInicial: 0, debitos: 0, creditos: 0, saldoFinal: 0 },
    });
  });

  it("la comparación informa el descuadre pero no produce una validación bloqueante", () => {
    const origen = construirIndiceReubicacion(construirArbolBorrador([fila(1, "110505", "CAJA", 100, "movimiento")])).porFila.get(1)!;
    const resultado = compararTotalesAgrupacion(origen, []);
    expect(resultado.coincide).toBe(false);
    expect(resultado.diferencias.saldoFinal).toBe(100);
  });
});

describe("marcarNoContables (ocultar totales / no-cuentas)", () => {

  it("marca omitida las filas 'total'; respeta el tri-estado y no toca las cuentas", () => {

    const filas: FilaBorrador[] = [
      fila(1, "110505", "CAJA", 100, "movimiento"), // cuenta real (código numérico)
      { ...fila(2, "", "Total general", 0, "total"), codigoCrudo: "Total general" },
      { ...fila(3, "", "<none>", 0, "total"), codigoCrudo: "<none>", omitida: false }, // rescatada a mano
      // Pie del ERP que se coló como AGRUPADORA (empieza por letra) → igual se tacha.
      { ...fila(4, "", "Procesado en: Abril 15 2026", 0, "agrupadora"), codigoCrudo: "Procesado en: Abril 15 2026" },
      // Cuenta con código ALFANUMÉRICO (empieza por dígito) → NO se toca.
      fila(5, "110A505", "CAJA ALFANUMÉRICA", 50, "movimiento"),
      // Cuentas de ORDEN (clase 8 y 9) → se tachan siempre (fuera de balance).
      fila(6, "8305", "DEUDORAS DE CONTROL", 0, "agrupadora"),
      fila(7, "930505", "ACREEDORAS", 0, "movimiento"),
    ];
    const n = marcarNoContables(filas);
    expect(n).toBe(4); // #2 (total), #4 (pie), #6 (clase 8), #7 (clase 9); la #3 ya fue rescatada
    expect(filas[1].omitida).toBe(true);
    expect(filas[3].omitida).toBe(true); // el pie que empieza por letra, aunque sea "agrupadora"
    expect(filas[5].omitida).toBe(true); // clase 8 (cuenta de orden)
    expect(filas[6].omitida).toBe(true); // clase 9 (cuenta de orden)
    expect(filas[2].omitida).toBe(false); // respeta el rescate (tri-estado)
    expect(filas[0].omitida).toBeUndefined(); // la cuenta contable (clase 1) no se toca
    expect(filas[4].omitida).toBeUndefined(); // la cuenta alfanumérica (110A505) NO se tacha
  });

  it("tacha los totales de sucursal «00X» (multi-sucursal) y no toca cuentas reales", () => {
    const filas: FilaBorrador[] = [
      { ...fila(1, "002", "MEDELLIN", 88_202_777_497, "movimiento"), codigoCrudo: "002 MEDELLIN" },
      { ...fila(2, "012", "CALI- CEDIS", -12_401_580_407, "movimiento"), codigoCrudo: "012 CALI- CEDIS" },
      fila(3, "11", "DISPONIBLE", 100, "agrupadora"), // grupo PUC real → NO se toca
      fila(4, "11100502", "BANCOLOMBIA", 100, "movimiento"), // cuenta real → NO se toca
      fila(5, "011005", "CAJA ZERO-PADDED", 50, "movimiento"), // 6 díg: NO es delimitador → NO se toca
    ];
    const n = marcarNoContables(filas);
    expect(n).toBe(2); // solo los dos «00X»
    expect(filas[0].omitida).toBe(true);
    expect(filas[1].omitida).toBe(true);
    expect(filas[2].omitida).toBeUndefined();
    expect(filas[3].omitida).toBeUndefined();
    expect(filas[4].omitida).toBeUndefined(); // 011005 (6 díg) no se confunde con sucursal
  });
});

describe("corregirCodigosPlaceholder (SIIGO: rollup de clase con código gigante)", () => {
  it("deriva la clase del primer hijo y no toca cuentas reales largas", () => {
    const filas: FilaBorrador[] = [
      fila(1, "800000000000000", "Otros Gastos", 100, "movimiento"), // placeholder 8×10^14
      fila(2, "53", "NO OPERACIONALES", 100, "agrupadora"),
      fila(3, "5305", "GASTOS BANCARIOS", 100, "agrupadora"),
      fila(4, "53052505", "DIFERENCIA EN CAMBIO", 100, "movimiento"),
      fila(5, "614505157005", "IVA COMPRAS", 50, "movimiento"), // cuenta real larga (12 díg) → NO se toca
    ];
    const n = corregirCodigosPlaceholder(filas);
    expect(n).toBe(1);
    expect(filas[0].codigo).toBe("5"); // clase derivada del hijo "53"
    expect(filas[0].nivel).toBe(1);
    expect(filas[0].tipoFila).toBe("agrupadora");
    expect(filas[0].nombre).toBe("Otros Gastos"); // conserva el nombre
    expect(filas[4].codigo).toBe("614505157005"); // cuenta real intacta (dígitos no-cero)
  });

  it("sin hijo numérico después, deja el placeholder igual (fallback)", () => {
    const filas: FilaBorrador[] = [fila(1, "800000000000000", "Otros Gastos", 100, "movimiento")];
    expect(corregirCodigosPlaceholder(filas)).toBe(0);
    expect(filas[0].codigo).toBe("800000000000000");
  });
});

describe("corregirCodigosPlaceholder + construirVistaBorrador", () => {
  it("el rollup queda como clase 5, anida su grupo/cuenta y NO se oculta", () => {
    const filas: FilaBorrador[] = [
      fila(1, "800000000000000", "Otros Gastos", 100, "movimiento"),
      fila(2, "53", "NO OPERACIONALES", 100, "agrupadora"),
      fila(3, "5305", "GASTOS BANCARIOS", 100, "agrupadora"),
      fila(4, "53052505", "DIFERENCIA EN CAMBIO", 100, "movimiento"),
    ];
    const vista = construirVistaBorrador(filas);
    expect(vista.clasesCorregidas).toBe(1);
    const c5 = vista.arbol.find((n) => n.codigo === "5");
    expect(c5?.nombre).toBe("Otros Gastos");
    expect(!!c5?.omitida).toBe(false); // ya no es clase 8 → no se tacha
    expect(c5?.hijos.some((h) => h.codigo === "53")).toBe(true); // 53 anida bajo 5
  });
});
