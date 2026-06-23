"use client";

import { useState } from "react";
import { Card, CardHeader, Chip, EmptyState, PageHeader, StatCard } from "@/components/ui";
import { Icon } from "@/components/icons";
import type { ClienteRef, EstructuraArbol, PersonaNodo } from "@/lib/estructura/arbol";

// Tono del Chip de rol (paleta de @/components/ui · Chip).
const ROLE_TONE: Record<string, "ok" | "warn" | "err" | "ink" | "blue" | "ai"> = {
  Socio: "blue",
  Gerente: "ai",
  Senior: "ok",
  Staff: "ink",
};

// Fondo del avatar de iniciales por rol.
const AVATAR_TONE: Record<string, string> = {
  Socio: "bg-blue-100 text-navy-700",
  Gerente: "bg-ai-100 text-ai-700",
  Senior: "bg-ok-100 text-ok-700",
  Staff: "bg-ink-100 text-ink-600",
};

// Rol del nivel inferior: al entrar a esta persona se listan sus… (undefined =
// hoja, el Staff no tiene subordinados).
const SUBNIVEL: Record<string, string | undefined> = {
  Socio: "Gerentes",
  Gerente: "Seniors",
  Senior: "Staff",
  Staff: undefined,
};

function tono(role: string) {
  return ROLE_TONE[role] ?? "ink";
}

function Avatar({ initials, role, lg = false }: { initials: string; role: string; lg?: boolean }) {
  const dim = lg ? "h-12 w-12 text-[15px]" : "h-9 w-9 text-[12px]";
  return (
    <div
      className={`flex ${dim} shrink-0 items-center justify-center rounded-full font-semibold ${
        AVATAR_TONE[role] ?? "bg-ink-100 text-ink-600"
      }`}
    >
      {initials}
    </div>
  );
}

/** Resumen de "qué cuelga" de una persona, para la línea secundaria. */
function resumenPersona(nodo: PersonaNodo): string {
  const sub = SUBNIVEL[nodo.role];
  const partes: string[] = [];
  if (sub) partes.push(`${nodo.subordinadoIds.length} ${sub.toLowerCase()}`);
  partes.push(`${nodo.clientes.length} ${nodo.clientes.length === 1 ? "cliente" : "clientes"}`);
  return partes.join(" · ");
}

function PersonaCard({ nodo, onClick }: { nodo: PersonaNodo; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-center gap-3 rounded-lg border border-ink-150 bg-white p-3 text-left shadow-sm transition hover:border-blue-300 hover:shadow-md"
    >
      <Avatar initials={nodo.initials} role={nodo.role} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[13.5px] font-semibold text-ink-900">{nodo.name}</span>
          <Chip label={nodo.role} tone={tono(nodo.role)} />
        </div>
        <div className="mt-0.5 truncate text-[12px] text-ink-500">
          {nodo.cargo ? `${nodo.cargo} · ` : ""}
          {resumenPersona(nodo)}
        </div>
      </div>
      <Icon name="chev-r" size={16} className="shrink-0 text-ink-300 transition group-hover:text-blue-500" />
    </button>
  );
}

function CuadriculaPersonas({
  ids,
  nodos,
  onEntrar,
}: {
  ids: number[];
  nodos: Record<number, PersonaNodo>;
  onEntrar: (id: number) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {ids.map((id) => {
        const nodo = nodos[id];
        if (!nodo) return null;
        return <PersonaCard key={id} nodo={nodo} onClick={() => onEntrar(id)} />;
      })}
    </div>
  );
}

function ListaClientes({ clientes, derivados }: { clientes: ClienteRef[]; derivados: boolean }) {
  return (
    <Card>
      <CardHeader
        title={`Clientes (${clientes.length})`}
        right={derivados ? <Chip label="Derivados" tone="blue" /> : undefined}
      />
      {clientes.length === 0 ? (
        <EmptyState
          icon="folder"
          title="Sin clientes"
          description={
            derivados
              ? "Sus gerentes aún no tienen clientes asignados."
              : "Esta persona no atiende clientes por ahora."
          }
        />
      ) : (
        <ul className="divide-y divide-ink-100">
          {clientes.map((c) => (
            <li key={c.id} className="flex items-center gap-2 px-4 py-2.5">
              <Icon name="folder" size={14} className="shrink-0 text-ink-400" />
              <span className="font-mono text-[12px] text-ink-500">{c.code}</span>
              <span className="truncate text-[13px] text-ink-800">{c.name}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-2.5 mt-6 text-[12px] font-semibold uppercase tracking-wider text-ink-500">
      {children}
    </h2>
  );
}

export default function EstructuraClient({ arbol }: { arbol: EstructuraArbol }) {
  const { nodos, raices, huerfanos, resumen } = arbol;
  // Ruta de drill-down: ids desde la raíz. [] = vista global de socios.
  const [path, setPath] = useState<number[]>([]);

  const entrar = (id: number) => setPath((p) => [...p, id]);
  const irHasta = (i: number) => setPath((p) => p.slice(0, i + 1));

  const actual = path.length ? nodos[path[path.length - 1]] : null;
  const huboHuerfanos =
    huerfanos.gerentes.length + huerfanos.seniors.length + huerfanos.staff.length > 0;

  return (
    <div>
      <PageHeader
        title="Estructura"
        subtitle="Mapa de la organización: socios, gerentes, seniors, staff y los clientes que atiende cada uno."
      />

      {/* Migas de pan (solo al entrar a una persona). */}
      {path.length > 0 && (
        <nav className="mb-4 flex flex-wrap items-center gap-1 text-[12.5px]">
          <button
            type="button"
            onClick={() => setPath([])}
            className="font-medium text-blue-500 hover:underline"
          >
            Inicio
          </button>
          {path.map((id, i) => {
            const n = nodos[id];
            const esUltimo = i === path.length - 1;
            return (
              <span key={id} className="flex items-center gap-1">
                <Icon name="chev-r" size={12} className="text-ink-300" />
                {esUltimo ? (
                  <span className="font-semibold text-ink-800">{n?.name ?? "—"}</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => irHasta(i)}
                    className="font-medium text-blue-500 hover:underline"
                  >
                    {n?.name ?? "—"}
                  </button>
                )}
              </span>
            );
          })}
        </nav>
      )}

      {actual ? (
        <DetallePersona nodo={actual} nodos={nodos} onEntrar={entrar} />
      ) : (
        <>
          {/* Resumen global */}
          <div className="mb-2 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <StatCard label="Socios" value={String(resumen.socios)} tone="blue" />
            <StatCard label="Gerentes" value={String(resumen.gerentes)} />
            <StatCard label="Seniors" value={String(resumen.seniors)} />
            <StatCard label="Staff" value={String(resumen.staff)} />
            <StatCard label="Clientes" value={String(resumen.clientes)} tone="blue" />
          </div>

          <SectionTitle>Socios</SectionTitle>
          {raices.length === 0 ? (
            <Card>
              <EmptyState
                icon="users"
                title="Sin socios registrados"
                description="Cuando registres socios en Usuarios y los enlaces con sus gerentes, aparecerán aquí."
              />
            </Card>
          ) : (
            <CuadriculaPersonas ids={raices} nodos={nodos} onEntrar={entrar} />
          )}

          {/* Huérfanos: personas sin superior, para no esconderlas del mapa. */}
          {huboHuerfanos && (
            <>
              <SectionTitle>Sin superior asignado</SectionTitle>
              <p className="mb-3 -mt-1 flex items-center gap-1.5 text-[12px] text-warn-700">
                <Icon name="warn" size={13} />
                Estas personas no están enlazadas hacia arriba en la jerarquía (revisa sus superiores en Usuarios).
              </p>
              {huerfanos.gerentes.length > 0 && (
                <div className="mb-3">
                  <div className="mb-1.5 text-[12px] font-medium text-ink-600">Gerentes sin socio</div>
                  <CuadriculaPersonas ids={huerfanos.gerentes} nodos={nodos} onEntrar={entrar} />
                </div>
              )}
              {huerfanos.seniors.length > 0 && (
                <div className="mb-3">
                  <div className="mb-1.5 text-[12px] font-medium text-ink-600">Seniors sin gerente</div>
                  <CuadriculaPersonas ids={huerfanos.seniors} nodos={nodos} onEntrar={entrar} />
                </div>
              )}
              {huerfanos.staff.length > 0 && (
                <div className="mb-3">
                  <div className="mb-1.5 text-[12px] font-medium text-ink-600">Staff sin senior</div>
                  <CuadriculaPersonas ids={huerfanos.staff} nodos={nodos} onEntrar={entrar} />
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

function DetallePersona({
  nodo,
  nodos,
  onEntrar,
}: {
  nodo: PersonaNodo;
  nodos: Record<number, PersonaNodo>;
  onEntrar: (id: number) => void;
}) {
  const subnivel = SUBNIVEL[nodo.role]; // "Gerentes" | "Seniors" | "Staff" | undefined
  const esSocio = nodo.role === "Socio";

  const panelClientes = <ListaClientes clientes={nodo.clientes} derivados={esSocio} />;

  return (
    <>
      {/* Cabecera de la persona */}
      <Card className="mb-5 p-4">
        <div className="flex items-center gap-3">
          <Avatar initials={nodo.initials} role={nodo.role} lg />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="truncate font-serif text-xl text-ink-900">{nodo.name}</h2>
              <Chip label={nodo.role} tone={tono(nodo.role)} />
            </div>
            {nodo.cargo && <p className="mt-0.5 text-[12.5px] text-ink-500">{nodo.cargo}</p>}
            <p className="mt-1 text-[12px] text-ink-500">{resumenPersona(nodo)}</p>
          </div>
        </div>
      </Card>

      {subnivel ? (
        // Tiene nivel inferior: equipo a la izquierda, clientes a la derecha.
        <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
          <div>
            <h3 className="mb-2.5 text-[12px] font-semibold uppercase tracking-wider text-ink-500">
              {subnivel} ({nodo.subordinadoIds.length})
            </h3>
            {nodo.subordinadoIds.length === 0 ? (
              <Card>
                <EmptyState
                  icon="users"
                  title={`Sin ${subnivel.toLowerCase()}`}
                  description={`${nodo.name} aún no tiene ${subnivel.toLowerCase()} a cargo. Enlázalos desde Usuarios.`}
                />
              </Card>
            ) : (
              <CuadriculaPersonas ids={nodo.subordinadoIds} nodos={nodos} onEntrar={onEntrar} />
            )}
          </div>
          <div>{panelClientes}</div>
        </div>
      ) : (
        // Hoja (Staff): los clientes son el contenido principal.
        <div className="max-w-2xl">{panelClientes}</div>
      )}
    </>
  );
}
