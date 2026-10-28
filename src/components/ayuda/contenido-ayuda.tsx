import Link from "next/link";
import { Icon } from "@/components/icons";
import { chipsDeRoles, rolDelUsuarioPuede, rolesDeRegla, type RolesAyuda } from "@/lib/ayuda/roles";
import type { AccionAyuda, EtapaAyuda, FichaAyuda, PestanaAyuda } from "@/lib/ayuda/tipos";

export type ContenidoAyudaProps = {
  /** La ficha ya filtrada por la búsqueda (null: la pantalla no tiene ayuda). */
  ficha: FichaAyuda | null;
  rolesAyuda: RolesAyuda;
  rol: string;
  permisos: readonly string[];
  /** ¿Puede el usuario abrir una página que pide este permiso? */
  puedeAbrir: (permiso: string) => boolean;
  /** Pestaña elegida para mostrar (null: la pantalla no tiene pestañas). */
  pestanaId: string | null;
  /** Pestaña en la que está el usuario, si la pantalla la anunció. */
  pestanaAnunciada: string | null;
  onPestana: (id: string) => void;
  /** Hay búsqueda: se muestran todas las pestañas que coinciden, sin selector. */
  buscando: boolean;
  /** Se siguió un enlace del panel. */
  onNavegar?: () => void;
};

function Accion({ accion, ...p }: { accion: AccionAyuda } & Pick<ContenidoAyudaProps, "rolesAyuda" | "rol" | "permisos">) {
  const roles = rolesDeRegla(accion.regla, p.rolesAyuda);
  const puede = rolDelUsuarioPuede(accion.regla, p.rol, p.rolesAyuda, p.permisos);
  return (
    <li className="border-t border-ink-100 py-2.5 first:border-t-0 first:pt-1">
      <div className="flex items-start gap-2">
        <b className="text-[12.5px] leading-snug text-ink-800">{accion.nombre}</b>
        {puede && (
          <span className="ml-auto inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold text-ok-700">
            <Icon name="check" size={12} />
            Tu rol puede
          </span>
        )}
      </div>
      <p className="mt-0.5 text-[12px] leading-snug text-ink-600">{accion.queHace}</p>
      <div className="mt-1.5 flex flex-wrap gap-1">
        {roles.length === 0 ? (
          <span className="text-[11px] text-ink-500">Hoy ningún rol tiene este permiso.</span>
        ) : (
          chipsDeRoles(roles).map((c) => (
            <span key={c.texto} className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-navy-700">
              {c.texto}
              {c.detalle && <span className="font-normal text-ink-500">{` · ${c.detalle}`}</span>}
            </span>
          ))
        )}
      </div>
      {accion.condiciones && accion.condiciones.length > 0 && (
        <ul className="mt-1.5 space-y-0.5">
          {accion.condiciones.map((c) => (
            <li key={c} className="flex gap-1.5 text-[11.5px] leading-snug text-warn-700">
              <span aria-hidden>•</span>
              <span>{c}</span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function Etapas({ etapas, ...p }: { etapas: readonly EtapaAyuda[] } & Pick<ContenidoAyudaProps, "rolesAyuda" | "rol" | "permisos">) {
  return (
    <ol className="space-y-3">
      {etapas.map((e, i) => (
        <li key={e.titulo}>
          <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-ink-500">
            {i + 1} · {e.titulo}
          </h4>
          <ul>
            {e.acciones.map((a) => (
              <Accion key={a.nombre} accion={a} {...p} />
            ))}
          </ul>
        </li>
      ))}
    </ol>
  );
}

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="mt-5">
      <h3 className="mb-2 text-[12.5px] font-semibold text-navy-800">{titulo}</h3>
      {children}
    </section>
  );
}

function Pestana({ pestana, ...p }: { pestana: PestanaAyuda } & Pick<ContenidoAyudaProps, "rolesAyuda" | "rol" | "permisos">) {
  return (
    <div className="rounded-lg border border-ink-150 bg-paper px-3 py-2.5">
      <p className="mb-2 text-[12px] leading-snug text-ink-600">{pestana.proposito}</p>
      <Etapas etapas={pestana.etapas} {...p} />
    </div>
  );
}

/** Cuerpo del panel de ayuda, en un orden fijo. Sin estado: lo controla el panel. */
export default function ContenidoAyuda(props: ContenidoAyudaProps) {
  const { ficha, puedeAbrir, onNavegar } = props;
  const datosRol = { rolesAyuda: props.rolesAyuda, rol: props.rol, permisos: props.permisos };
  const mesaAyuda = puedeAbrir("soporte:ver") && (
    <p className="mt-6 flex items-start gap-1.5 border-t border-ink-100 pt-3 text-[12px] text-ink-600">
      <Icon name="help" size={14} className="mt-0.5 shrink-0 text-ink-400" />
      <span>
        ¿No encontraste lo que buscabas?{" "}
        <Link href="/reportes" onClick={onNavegar} className="font-medium text-blue-600 hover:underline">
          Reportar a Mesa de ayuda
        </Link>
      </span>
    </p>
  );

  if (!ficha) {
    return (
      <div>
        <p className="text-[12.5px] leading-snug text-ink-600">Aún no hay ayuda para esta pantalla.</p>
        <p className="mt-2 text-[12px] leading-snug text-ink-500">
          Por ahora la ayuda cubre el Balance de comprobación, el Borrador de balance y los Módulos de conciliación.
        </p>
        {mesaAyuda}
      </div>
    );
  }

  const pestanas = ficha.pestanas ?? [];
  const elegida = pestanas.find((x) => x.id === props.pestanaId) ?? null;
  const relacionadas = (ficha.relacionadas ?? []).filter((r) => !r.permiso || puedeAbrir(r.permiso));
  const hayAcciones = ficha.etapas.length > 0 || pestanas.length > 0;

  return (
    <div>
      <p className="text-[12.5px] leading-snug text-ink-700">{ficha.proposito}</p>

      {!props.buscando && ficha.antesDeEmpezar && ficha.antesDeEmpezar.length > 0 && (
        <Seccion titulo="Antes de empezar">
          <ul className="space-y-1">
            {ficha.antesDeEmpezar.map((t) => (
              <li key={t} className="flex gap-1.5 text-[12px] leading-snug text-ink-600">
                <Icon name="info" size={13} className="mt-0.5 shrink-0 text-blue-600" />
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </Seccion>
      )}

      {hayAcciones && (
        <Seccion titulo="Qué puedes hacer aquí">
          {ficha.etapas.length > 0 && <Etapas etapas={ficha.etapas} {...datosRol} />}
          {pestanas.length > 0 && (
            <div className={ficha.etapas.length > 0 ? "mt-4" : ""}>
              <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-500">Por pestaña</h4>
              {props.buscando ? (
                <div className="space-y-3">
                  {pestanas.map((x) => (
                    <div key={x.id}>
                      <p className="mb-1 text-[12px] font-semibold text-ink-700">{x.titulo}</p>
                      <Pestana pestana={x} {...datosRol} />
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  <div role="group" aria-label="Pestañas de la pantalla" className="mb-2 flex flex-wrap gap-1">
                    {pestanas.map((x) => {
                      const activa = x.id === elegida?.id;
                      return (
                        <button
                          key={x.id}
                          type="button"
                          aria-pressed={activa}
                          onClick={() => props.onPestana(x.id)}
                          className={`rounded-md border px-2 py-1 text-[11.5px] font-semibold transition ${
                            activa ? "border-navy-700 bg-navy-700 text-white" : "border-ink-200 bg-white text-ink-600 hover:bg-ink-50"
                          }`}
                        >
                          {x.titulo}
                          {x.id === props.pestanaAnunciada && (
                            <span className={`ml-1 font-normal ${activa ? "text-navy-100" : "text-ink-400"}`}>· estás aquí</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  {elegida && <Pestana pestana={elegida} {...datosRol} />}
                </>
              )}
            </div>
          )}
        </Seccion>
      )}

      {ficha.estados && ficha.estados.length > 0 && (
        <Seccion titulo="Estados y avisos">
          <dl className="space-y-1.5">
            {ficha.estados.map((e) => (
              <div key={e.etiqueta}>
                <dt className="inline rounded-full bg-ink-100 px-2 py-0.5 text-[11px] font-semibold text-ink-700">{e.etiqueta}</dt>
                <dd className="mt-0.5 text-[12px] leading-snug text-ink-600">{e.significado}</dd>
              </div>
            ))}
          </dl>
        </Seccion>
      )}

      {ficha.preguntas && ficha.preguntas.length > 0 && (
        <Seccion titulo="Preguntas frecuentes">
          <div className="space-y-1">
            {ficha.preguntas.map((q) => (
              <details key={q.pregunta} className="group rounded-md border border-ink-150 px-2.5 py-1.5" open={props.buscando}>
                <summary className="cursor-pointer text-[12px] font-medium text-ink-800">{q.pregunta}</summary>
                <p className="mt-1 text-[12px] leading-snug text-ink-600">{q.respuesta}</p>
              </details>
            ))}
          </div>
        </Seccion>
      )}

      {!props.buscando && relacionadas.length > 0 && (
        <Seccion titulo="Relacionado">
          <ul className="flex flex-wrap gap-x-3 gap-y-1">
            {relacionadas.map((r) => (
              <li key={r.href}>
                <Link href={r.href} onClick={onNavegar} className="text-[12px] font-medium text-blue-600 hover:underline">
                  {r.label}
                </Link>
              </li>
            ))}
          </ul>
        </Seccion>
      )}

      {mesaAyuda}
    </div>
  );
}
