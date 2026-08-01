"use client";

// Pestaña «Prevalidador»: compuerta que se corre DESPUÉS de homologar y ANTES de
// conciliar. Para las cuentas que alimentan los módulos del ERP compara el saldo
// agregado por la cuenta estándar Russell contra el agregado por el código original
// del cliente. Si la homologación fue correcta, los dos lados coinciden.
//
// El informe NO propone ni corrige nada: pinta los números y deja un solo campo
// editable (la cuenta del cliente, para los que no usan el prefijo habitual).

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { Card, Chip } from "@/components/ui";
import { Modal } from "@/components/modal";
import { EstadoProcesando } from "@/components/estado-procesando";
import { fmt } from "@/lib/format";
import { notifyError, notifySuccess } from "@/lib/client-notifications";
import {
  guardarCuentaClientePrevalidador,
  restablecerCuentaClientePrevalidador,
} from "@/app/actions/prevalidador";
import {
  factorPresentacion,
  type FilaPrevalidadorVM,
  type OpcionCuentaCliente,
  type PrevalidadorVM,
} from "@/lib/balance/prevalidador/calcular";

export default function PrevalidadorTab({
  prevalidador,
  balanceId,
  puedeEditar,
  onIrADetalle,
}: {
  prevalidador: PrevalidadorVM;
  balanceId: number;
  puedeEditar: boolean;
  /** Salta a «Detalle por niveles», donde se homologan las cuentas pendientes. */
  onIrADetalle: () => void;
}) {
  if (prevalidador.estado === "sin_catalogo") {
    return (
      <Card>
        <div className="px-4 py-6 text-[12.5px] text-ink-500">
          No hay cuentas configuradas para el prevalidador. Un administrador las define en{" "}
          <span className="font-medium text-ink-700">Configuración › Cuentas del prevalidador</span>.
        </div>
      </Card>
    );
  }

  if (prevalidador.estado === "bloqueado") {
    const { cuentas, monto } = prevalidador.sinHomologar;
    return (
      <Card>
        <div className="flex flex-col gap-3 px-4 py-5">
          <div className="flex items-start gap-2.5">
            <span className="mt-0.5 text-warn-700">
              <Icon name="warn" size={16} />
            </span>
            <div>
              <p className="text-[13px] font-semibold text-ink-800">El prevalidador está bloqueado</p>
              <p className="mt-1 max-w-3xl text-[12.5px] leading-relaxed text-ink-600">
                Quedan <span className="font-semibold text-ink-800">{cuentas} cuenta(s) sin homologar</span> por{" "}
                <span className="font-mono font-semibold text-ink-800">{fmt(monto)}</span>. Mientras existan, los dos
                lados del informe no son comparables: ese saldo no aparece del lado de Russell y sí del lado del
                cliente, así que cualquier diferencia sería falsa.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onIrADetalle}
            className="w-fit rounded-md bg-navy-700 px-3 py-1.5 text-[12.5px] font-semibold text-white transition hover:bg-navy-600"
          >
            Ir a Detalle por niveles
          </button>
        </div>
      </Card>
    );
  }

  const { modulos, anidamientos, opcionesCliente, totalRussell, totalCliente, diferenciaTotal, filasConDiferencia } =
    prevalidador;
  // Catálogo servido desde los valores de fábrica (la tabla no respondió o está
  // vacía): el informe sirve, pero no se pueden guardar cuentas propias de cliente.
  const esFabrica = modulos.every((m) => m.filas.every((f) => f.catalogoId <= 0));

  return (
    <div className="flex flex-col gap-3">
      {esFabrica && (
        <Card>
          <div className="flex items-start gap-2.5 px-4 py-3 text-[12px] leading-relaxed text-ink-600">
            <span className="mt-0.5 text-ink-400">
              <Icon name="info" size={15} />
            </span>
            <div>
              <span className="font-semibold text-ink-800">Catálogo de fábrica.</span> Las cuentas de abajo no se
              están leyendo de la base de datos, así que no se puede fijar una cuenta propia por cliente. Revisa que
              la migración del prevalidador esté aplicada y que existan cuentas en Configuración › Cuentas del
              prevalidador.
            </div>
          </div>
        </Card>
      )}
      {anidamientos.length > 0 && (
        <Card>
          <div className="flex items-start gap-2.5 px-4 py-3">
            <span className="mt-0.5 text-warn-700">
              <Icon name="warn" size={15} />
            </span>
            <div className="text-[12px] leading-relaxed text-ink-600">
              <span className="font-semibold text-ink-800">Posible doble conteo.</span>{" "}
              {anidamientos.length} cuenta(s) de este balance son a la vez cuenta y encabezado de otras, así que su
              saldo se suma dos veces al agrupar por prefijo. Revísalas en el borrador antes de fiarte de las
              diferencias:{" "}
              <span className="font-mono text-ink-700">
                {anidamientos
                  .slice(0, 8)
                  .map((a) => a.cuenta8)
                  .join(" · ")}
                {anidamientos.length > 8 && ` … +${anidamientos.length - 8}`}
              </span>
            </div>
          </div>
        </Card>
      )}

      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-ink-100 px-4 py-2.5">
          <span className="max-w-3xl text-[11.5px] text-ink-500">
            Compara el saldo de cada grupo de cuentas antes y después de homologar. El lado de Russell agrupa por la
            cuenta estándar asignada; el del cliente, por el código original de su balance.
          </span>
          <span className="ml-auto">
            {filasConDiferencia === 0 ? (
              <Chip label="Sin diferencias" tone="ok" />
            ) : (
              <Chip label={`${filasConDiferencia} con diferencia`} tone="err" />
            )}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="balance-detail-row-hover w-full text-[12.5px]">
            <thead>
              <tr className="border-b border-ink-100 text-[11px] uppercase tracking-wider text-ink-500">
                <th rowSpan={2} className="px-4 py-2 text-left font-semibold">
                  Módulo
                </th>
                <th colSpan={3} className="border-l border-ink-150 bg-ink-50 px-4 py-1.5 text-center font-semibold">
                  Russell (homologado)
                </th>
                <th colSpan={3} className="border-l border-ink-150 bg-ink-50 px-4 py-1.5 text-center font-semibold">
                  Cliente (original)
                </th>
                <th colSpan={2} className="border-l border-ink-150 bg-ink-50 px-4 py-1.5 text-center font-semibold">
                  Diferencia
                </th>
              </tr>
              <tr className="border-b border-ink-100 text-[11px] uppercase tracking-wider text-ink-500">
                <th className="border-l border-ink-150 px-4 py-2 text-left font-semibold">Cuenta</th>
                <th className="whitespace-nowrap px-4 py-2 text-right font-semibold">Saldo final</th>
                <th className="whitespace-nowrap px-4 py-2 text-right font-semibold">Total módulo</th>
                <th className="border-l border-ink-150 px-4 py-2 text-left font-semibold">Cuenta</th>
                <th className="whitespace-nowrap px-4 py-2 text-right font-semibold">Saldo final</th>
                <th className="whitespace-nowrap px-4 py-2 text-right font-semibold">Total módulo</th>
                <th className="whitespace-nowrap border-l border-ink-150 px-4 py-2 text-right font-semibold">
                  Saldo final
                </th>
                <th className="whitespace-nowrap px-4 py-2 text-right font-semibold">Total módulo</th>
              </tr>
            </thead>
            {modulos.map((m) => (
              <tbody key={m.codigo} className="border-b border-ink-150 last:border-0">
                {m.filas.map((f, i) => (
                  <tr key={`${m.codigo}-${f.cuentaRussell}`} className="border-b border-ink-100 last:border-0">
                    {i === 0 && (
                      <td rowSpan={m.filas.length} className="px-4 py-2.5 align-top font-medium text-ink-800">
                        {m.nombre}
                      </td>
                    )}
                    <td className="border-l border-ink-150 px-4 py-2.5">
                      <span className="font-mono font-medium text-ink-800" title={f.etiqueta ?? undefined}>
                        {f.cuentaRussell}
                      </span>
                      {f.etiqueta && <div className="text-[11px] text-ink-400">{f.etiqueta}</div>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right font-mono text-ink-700">
                      {fmt(f.russell.saldoFinal)}
                    </td>
                    {i === 0 && (
                      <td
                        rowSpan={m.filas.length}
                        className="whitespace-nowrap px-4 py-2.5 text-right align-top font-mono font-semibold text-ink-800"
                      >
                        {fmt(m.totalRussell)}
                      </td>
                    )}
                    <td className="border-l border-ink-150 px-4 py-2.5">
                      <CeldaCuentaCliente
                        fila={f}
                        balanceId={balanceId}
                        puedeEditar={puedeEditar}
                        opciones={opcionesCliente}
                      />
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right font-mono text-ink-700">
                      {fmt(f.cliente.saldoFinal)}
                    </td>
                    {i === 0 && (
                      <td
                        rowSpan={m.filas.length}
                        className="whitespace-nowrap px-4 py-2.5 text-right align-top font-mono font-semibold text-ink-800"
                      >
                        {fmt(m.totalCliente)}
                      </td>
                    )}
                    <td className="whitespace-nowrap border-l border-ink-150 px-4 py-2.5 text-right">
                      <Diferencia valor={f.diferencia} coincide={f.coincide} />
                    </td>
                    {i === 0 && (
                      <td rowSpan={m.filas.length} className="whitespace-nowrap px-4 py-2.5 text-right align-top">
                        <Diferencia valor={m.diferenciaTotal} coincide={m.coincide} fuerte />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            ))}
            <tfoot>
              <tr className="bg-ink-50 text-[12.5px] font-semibold text-ink-800">
                <td className="px-4 py-2.5">Total</td>
                <td className="border-l border-ink-150 px-4 py-2.5" />
                <td className="px-4 py-2.5" />
                <td className="whitespace-nowrap px-4 py-2.5 text-right font-mono">{fmt(totalRussell)}</td>
                <td className="border-l border-ink-150 px-4 py-2.5" />
                <td className="px-4 py-2.5" />
                <td className="whitespace-nowrap px-4 py-2.5 text-right font-mono">{fmt(totalCliente)}</td>
                <td className="border-l border-ink-150 px-4 py-2.5" />
                <td className="whitespace-nowrap px-4 py-2.5 text-right font-mono">{fmt(diferenciaTotal)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="border-t border-ink-100 px-4 py-2.5 text-[11px] leading-relaxed text-ink-500">
          Las cuentas de balance (clases 1 a 3) se comparan por su saldo final; las de resultado (clases 4 a 7), por el
          movimiento del período (débitos menos créditos). Pasivo, patrimonio e ingresos se muestran en su naturaleza,
          en positivo, igual que en «Saldos por clase». La cuenta de Russell es fija; la del cliente se puede cambiar
          cuando ese cliente maneja el rubro en otro código, y queda guardada para todos sus períodos.
        </div>
      </Card>
    </div>
  );
}

function Diferencia({ valor, coincide, fuerte }: { valor: number; coincide: boolean; fuerte?: boolean }) {
  if (coincide) return <Chip label="OK" tone="ok" />;
  return (
    <span className={`font-mono text-err-700 ${fuerte ? "font-semibold" : ""}`} title="Los dos lados no cuadran">
      {fmt(valor)}
    </span>
  );
}

/**
 * Cuenta del cliente contra la que se compara la fila. Se elige de una lista con los
 * prefijos que el balance TIENE de verdad, con su saldo al lado: escribir el código a
 * mano deja demasiado margen para el error de dedo, que es justamente lo que este
 * informe existe para atrapar.
 */
function CeldaCuentaCliente({
  fila,
  balanceId,
  puedeEditar,
  opciones,
}: {
  fila: FilaPrevalidadorVM;
  balanceId: number;
  puedeEditar: boolean;
  opciones: OpcionCuentaCliente[];
}) {
  const [abierto, setAbierto] = useState(false);

  // Las filas de fábrica (catalogoId 0) no existen en base de datos, así que no hay
  // a qué colgar la cuenta propia del cliente.
  const editable = puedeEditar && fila.catalogoId > 0;

  if (!editable) {
    return (
      <span className="font-mono text-ink-700">
        {fila.cuentaCliente}
        {fila.personalizada && <span className="ml-1.5 text-[10px] uppercase text-blue-600">propia</span>}
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        title={`Elegir contra qué cuenta del cliente se compara la ${fila.cuentaRussell} de Russell`}
        className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-[12.5px] transition ${
          fila.personalizada
            ? "border-blue-300 bg-blue-50 text-navy-700 hover:bg-blue-100"
            : "border-ink-200 text-ink-700 hover:bg-ink-50"
        }`}
      >
        {fila.cuentaCliente}
        <Icon name="chev-d" size={11} />
      </button>
      {abierto && (
        <ModalCuentaCliente
          fila={fila}
          balanceId={balanceId}
          opciones={opciones}
          onClose={() => setAbierto(false)}
        />
      )}
    </>
  );
}

/** Selector de la cuenta del cliente: lista de prefijos reales del balance con su saldo. */
function ModalCuentaCliente({
  fila,
  balanceId,
  opciones,
  onClose,
}: {
  fila: FilaPrevalidadorVM;
  balanceId: number;
  opciones: OpcionCuentaCliente[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [pendiente, start] = useTransition();
  const [q, setQ] = useState("");

  // El saldo se muestra con la base de la fila pero en la naturaleza PROPIA de cada
  // cuenta (un activo en positivo, un pasivo en positivo), igual que «Saldos por
  // clase». Usar el factor de la fila de origen pintaría los activos en negativo al
  // elegir desde una fila de ingresos, que es justo lo contrario de reconocible.
  const saldoDe = (o: OpcionCuentaCliente) =>
    factorPresentacion(o.prefijo) * (fila.baseCalculo === "movimiento" ? o.movimiento : o.saldo);

  const listado = useMemo(() => {
    const t = q.trim().toLowerCase();
    const visibles = t
      ? opciones.filter((o) => o.prefijo.startsWith(t) || o.nombre.toLowerCase().includes(t)).slice(0, 200)
      : // Sin búsqueda: los grupos (nivel 2) y, dentro del grupo de la cuenta de
        // Russell, también sus cuentas de 4 dígitos.
        opciones.filter((o) => o.nivel === 2 || o.prefijo.startsWith(fila.cuentaRussell.slice(0, 2)));
    // La cuenta vigente y la de Russell van primero: son las dos que el usuario
    // busca al abrir, y en un balance con decenas de grupos quedarían enterradas.
    const rango = (o: OpcionCuentaCliente) =>
      o.prefijo === fila.cuentaCliente ? 0 : o.prefijo === fila.cuentaRussell ? 1 : 2;
    return [...visibles].sort((a, b) => rango(a) - rango(b) || a.prefijo.localeCompare(b.prefijo));
  }, [q, opciones, fila.cuentaRussell, fila.cuentaCliente]);

  const aplicar = (cuenta: string) => {
    if (cuenta === fila.cuentaCliente) {
      onClose();
      return;
    }
    const fd = new FormData();
    fd.set("balanceId", String(balanceId));
    fd.set("catalogoId", String(fila.catalogoId));
    fd.set("cuentaCliente", cuenta);
    start(async () => {
      const r = await guardarCuentaClientePrevalidador(fd);
      if (r?.ok) {
        notifySuccess(r.message ?? "Cuenta actualizada.");
        router.refresh();
        onClose();
      } else {
        notifyError(r?.message ?? "No se pudo guardar la cuenta.");
      }
    });
  };

  const restablecer = () => {
    const fd = new FormData();
    fd.set("balanceId", String(balanceId));
    fd.set("catalogoId", String(fila.catalogoId));
    start(async () => {
      const r = await restablecerCuentaClientePrevalidador(fd);
      if (r?.ok) {
        notifySuccess(r.message ?? "Cuenta restablecida.");
        router.refresh();
        onClose();
      } else {
        notifyError(r?.message ?? "No se pudo restablecer la cuenta.");
      }
    });
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="2xl"
      title={`Cuenta del cliente para la ${fila.cuentaRussell} de Russell`}
    >
      <div className="flex flex-col gap-3">
        <p className="text-[12px] leading-relaxed text-ink-500">
          Elige contra qué cuenta del balance del cliente se compara
          {fila.etiqueta ? ` «${fila.etiqueta}»` : ""}. Solo se listan los códigos que este balance tiene, con el saldo
          que aportarían. La elección queda guardada para todos los períodos de este cliente.
        </p>

        <div className="relative">
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400">
            <Icon name="search" size={14} />
          </span>
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por código o nombre de cuenta…"
            className="w-full rounded-md border border-ink-200 py-2 pl-8 pr-3 text-[12.5px] text-ink-700 outline-none focus:border-blue-400"
          />
        </div>

        <div className="max-h-80 overflow-y-auto rounded-md border border-ink-150">
          {listado.length === 0 && (
            <p className="px-3 py-6 text-center text-[12px] text-ink-500">
              Ninguna cuenta del balance coincide con «{q}».
            </p>
          )}
          {listado.map((o) => {
            const actual = o.prefijo === fila.cuentaCliente;
            const esRussell = o.prefijo === fila.cuentaRussell;
            return (
              <button
                key={`${o.nivel}-${o.prefijo}`}
                type="button"
                disabled={pendiente}
                onClick={() => aplicar(o.prefijo)}
                className={`flex w-full items-center gap-3 border-b border-ink-100 px-3 py-2 text-left transition last:border-0 disabled:opacity-60 ${
                  actual ? "bg-blue-50" : "hover:bg-ink-50"
                }`}
              >
                <span className="w-16 shrink-0 font-mono text-[12.5px] font-medium text-ink-800">{o.prefijo}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12px] text-ink-700">{o.nombre || "—"}</span>
                  <span className="text-[10.5px] text-ink-400">
                    {o.nivel === 2 ? "Grupo" : "Cuenta"} · {o.cuentas} cuenta(s) del balance
                  </span>
                </span>
                <span className="shrink-0 whitespace-nowrap font-mono text-[12.5px] text-ink-700">
                  {fmt(saldoDe(o))}
                </span>
                <span className="w-24 shrink-0 text-right">
                  {actual && <Chip label="Actual" tone="blue" />}
                  {!actual && esRussell && <Chip label="Russell" tone="ink" />}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-between">
          <span className="text-[11px] text-ink-400">
            {pendiente ? <EstadoProcesando>Guardando</EstadoProcesando> : `${listado.length} cuenta(s)`}
          </span>
          {fila.personalizada && (
            <button
              type="button"
              onClick={restablecer}
              disabled={pendiente}
              className="rounded-md border border-ink-200 px-3 py-1.5 text-[12px] font-semibold text-ink-600 hover:bg-ink-50 disabled:opacity-60"
            >
              Volver a la cuenta {fila.cuentaRussell} de Russell
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
