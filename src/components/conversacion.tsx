"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Icon } from "@/components/icons";
import { etiquetaEntidad } from "@/lib/comentarios";
import { notifyError, notifySuccess } from "@/lib/client-notifications";
import {
  listarComentarios,
  publicarComentario,
  usuariosMencionables,
  type ComentarioDTO,
  type UsuarioMencionable,
} from "@/app/actions/comentarios";

// Detecta el token "@..." que se está escribiendo antes del cursor.
function mencionActiva(text: string, caret: number): { at: number; query: string } | null {
  const upto = text.slice(0, caret);
  const at = upto.lastIndexOf("@");
  if (at === -1) return null;
  if (at > 0 && !/\s/.test(upto[at - 1])) return null; // debe ir al inicio o tras espacio
  const frag = upto.slice(at + 1);
  if (/\s/.test(frag)) return null; // un solo token (sin espacios)
  return { at, query: frag };
}

export default function Conversacion({
  tipo,
  entityId,
  anchor = null,
  titulo,
  className = "",
}: {
  tipo: string;
  entityId: number;
  anchor?: string | null;
  titulo?: string;
  className?: string;
}) {
  const [comentarios, setComentarios] = useState<ComentarioDTO[]>([]);
  const [puedeComentar, setPuedeComentar] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [text, setText] = useState("");
  const [mentions, setMentions] = useState<Record<number, string>>({});
  const [query, setQuery] = useState<{ at: number; q: string } | null>(null);
  const [enviando, startEnviar] = useTransition();
  const taRef = useRef<HTMLTextAreaElement>(null);
  const finRef = useRef<HTMLDivElement>(null);

  const [mencionables, setMencionables] = useState<UsuarioMencionable[]>([]);

  // Carga inicial de la conversación y de los candidatos a mención.
  useEffect(() => {
    let vivo = true;
    (async () => {
      setCargando(true);
      const res = await listarComentarios(tipo, entityId, anchor);
      if (!vivo) return;
      if (res.ok) {
        setComentarios(res.comentarios);
        setPuedeComentar(res.puedeComentar);
        if (res.puedeComentar) setMencionables(await usuariosMencionables(tipo));
      } else {
        setError(res.message);
        notifyError(res.message);
      }
      setCargando(false);
    })();
    return () => {
      vivo = false;
    };
  }, [tipo, entityId, anchor]);

  // Auto-scroll al último mensaje cuando se AGREGA uno, pero NO en la carga inicial
  // (eso dejaría la página del balance al final; debe abrir en el encabezado).
  const cargaHecha = useRef(false);
  useEffect(() => {
    if (!cargaHecha.current) {
      if (comentarios.length > 0) cargaHecha.current = true; // primera carga con datos: no scrollees
      return;
    }
    finRef.current?.scrollIntoView({ block: "nearest" });
  }, [comentarios.length]);

  const sugerencias = useMemo(() => {
    if (!query) return [];
    const q = query.q.toLowerCase();
    return mencionables.filter((u) => u.name.toLowerCase().includes(q)).slice(0, 6);
  }, [query, mencionables]);

  function onChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const value = e.target.value;
    setText(value);
    const m = mencionActiva(value, e.target.selectionStart ?? value.length);
    setQuery(m ? { at: m.at, q: m.query } : null);
  }

  function elegirMencion(u: UsuarioMencionable) {
    if (!query) return;
    const caret = taRef.current?.selectionStart ?? text.length;
    const nuevo = text.slice(0, query.at) + `@${u.name} ` + text.slice(caret);
    setText(nuevo);
    setMentions((prev) => ({ ...prev, [u.id]: u.name }));
    setQuery(null);
    // Devuelve el foco al textarea tras seleccionar.
    requestAnimationFrame(() => taRef.current?.focus());
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (query && sugerencias.length > 0 && (e.key === "Enter" || e.key === "Tab")) {
      e.preventDefault();
      elegirMencion(sugerencias[0]);
      return;
    }
    if (e.key === "Escape") setQuery(null);
  }

  function enviar() {
    const body = text.trim();
    if (!body || enviando) return;
    // Solo las menciones cuyo token sigue presente en el texto.
    const menciones = Object.entries(mentions)
      .filter(([, name]) => body.includes(`@${name}`))
      .map(([id]) => Number(id));
    setError(null);
    startEnviar(async () => {
      const res = await publicarComentario({ tipo, entityId, anchor, body, menciones });
      if (res.ok) {
        setComentarios((prev) => [...prev, res.comentario]);
        setText("");
        setMentions({});
        setQuery(null);
        notifySuccess("Comentario publicado.");
      } else {
        setError(res.message);
        notifyError(res.message);
      }
    });
  }

  return (
    <div className={`flex flex-col rounded-lg border border-ink-150 bg-white ${className}`}>
      <div className="flex items-center gap-2 border-b border-ink-100 px-4 py-3">
        <Icon name="msg" size={15} />
        <h3 className="text-[13px] font-semibold text-ink-800">
          {titulo ?? `Conversación · ${etiquetaEntidad(tipo)} #${entityId}`}
        </h3>
        {comentarios.length > 0 && (
          <span className="ml-1 rounded-full bg-ink-100 px-2 py-0.5 text-[11px] font-semibold text-ink-600">
            {comentarios.length}
          </span>
        )}
      </div>

      <div className="max-h-[420px] min-h-[120px] flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {cargando ? (
          <p className="text-[12.5px] text-ink-500">Cargando conversación…</p>
        ) : comentarios.length === 0 ? (
          <p className="text-[12.5px] text-ink-500">
            Sin comentarios todavía. {puedeComentar ? "Sé el primero en escribir." : ""}
          </p>
        ) : (
          comentarios.map((c) => <Mensaje key={c.id} c={c} />)
        )}
        <div ref={finRef} />
      </div>

      {error && (
        <div className="mx-4 mb-2 rounded-md bg-err-100 px-3 py-2 text-[12px] font-medium text-err-700">
          {error}
        </div>
      )}

      {puedeComentar ? (
        <div className="relative border-t border-ink-100 p-3">
          {query && sugerencias.length > 0 && (
            <ul className="absolute bottom-full left-3 z-20 mb-1 w-64 overflow-hidden rounded-md border border-ink-200 bg-white shadow-lg">
              {sugerencias.map((u, i) => (
                <li key={u.id}>
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      elegirMencion(u);
                    }}
                    className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12.5px] hover:bg-ink-50 ${
                      i === 0 ? "bg-ink-50" : ""
                    }`}
                  >
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-navy-700 text-[10px] font-semibold text-white">
                      {u.initials}
                    </span>
                    <span className="font-medium text-ink-800">{u.name}</span>
                    <span className="ml-auto text-[11px] text-ink-400">{u.role}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex items-end gap-2">
            <textarea
              ref={taRef}
              value={text}
              onChange={onChange}
              onKeyDown={onKeyDown}
              rows={2}
              placeholder="Escribe un comentario… usa @ para mencionar"
              className="min-h-[40px] flex-1 resize-y rounded-md border border-ink-200 px-3 py-2 text-[12.5px] focus:outline-none focus:ring-2 focus:ring-navy-600"
            />
            <button
              onClick={enviar}
              disabled={!text.trim() || enviando}
              className="inline-flex items-center gap-1.5 rounded-md bg-navy-700 px-3.5 py-2 text-[13px] font-semibold text-white hover:bg-navy-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Icon name="send" size={14} />
              {enviando ? "Enviando…" : "Enviar"}
            </button>
          </div>
        </div>
      ) : (
        <div className="border-t border-ink-100 px-4 py-2.5 text-[12px] text-ink-500">
          No tienes permiso para comentar en este módulo.
        </div>
      )}
    </div>
  );
}

function Mensaje({ c }: { c: ComentarioDTO }) {
  return (
    <div className="flex gap-2.5">
      <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-navy-700 text-[11px] font-semibold text-white">
        {c.authorInitials}
      </span>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[12.5px] font-semibold text-ink-800">{c.authorName}</span>
          {c.isAI && (
            <span className="rounded-full bg-ai-100 px-1.5 py-0.5 text-[10px] font-semibold text-ai-700">IA</span>
          )}
          <span className="text-[11px] text-ink-400">{c.createdAt}</span>
        </div>
        <p className="mt-0.5 whitespace-pre-wrap break-words text-[12.5px] text-ink-700">
          {resaltarMenciones(c.body, c.mentions)}
        </p>
      </div>
    </div>
  );
}

// Resalta los tokens "@Nombre" que correspondan a menciones registradas.
function resaltarMenciones(body: string, mentions: { userId: number; name: string }[]) {
  if (mentions.length === 0) return body;
  const tokens = mentions.map((m) => `@${m.name}`).sort((a, b) => b.length - a.length);
  const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(${tokens.map(escapar).join("|")})`, "g");
  const partes = body.split(re);
  return partes.map((p, i) =>
    tokens.includes(p) ? (
      <span key={i} className="font-semibold text-navy-700">
        {p}
      </span>
    ) : (
      <span key={i}>{p}</span>
    ),
  );
}
