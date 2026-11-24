import { describe, expect, it } from "vitest";
import { parseRangoReporte } from "@/lib/auditoria/reporte-ejecutivo/rango";
import {
  calcularPeriodoEnvio,
  calcularPeriodoEnvioManual,
  calcularProximaAlGuardar,
  decidirVencimiento,
  describirFrecuencia,
  diaSemanaColombia,
  ejecucionEnCursoVencida,
  envioAtrasado,
  esDiaSemanaValido,
  esHoraValida,
  estadoDeEnvio,
  fechaColombia,
  fechaDePeriodoGuardado,
  limiteEnCurso,
  periodoEnvioSemanal,
  proximaEjecucion,
} from "./programacion";

// Referencias: el 23-nov-2026 es lunes (7:00 a. m. de Colombia = 12:00 UTC).
const lunes7am = new Date("2026-11-23T12:00:00.000Z");

describe("calendario de Colombia (UTC−5 fijo)", () => {
  it("lee la fecha y el día de la semana en hora de Colombia, no en UTC", () => {
    // 02:00 UTC del martes 24 todavía es lunes 23 en Bogotá.
    const instante = new Date("2026-11-24T02:00:00.000Z");
    expect(fechaColombia(instante)).toBe("2026-11-23");
    expect(diaSemanaColombia(instante)).toBe(1);
    // 05:00 UTC es la medianoche de Colombia: ya es martes.
    expect(fechaColombia(new Date("2026-11-24T05:00:00.000Z"))).toBe("2026-11-24");
    expect(diaSemanaColombia(new Date("2026-11-24T05:00:00.000Z"))).toBe(2);
  });

  it("el domingo es 7 y el lunes es 1", () => {
    expect(diaSemanaColombia(new Date("2026-11-29T15:00:00.000Z"))).toBe(7);
    expect(diaSemanaColombia(new Date("2026-11-30T15:00:00.000Z"))).toBe(1);
  });
});

describe("proximaEjecucion", () => {
  it("el mismo día, si la hora todavía no llega", () => {
    // Lunes 6:00 a. m. de Colombia, pide lunes 7:00 a. m.
    const ahora = new Date("2026-11-23T11:00:00.000Z");
    expect(proximaEjecucion({ ahora, diaSemana: 1, hora: "07:00" }).toISOString()).toBe("2026-11-23T12:00:00.000Z");
  });

  it("la semana siguiente, si la hora de hoy ya pasó", () => {
    const ahora = new Date("2026-11-23T12:00:01.000Z");
    expect(proximaEjecucion({ ahora, diaSemana: 1, hora: "07:00" }).toISOString()).toBe("2026-11-30T12:00:00.000Z");
  });

  it("en la hora exacta no repite el instante: el siguiente es el de la semana próxima", () => {
    expect(proximaEjecucion({ ahora: lunes7am, diaSemana: 1, hora: "07:00" }).toISOString()).toBe("2026-11-30T12:00:00.000Z");
  });

  it("avanza hasta el día pedido (de martes a viernes, y de viernes a martes)", () => {
    const martes = new Date("2026-11-24T15:00:00.000Z");
    expect(proximaEjecucion({ ahora: martes, diaSemana: 5, hora: "18:30" }).toISOString()).toBe("2026-11-27T23:30:00.000Z");
    expect(proximaEjecucion({ ahora: new Date("2026-11-27T20:00:00.000Z"), diaSemana: 2, hora: "08:15" }).toISOString()).toBe(
      "2026-12-01T13:15:00.000Z",
    );
  });

  it("cruza el fin de año y el fin de mes sin perder el día", () => {
    // Jueves 31-dic-2026 a las 10 a. m. de Colombia; pide el domingo a las 23:59.
    const ahora = new Date("2026-12-31T15:00:00.000Z");
    expect(proximaEjecucion({ ahora, diaSemana: 7, hora: "23:59" }).toISOString()).toBe("2027-01-04T04:59:00.000Z");
  });

  it("usa el día de Colombia aunque en UTC ya sea otro", () => {
    // Lunes 11 p. m. de Colombia = martes 04:00 UTC. «Lunes 23:30» sigue siendo hoy.
    const ahora = new Date("2026-11-24T04:00:00.000Z");
    expect(proximaEjecucion({ ahora, diaSemana: 1, hora: "23:30" }).toISOString()).toBe("2026-11-24T04:30:00.000Z");
  });

  it("medianoche 00:00 de Colombia son las 05:00 UTC", () => {
    const ahora = new Date("2026-11-23T12:00:00.000Z");
    expect(proximaEjecucion({ ahora, diaSemana: 3, hora: "00:00" }).toISOString()).toBe("2026-11-25T05:00:00.000Z");
  });

  it("siempre devuelve un instante posterior y a menos de 7 días", () => {
    for (let dia = 1; dia <= 7; dia++) {
      for (const hora of ["00:00", "07:00", "12:30", "23:59"]) {
        for (let h = 0; h < 24 * 8; h += 5) {
          const ahora = new Date(lunes7am.getTime() + h * 3_600_000 + 17 * 60_000);
          const siguiente = proximaEjecucion({ ahora, diaSemana: dia, hora });
          expect(siguiente.getTime()).toBeGreaterThan(ahora.getTime());
          expect(siguiente.getTime() - ahora.getTime()).toBeLessThanOrEqual(7 * 86_400_000);
          expect(diaSemanaColombia(siguiente)).toBe(dia);
        }
      }
    }
  });

  it("rechaza un día, una hora o una fecha inválidos", () => {
    expect(() => proximaEjecucion({ ahora: lunes7am, diaSemana: 0, hora: "07:00" })).toThrow(RangeError);
    expect(() => proximaEjecucion({ ahora: lunes7am, diaSemana: 8, hora: "07:00" })).toThrow(RangeError);
    expect(() => proximaEjecucion({ ahora: lunes7am, diaSemana: 1.5, hora: "07:00" })).toThrow(RangeError);
    expect(() => proximaEjecucion({ ahora: lunes7am, diaSemana: 1, hora: "24:00" })).toThrow(RangeError);
    expect(() => proximaEjecucion({ ahora: lunes7am, diaSemana: 1, hora: "7:00" })).toThrow(RangeError);
    expect(() => proximaEjecucion({ ahora: new Date("no"), diaSemana: 1, hora: "07:00" })).toThrow(RangeError);
  });
});

describe("periodoEnvioSemanal", () => {
  it("enviado un lunes cubre de lunes a domingo anteriores", () => {
    expect(periodoEnvioSemanal(lunes7am)).toEqual({ desde: "2026-11-16", hasta: "2026-11-22" });
  });

  it("siempre son 7 días y terminan el día anterior al envío", () => {
    // Miércoles 25-nov: del miércoles 18 al martes 24.
    expect(periodoEnvioSemanal(new Date("2026-11-25T13:00:00.000Z"))).toEqual({ desde: "2026-11-18", hasta: "2026-11-24" });
  });

  it("usa el día de Colombia: un envío lunes 11 p. m. (martes en UTC) sigue siendo del lunes", () => {
    expect(periodoEnvioSemanal(new Date("2026-11-24T04:30:00.000Z"))).toEqual({ desde: "2026-11-16", hasta: "2026-11-22" });
  });

  it("cruza el cambio de año", () => {
    expect(periodoEnvioSemanal(new Date("2027-01-04T12:00:00.000Z"))).toEqual({ desde: "2026-12-28", hasta: "2027-01-03" });
  });
});

describe("decidirVencimiento", () => {
  const proxima = new Date("2026-11-23T12:00:00.000Z");

  it("espera mientras no sea la hora", () => {
    expect(decidirVencimiento({ proximaEjecucionEn: proxima, ahora: new Date("2026-11-23T11:59:59.999Z") })).toEqual({
      accion: "esperar",
    });
  });

  it("envía en la hora exacta y con un retraso tolerable", () => {
    expect(decidirVencimiento({ proximaEjecucionEn: proxima, ahora: proxima })).toEqual({ accion: "enviar", retrasoMs: 0 });
    expect(decidirVencimiento({ proximaEjecucionEn: proxima, ahora: new Date("2026-11-23T12:10:00.000Z") })).toEqual({
      accion: "enviar",
      retrasoMs: 600_000,
    });
  });

  it("con exactamente 24 h de retraso todavía envía; con más, omite", () => {
    expect(decidirVencimiento({ proximaEjecucionEn: proxima, ahora: new Date("2026-11-24T12:00:00.000Z") }).accion).toBe("enviar");
    expect(decidirVencimiento({ proximaEjecucionEn: proxima, ahora: new Date("2026-11-24T12:00:00.001Z") }).accion).toBe("omitir");
    expect(decidirVencimiento({ proximaEjecucionEn: proxima, ahora: new Date("2026-12-10T12:00:00.000Z") }).accion).toBe("omitir");
  });
});

describe("ejecuciones en curso", () => {
  const ahora = new Date("2026-11-23T12:40:00.000Z");

  it("pasados 30 minutos se dan por perdidas", () => {
    expect(ejecucionEnCursoVencida({ iniciadaEn: new Date("2026-11-23T12:10:00.000Z"), ahora })).toBe(false);
    expect(ejecucionEnCursoVencida({ iniciadaEn: new Date("2026-11-23T12:09:59.999Z"), ahora })).toBe(true);
  });

  it("el límite de la consulta coincide con la regla", () => {
    expect(limiteEnCurso(ahora).toISOString()).toBe("2026-11-23T12:10:00.000Z");
  });
});

describe("estado del envío", () => {
  it("ok si todos los correos fueron aceptados, parcial si solo algunos, error si ninguno", () => {
    expect(estadoDeEnvio(3, 0)).toBe("ok");
    expect(estadoDeEnvio(2, 1)).toBe("parcial");
    expect(estadoDeEnvio(0, 3)).toBe("error");
    expect(estadoDeEnvio(0, 0)).toBe("error");
  });
});

describe("validación de día y hora", () => {
  it("acepta 1..7 enteros y HH:mm de 24 horas", () => {
    expect(esDiaSemanaValido(1)).toBe(true);
    expect(esDiaSemanaValido(7)).toBe(true);
    expect(esDiaSemanaValido(0)).toBe(false);
    expect(esDiaSemanaValido("1")).toBe(false);
    expect(esHoraValida("00:00")).toBe(true);
    expect(esHoraValida("23:59")).toBe(true);
    expect(esHoraValida("24:00")).toBe(false);
    expect(esHoraValida("07:60")).toBe(false);
    expect(esHoraValida("7:00")).toBe(false);
    expect(esHoraValida("07:00:00")).toBe(false);
  });

  it("describe la frecuencia en español", () => {
    expect(describirFrecuencia(1, "07:00")).toBe("Cada lunes a las 07:00 (hora de Colombia)");
    expect(describirFrecuencia(3, "18:30")).toBe("Cada miércoles a las 18:30 (hora de Colombia)");
  });
});

describe("envioAtrasado", () => {
  const proxima = new Date("2026-11-23T12:00:00.000Z");

  it("avisa cuando el envío lleva más de 30 minutos vencido y la programación sigue activa", () => {
    expect(envioAtrasado({ activa: true, proximaEjecucionEn: proxima, ahora: new Date("2026-11-23T12:30:00.000Z") })).toBe(false);
    expect(envioAtrasado({ activa: true, proximaEjecucionEn: proxima, ahora: new Date("2026-11-23T12:30:00.001Z") })).toBe(true);
  });

  it("no avisa si está pausada, no tiene próxima fecha o todavía no es la hora", () => {
    const tarde = new Date("2026-11-25T12:00:00.000Z");
    expect(envioAtrasado({ activa: false, proximaEjecucionEn: proxima, ahora: tarde })).toBe(false);
    expect(envioAtrasado({ activa: true, proximaEjecucionEn: null, ahora: tarde })).toBe(false);
    expect(envioAtrasado({ activa: true, proximaEjecucionEn: proxima, ahora: new Date("2026-11-23T11:00:00.000Z") })).toBe(false);
  });
});

describe("calcularProximaAlGuardar", () => {
  const ahora = new Date("2026-11-24T15:00:00.000Z"); // martes
  const previa = { activa: true, diaSemana: 1, hora: "07:00", proximaEjecucionEn: new Date("2026-11-30T12:00:00.000Z") };

  it("pausada no tiene próxima fecha", () => {
    expect(calcularProximaAlGuardar({ previa, nueva: { activa: false, diaSemana: 1, hora: "07:00" }, ahora })).toBeNull();
  });

  it("al activar por primera vez toma la próxima ocurrencia futura", () => {
    expect(calcularProximaAlGuardar({ previa: null, nueva: { activa: true, diaSemana: 1, hora: "07:00" }, ahora })?.toISOString()).toBe(
      "2026-11-30T12:00:00.000Z",
    );
    expect(
      calcularProximaAlGuardar({ previa: { ...previa, activa: false, proximaEjecucionEn: null }, nueva: { activa: true, diaSemana: 3, hora: "09:00" }, ahora })?.toISOString(),
    ).toBe("2026-11-25T14:00:00.000Z");
  });

  it("guardar sin cambiar el día ni la hora conserva la próxima, aunque ya haya vencido", () => {
    const vencida = { ...previa, proximaEjecucionEn: new Date("2026-11-23T12:00:00.000Z") };
    expect(calcularProximaAlGuardar({ previa: vencida, nueva: { activa: true, diaSemana: 1, hora: "07:00" }, ahora })?.toISOString()).toBe(
      "2026-11-23T12:00:00.000Z",
    );
  });

  it("cambiar el día o la hora recalcula desde ahora", () => {
    expect(calcularProximaAlGuardar({ previa, nueva: { activa: true, diaSemana: 5, hora: "07:00" }, ahora })?.toISOString()).toBe(
      "2026-11-27T12:00:00.000Z",
    );
    expect(calcularProximaAlGuardar({ previa, nueva: { activa: true, diaSemana: 1, hora: "08:30" }, ahora })?.toISOString()).toBe(
      "2026-11-30T13:30:00.000Z",
    );
  });
});

describe("fechaDePeriodoGuardado: ida y vuelta con parseRangoReporte (como lo guarda registrarEnvioReporteEjecutivo)", () => {
  it("la fecha que se guarda como «hasta» o «desde» vuelve igual, sin correr un día", () => {
    for (const fecha of ["2026-01-01", "2026-02-28", "2028-02-29", "2026-11-22", "2026-12-31", "2027-01-01"]) {
      const rango = parseRangoReporte(fecha, fecha)!;
      expect(fechaDePeriodoGuardado(rango.hasta), `hasta ${fecha}`).toBe(fecha);
      expect(fechaDePeriodoGuardado(rango.desde), `desde ${fecha}`).toBe(fecha);
    }
  });

  it("no depende de la zona del proceso: el 23:59:59.999 UTC sigue siendo de su día", () => {
    expect(fechaDePeriodoGuardado(new Date("2026-11-22T23:59:59.999Z"))).toBe("2026-11-22");
    // Un instante a medianoche UTC es del día que empieza, aunque en Colombia aún sea el anterior.
    expect(fechaDePeriodoGuardado(new Date("2026-11-23T00:00:00.000Z"))).toBe("2026-11-23");
  });
});

describe("calcularPeriodoEnvio", () => {
  // Lunes 30-nov-2026, 7:00 a. m. de Colombia: el período termina el domingo 29.
  const lunes30 = new Date("2026-11-30T12:00:00.000Z");
  const guardado = (hasta: string) => parseRangoReporte(hasta, hasta)!.hasta;

  it("sin reportes previos: los 7 días que terminan el día anterior al envío", () => {
    expect(calcularPeriodoEnvio({ referencia: lunes30, ultimoPeriodoHasta: null })).toEqual({
      estado: "nuevo", desde: "2026-11-23", hasta: "2026-11-29", origen: "primer_envio",
      ultimoHasta: null, recortado: false, desdeSinRecorte: "2026-11-23",
    });
  });

  it("continúa desde el día siguiente al último reporte enviado", () => {
    // El último reporte llegó hasta el domingo 22: este arranca el lunes 23 y termina el domingo 29.
    expect(calcularPeriodoEnvio({ referencia: lunes30, ultimoPeriodoHasta: guardado("2026-11-22") })).toEqual({
      estado: "nuevo", desde: "2026-11-23", hasta: "2026-11-29", origen: "continua",
      ultimoHasta: "2026-11-22", recortado: false, desdeSinRecorte: "2026-11-23",
    });
  });

  it("si pasó más de una semana sin enviar, el período crece para no dejar días sin reportar", () => {
    const r = calcularPeriodoEnvio({ referencia: lunes30, ultimoPeriodoHasta: guardado("2026-11-08") });
    expect(r).toMatchObject({ estado: "nuevo", desde: "2026-11-09", hasta: "2026-11-29", origen: "continua", recortado: false });
  });

  it("dos envíos seguidos no se traslapan ni dejan huecos (el «hasta» es siempre el día anterior)", () => {
    const primero = calcularPeriodoEnvio({ referencia: new Date("2026-11-23T12:00:00.000Z"), ultimoPeriodoHasta: null });
    expect(primero).toMatchObject({ desde: "2026-11-16", hasta: "2026-11-22" });
    // Se guarda como lo hace el envío (parseRangoReporte) y el siguiente arranca justo después.
    const siguiente = calcularPeriodoEnvio({ referencia: lunes30, ultimoPeriodoHasta: guardado((primero as { hasta: string }).hasta) });
    expect(siguiente).toMatchObject({ estado: "nuevo", desde: "2026-11-23", hasta: "2026-11-29" });
  });

  it("el día de envío no se cuenta: se reporta hasta el día anterior, en hora de Colombia", () => {
    // Lunes 23 a las 11:30 p. m. de Colombia (martes 04:30 UTC) sigue siendo lunes: el período termina el domingo 22.
    expect(calcularPeriodoEnvio({ referencia: new Date("2026-11-24T04:30:00.000Z"), ultimoPeriodoHasta: null })).toMatchObject({ hasta: "2026-11-22" });
    // Domingo 22 a las 11:59 p. m. de Colombia (lunes 04:59 UTC) sigue siendo domingo: el período termina el sábado 21.
    expect(calcularPeriodoEnvio({ referencia: new Date("2026-11-23T04:59:00.000Z"), ultimoPeriodoHasta: null })).toMatchObject({ hasta: "2026-11-21" });
  });

  it("recorta a 30 días cuando el último reporte quedó muy atrás", () => {
    // Último reporte hasta 2024-01-31; el período querría empezar el 2024-02-01 (más de 30 días).
    const r = calcularPeriodoEnvio({ referencia: lunes30, ultimoPeriodoHasta: guardado("2024-01-31") });
    expect(r).toMatchObject({ estado: "nuevo", hasta: "2026-11-29", recortado: true, desdeSinRecorte: "2024-02-01", ultimoHasta: "2024-01-31" });
    if (r.estado !== "nuevo") throw new Error("se esperaba un período nuevo");
    // 30 días exactos (del 31-oct al 29-nov).
    expect(r.desde).toBe("2026-10-31");
    expect(parseRangoReporte(r.desde, r.hasta)).not.toBeNull();
  });

  it("el tope: 30 días justos no se recortan y 31 sí", () => {
    // hasta = 2026-11-29. Con desde = 2026-10-31 son 30 días: sin recorte. Con desde = 2026-10-30 son 31.
    expect(calcularPeriodoEnvio({ referencia: lunes30, ultimoPeriodoHasta: guardado("2026-10-30") })).toMatchObject({ desde: "2026-10-31", recortado: false });
    expect(calcularPeriodoEnvio({ referencia: lunes30, ultimoPeriodoHasta: guardado("2026-10-29") })).toMatchObject({ desde: "2026-10-31", recortado: true, desdeSinRecorte: "2026-10-30" });
  });

  it("ya cubierto: si el último reporte llega al día que se iba a reportar o más allá, no hay período nuevo", () => {
    expect(calcularPeriodoEnvio({ referencia: lunes30, ultimoPeriodoHasta: guardado("2026-11-29") })).toEqual({
      estado: "cubierto", hasta: "2026-11-29", cubiertoHasta: "2026-11-29",
    });
    // Un envío manual de hoy (hasta ayer, 29) o con un período que llegó más allá (hasta el 30).
    expect(calcularPeriodoEnvio({ referencia: lunes30, ultimoPeriodoHasta: guardado("2026-11-30") })).toMatchObject({ estado: "cubierto", cubiertoHasta: "2026-11-30" });
    expect(calcularPeriodoEnvio({ referencia: lunes30, ultimoPeriodoHasta: guardado("2027-02-01") })).toMatchObject({ estado: "cubierto", cubiertoHasta: "2027-02-01" });
  });

  it("un día antes de quedar cubierto todavía hay un día nuevo que reportar", () => {
    expect(calcularPeriodoEnvio({ referencia: lunes30, ultimoPeriodoHasta: guardado("2026-11-28") })).toMatchObject({
      estado: "nuevo", desde: "2026-11-29", hasta: "2026-11-29",
    });
  });
});

describe("calcularPeriodoEnvioManual", () => {
  const martes24 = new Date("2026-11-24T15:30:00.000Z"); // 10:30 a. m. Colombia
  const guardado = (hasta: string) => parseRangoReporte(hasta, hasta)!.hasta;

  it("sin envíos previos sugiere los últimos 7 días incluyendo hoy (hora de Colombia)", () => {
    expect(calcularPeriodoEnvioManual({ ahora: martes24, ultimoPeriodoHasta: null })).toEqual({
      desde: "2026-11-18",
      hasta: "2026-11-24",
      hoy: "2026-11-24",
      origen: "primer_envio",
      ultimoHasta: null,
      recortado: false,
      desdeSinRecorte: "2026-11-18",
      yaCubiertoHoy: false,
    });
  });

  it("con un último reporte anterior a hoy arranca al día siguiente hasta hoy", () => {
    expect(calcularPeriodoEnvioManual({ ahora: martes24, ultimoPeriodoHasta: guardado("2026-11-23") })).toEqual({
      desde: "2026-11-24",
      hasta: "2026-11-24",
      hoy: "2026-11-24",
      origen: "continua",
      ultimoHasta: "2026-11-23",
      recortado: false,
      desdeSinRecorte: "2026-11-24",
      yaCubiertoHoy: false,
    });
    expect(calcularPeriodoEnvioManual({ ahora: martes24, ultimoPeriodoHasta: guardado("2026-11-10") })).toMatchObject({
      desde: "2026-11-11",
      hasta: "2026-11-24",
      origen: "continua",
      ultimoHasta: "2026-11-10",
      recortado: false,
      yaCubiertoHoy: false,
    });
  });

  it("si el último reporte ya cubrió hasta hoy, marca yaCubiertoHoy y deja hoy..hoy como punto de partida editable", () => {
    expect(calcularPeriodoEnvioManual({ ahora: martes24, ultimoPeriodoHasta: guardado("2026-11-24") })).toEqual({
      desde: "2026-11-24",
      hasta: "2026-11-24",
      hoy: "2026-11-24",
      origen: "continua",
      ultimoHasta: "2026-11-24",
      recortado: false,
      desdeSinRecorte: "2026-11-24",
      yaCubiertoHoy: true,
    });
  });

  it("recorta a 30 días cuando el último reporte quedó muy atrás", () => {
    const r = calcularPeriodoEnvioManual({ ahora: martes24, ultimoPeriodoHasta: guardado("2026-08-28") });
    expect(r).toMatchObject({
      desde: "2026-10-26",
      hasta: "2026-11-24",
      recortado: true,
      desdeSinRecorte: "2026-08-29",
      yaCubiertoHoy: false,
    });
    expect(parseRangoReporte(r.desde, r.hasta)).not.toBeNull();
  });
});
