"use client";

import { useActionState, useEffect, useState } from "react";
import { EnvironmentVariable } from "@/generated/prisma/client";
import { Card, Chip } from "@/components/ui";
import { EstadoProcesando } from "@/components/estado-procesando";
import { notifyActionState } from "@/lib/client-notifications";
import { actualizarVariableEntorno, eliminarVariableEntorno, type ActionState } from "@/app/actions/entorno";
import { fmtDateTime } from "@/lib/format";

export default function EntornoClient({ initialVariables }: { initialVariables: EnvironmentVariable[] }) {
  // Si está vacío, agregamos las comunes por defecto visualmente para que el usuario pueda configurarlas:
  const sugeridas = [
    { key: "ANTHROPIC_API_KEY", category: "IA", isSecret: true, desc: "Clave de acceso para la IA Claude (Balance estructurado)" },
    { key: "GEMINI_API_KEY", category: "IA", isSecret: true, desc: "Clave de acceso para la IA Gemini" },
    { key: "OPENROUTER_API_KEY", category: "IA", isSecret: true, desc: "Clave de acceso para la IA OpenRouter" },
    { key: "SMTP_HOST", category: "EMAIL", isSecret: false, desc: "Servidor SMTP para notificaciones por correo" },
    { key: "SMTP_PORT", category: "EMAIL", isSecret: false, desc: "Puerto SMTP (Ej: 587)" },
    { key: "SMTP_USER", category: "EMAIL", isSecret: false, desc: "Usuario SMTP" },
    { key: "SMTP_PASS", category: "EMAIL", isSecret: true, desc: "Contraseña SMTP" },
    { key: "AWS_ACCESS_KEY_ID", category: "ALMACENAMIENTO", isSecret: true, desc: "Clave de acceso a S3" },
    { key: "AWS_SECRET_ACCESS_KEY", category: "ALMACENAMIENTO", isSecret: true, desc: "Secreto de acceso a S3" },
    { key: "AWS_REGION", category: "ALMACENAMIENTO", isSecret: false, desc: "Región del bucket S3" },
    { key: "S3_BUCKET_NAME", category: "ALMACENAMIENTO", isSecret: false, desc: "Nombre del bucket" },
  ];

  const mapSugeridas = sugeridas.map(s => {
    const existe = initialVariables.find(v => v.key === s.key);
    if (existe) return existe;
    return {
      id: 0,
      key: s.key,
      value: "",
      isSecret: s.isSecret,
      description: s.desc,
      category: s.category,
      updatedAt: new Date(),
      updatedBy: null,
    } as EnvironmentVariable;
  });

  const finales = mapSugeridas;
  const catsFinales = Array.from(new Set(finales.map(v => v.category)));

  const [activeTab, setActiveTab] = useState(catsFinales[0]);

  return (
    <div className="flex flex-col md:flex-row gap-6 md:gap-10 items-start mt-6">
      {/* Pestañas verticales */}
      <div className="w-full md:w-56 shrink-0 flex flex-row md:flex-col gap-1 md:sticky md:top-24 overflow-x-auto pb-2 md:pb-0">
        {catsFinales.map(cat => (
          <button
            key={cat}
            onClick={() => setActiveTab(cat)}
            className={`text-left whitespace-nowrap px-4 py-2.5 rounded-lg text-[13.5px] font-semibold transition-colors ${
              activeTab === cat 
                ? "bg-navy-800 text-white shadow-sm" 
                : "text-ink-600 hover:bg-ink-100 hover:text-navy-900"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Contenido (Tarjetas) */}
      <div className="flex-1 min-w-0 w-full">
        <h2 className="text-[18px] font-bold text-navy-900 mb-6 pb-2 border-b border-ink-100">
          {activeTab}
        </h2>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {finales.filter(v => v.category === activeTab).map(v => (
            <VariableEditor key={v.key} variable={v} />
          ))}
        </div>
      </div>
    </div>
  );
}

function VariableEditor({ variable }: { variable: EnvironmentVariable }) {
  const [guardarState, guardarAction, guardando] = useActionState<ActionState, FormData>(actualizarVariableEntorno, {});
  const [borrarState, borrarAction, borrando] = useActionState<ActionState, FormData>(eliminarVariableEntorno, {});
  
  // value inicial: si es secreto y está configurado, mostramos "********" para no exponer el valor real.
  const isConfigured = variable.id !== 0;
  const initialDisplayValue = variable.isSecret && isConfigured ? "********" : (variable.value || "");
  const [valor, setValor] = useState(initialDisplayValue);
  const [valorPrevio, setValorPrevio] = useState(initialDisplayValue);

  if (initialDisplayValue !== valorPrevio) {
    setValorPrevio(initialDisplayValue);
    setValor(initialDisplayValue);
  }

  useEffect(() => {
    notifyActionState(guardarState, { success: "Configuración guardada.", error: "No se pudo guardar." });
  }, [guardarState]);

  useEffect(() => {
    notifyActionState(borrarState, { success: "Configuración restaurada al valor de sistema.", error: "No se pudo restaurar." });
  }, [borrarState]);

  const sucio = valor !== initialDisplayValue;
  const puedeGuardar = sucio && !guardando;

  return (
    <Card className="flex flex-col h-full p-5">
      <div className="flex-1">
        <h3 className="text-[14px] font-semibold font-mono text-ink-900 truncate" title={variable.key}>{variable.key}</h3>
        <div className="mt-2 mb-3 flex flex-wrap items-center gap-2">
          {isConfigured ? (
            <Chip label="Configurado" tone="ok" />
          ) : (
            <Chip label="No Configurado (Usa .env)" tone="ink" />
          )}
          {variable.isSecret && <Chip label="Secreto" tone="err" />}
        </div>
        <p className="text-[13px] leading-relaxed text-ink-500 mb-4">{variable.description}</p>
      </div>

      <div className="mt-auto pt-4 border-t border-ink-100 flex flex-col gap-3">
        <div className="flex justify-between items-center gap-2">
          <div className="text-[11px] text-ink-400 truncate">
            {isConfigured ? (
              <>Modificado {fmtDateTime(variable.updatedAt)}{variable.updatedBy ? ` · ${variable.updatedBy}` : ""}</>
            ) : (
              "Usando fallback del sistema"
            )}
          </div>
        </div>
        
        <div className="flex flex-col gap-3">
          <input
            type={variable.isSecret && valor === "********" ? "password" : "text"}
            name="value"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            placeholder={`Valor para ${variable.key}`}
            form={`form-guardar-${variable.key}`}
            className="w-full rounded-md border border-ink-200 bg-white px-3 py-1.5 font-mono text-[13px] text-ink-800 outline-none focus:border-blue-400"
          />

          <div className="flex items-center justify-between gap-2 mt-1">
            <form action={guardarAction} id={`form-guardar-${variable.key}`}>
              <input type="hidden" name="key" value={variable.key} />
              <input type="hidden" name="category" value={variable.category} />
              <input type="hidden" name="description" value={variable.description || ""} />
              <input type="hidden" name="isSecret" value={variable.isSecret ? "true" : "false"} />
              <button
                type="submit"
                disabled={!puedeGuardar}
                className="rounded-md bg-navy-700 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-navy-600 disabled:opacity-50 transition-colors"
              >
                {guardando ? <EstadoProcesando>Guardando</EstadoProcesando> : "Guardar"}
              </button>
            </form>

            {isConfigured && (
              <form action={borrarAction}>
                <input type="hidden" name="key" value={variable.key} />
                <button
                  type="submit"
                  disabled={borrando}
                  title="Usar valor de sistema"
                  className="rounded-md border border-err-200 px-3 py-1.5 text-[12px] font-semibold text-err-700 hover:bg-err-50 disabled:opacity-50 transition-colors"
                >
                  {borrando ? <EstadoProcesando>Restaurando</EstadoProcesando> : "Restaurar"}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
