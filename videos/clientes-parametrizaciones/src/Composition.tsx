import {
  AbsoluteFill,
  Easing,
  Sequence,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

export const FPS = 30;

const SCENES = [
  { key: "intro", label: "Propósito", duration: 180 },
  { key: "security", label: "Seguridad", duration: 210 },
  { key: "table", label: "Tabla", duration: 270 },
  { key: "modal", label: "Formulario", duration: 270 },
  { key: "hierarchy", label: "Responsables", duration: 270 },
  { key: "modules", label: "Módulos", duration: 240 },
  { key: "server", label: "Servidor", duration: 240 },
  { key: "closing", label: "Salida", duration: 210 },
] as const;

export const DURATION_IN_FRAMES = SCENES.reduce(
  (total, scene) => total + scene.duration,
  0,
);

export const ClientesParametrizaciones = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  let cursor = 0;

  return (
    <AbsoluteFill className="video-root">
      <Backdrop />
      <TopChrome frame={frame} />
      {SCENES.map((scene) => {
        const from = cursor;
        cursor += scene.duration;
        return (
          <Sequence
            key={scene.key}
            from={from}
            durationInFrames={scene.duration}
            premountFor={fps}
          >
            <SceneRouter sceneKey={scene.key} duration={scene.duration} />
          </Sequence>
        );
      })}
      <ProgressRail frame={frame} />
    </AbsoluteFill>
  );
};

function SceneRouter({
  sceneKey,
  duration,
}: {
  sceneKey: (typeof SCENES)[number]["key"];
  duration: number;
}) {
  if (sceneKey === "intro") return <IntroScene duration={duration} />;
  if (sceneKey === "security") return <SecurityScene duration={duration} />;
  if (sceneKey === "table") return <TableScene duration={duration} />;
  if (sceneKey === "modal") return <ModalScene duration={duration} />;
  if (sceneKey === "hierarchy") return <HierarchyScene duration={duration} />;
  if (sceneKey === "modules") return <ModulesScene duration={duration} />;
  if (sceneKey === "server") return <ServerScene duration={duration} />;
  return <ClosingScene duration={duration} />;
}

function Backdrop() {
  return (
    <AbsoluteFill>
      <div className="mesh mesh-a" />
      <div className="mesh mesh-b" />
      <div className="grid-overlay" />
    </AbsoluteFill>
  );
}

function TopChrome({ frame }: { frame: number }) {
  const opacity = interpolate(frame, [0, 28], [0, 1], {
    easing: Easing.bezier(0.16, 1, 0.3, 1),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div className="top-chrome" style={{ opacity }}>
      <div>
        <div className="product">Russell LFM</div>
        <div className="route">/config/clientes</div>
      </div>
      <div className="chrome-pills">
        <span>Clientes</span>
        <span>Parametrizaciones</span>
        <span>Auditoría</span>
      </div>
    </div>
  );
}

function ProgressRail({ frame }: { frame: number }) {
  let cursor = 0;
  const currentIndex = SCENES.findIndex((scene) => {
    const isCurrent = frame >= cursor && frame < cursor + scene.duration;
    cursor += scene.duration;
    return isCurrent;
  });

  const progress = interpolate(frame, [0, DURATION_IN_FRAMES], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div className="progress-wrap">
      <div className="progress-bar">
        <div className="progress-fill" style={{ width: `${progress * 100}%` }} />
      </div>
      <div className="progress-labels">
        {SCENES.map((scene, index) => (
          <span
            key={scene.key}
            className={index === currentIndex ? "active" : undefined}
          >
            {scene.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function SceneShell({
  eyebrow,
  title,
  subtitle,
  duration,
  children,
  aside,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  duration: number;
  children: React.ReactNode;
  aside?: React.ReactNode;
}) {
  const frame = useCurrentFrame();
  const enter = interpolate(frame, [0, 26], [0, 1], {
    easing: Easing.bezier(0.16, 1, 0.3, 1),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const exit = interpolate(frame, [duration - 22, duration], [1, 0], {
    easing: Easing.in(Easing.cubic),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const move = interpolate(enter, [0, 1], [36, 0]);

  return (
    <div
      className="scene-shell"
      style={{
        opacity: enter * exit,
        transform: `translateY(${move}px)`,
      }}
    >
      <div className="copy-column">
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p className="subtitle">{subtitle}</p>
        {aside}
      </div>
      <div className="visual-column">{children}</div>
    </div>
  );
}

function IntroScene({ duration }: { duration: number }) {
  const frame = useCurrentFrame();
  const chain = ["Cliente", "Responsables", "Módulos activos"];

  return (
    <SceneShell
      eyebrow="Módulo de Clientes y parametrizaciones"
      title="El punto de partida operativo"
      subtitle="Aquí se da de alta el cliente auditado y se define quién ejecuta, quién revisa, quién valida y qué módulos quedan disponibles."
      duration={duration}
      aside={
        <div className="takeaway">
          Sin un cliente parametrizado, balance, conciliación y DIAN no tienen
          una base sobre la cual trabajar.
        </div>
      }
    >
      <div className="flow-board">
        {chain.map((item, index) => {
          const step = interpolate(frame, [index * 18, index * 18 + 22], [0, 1], {
            easing: Easing.bezier(0.16, 1, 0.3, 1),
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          return (
            <div
              className="flow-step"
              key={item}
              style={{
                opacity: step,
                transform: `translateX(${interpolate(step, [0, 1], [26, 0])}px)`,
              }}
            >
              <span className="step-number">{index + 1}</span>
              <span>{item}</span>
            </div>
          );
        })}
        <div className="flow-arrow" />
        <div className="workflows">
          <WorkflowCard title="Balance" status="Habilitado" delay={70} />
          <WorkflowCard title="Conciliación" status="Habilitado" delay={88} />
          <WorkflowCard title="DIAN" status="Habilitado" delay={106} />
        </div>
      </div>
    </SceneShell>
  );
}

function WorkflowCard({
  title,
  status,
  delay,
}: {
  title: string;
  status: string;
  delay: number;
}) {
  const frame = useCurrentFrame();
  const show = interpolate(frame, [delay, delay + 20], [0, 1], {
    easing: Easing.bezier(0.16, 1, 0.3, 1),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div
      className="workflow-card"
      style={{
        opacity: show,
        transform: `scale(${interpolate(show, [0, 1], [0.96, 1])})`,
      }}
    >
      <span>{title}</span>
      <strong>{status}</strong>
    </div>
  );
}

function SecurityScene({ duration }: { duration: number }) {
  return (
    <SceneShell
      eyebrow="Acceso y seguridad"
      title="La ruta y cada escritura validan permisos"
      subtitle="La página exige clientes:configurar. Crear, editar, eliminar y tocar módulos vuelven a validar el permiso específico antes de mutar datos."
      duration={duration}
      aside={
        <BulletStack
          items={[
            "Sin clientes:configurar, el usuario vuelve al dashboard.",
            "Crear valida clientes:crear.",
            "Editar valida clientes:editar.",
            "Eliminar y sincronizar módulos requieren clientes:configurar.",
          ]}
        />
      }
    >
      <div className="security-board">
        <PermissionCard
          title="Entrada a la página"
          permission="requirePermiso('clientes:configurar')"
          tone="blue"
          delay={0}
        />
        <PermissionCard
          title="Mutaciones"
          permission="authorizePermiso por acción"
          tone="amber"
          delay={22}
        />
        <PermissionCard
          title="Auditoría"
          permission="logAudit: CREÓ / ACTUALIZÓ / ELIMINÓ CLIENTE"
          tone="green"
          delay={44}
        />
      </div>
    </SceneShell>
  );
}

function PermissionCard({
  title,
  permission,
  tone,
  delay,
}: {
  title: string;
  permission: string;
  tone: "blue" | "amber" | "green";
  delay: number;
}) {
  const frame = useCurrentFrame();
  const p = interpolate(frame, [delay, delay + 22], [0, 1], {
    easing: Easing.bezier(0.16, 1, 0.3, 1),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div
      className={`permission-card ${tone}`}
      style={{
        opacity: p,
        transform: `translateY(${interpolate(p, [0, 1], [22, 0])}px)`,
      }}
    >
      <div className="lock-mark">LOCK</div>
      <h3>{title}</h3>
      <code>{permission}</code>
    </div>
  );
}

function TableScene({ duration }: { duration: number }) {
  return (
    <SceneShell
      eyebrow="Qué muestra la tabla"
      title="Una vista de control por cliente"
      subtitle="La tarjeta permite buscar por razón social o NIT, filtrar por ERP y sector, y leer el estado de responsables y módulos de un vistazo."
      duration={duration}
      aside={
        <Callout title="Estados de módulo">
          Param. significa configurado; Pendiente queda creado pero falta ajuste;
          N/A indica que el módulo no está activo para ese cliente.
        </Callout>
      }
    >
      <ClientTableMock />
    </SceneShell>
  );
}

function ClientTableMock() {
  const frame = useCurrentFrame();
  const rows = [
    {
      name: "Comercial Andina S.A.S.",
      nit: "900123456-7",
      erp: "Siigo",
      sector: "Retail",
      people: "Gr Laura · Sr Mateo · St Ana",
      modules: ["configured", "pending", "none"],
    },
    {
      name: "Servicios Norte Ltda.",
      nit: "830778812-1",
      erp: "SAP",
      sector: "Servicios",
      people: "Sin asignar",
      modules: ["pending", "none", "none"],
    },
    {
      name: "Industria Pacífico",
      nit: "901445230-3",
      erp: "Dynamics",
      sector: "Manufactura",
      people: "Gr Paula · Sr Iván · St Sara",
      modules: ["configured", "configured", "pending"],
    },
  ];

  const highlight = interpolate(frame, [90, 126, 174, 210], [0, 1, 1, 0], {
    easing: Easing.bezier(0.16, 1, 0.3, 1),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div className="table-card">
      <div className="toolbar">
        <div className="search-box">Buscar cliente o NIT...</div>
        <div className="select-box">Todos los ERPs</div>
        <div className="select-box">Todos los sectores</div>
        <button>Nuevo cliente</button>
      </div>
      <div className="table-head table-grid">
        <span>Cliente</span>
        <span>NIT</span>
        <span>ERP</span>
        <span>Sector</span>
        <span>Responsables</span>
        <span>Balance</span>
        <span>Conc.</span>
        <span>DIAN</span>
      </div>
      {rows.map((row, index) => (
        <div className="table-row table-grid" key={row.nit}>
          <strong>{row.name}</strong>
          <span className="mono">{row.nit}</span>
          <span>{row.erp}</span>
          <span>{row.sector}</span>
          <span>
            {row.people === "Sin asignar" ? (
              <span className="warning-chip">Sin asignar</span>
            ) : (
              row.people
            )}
          </span>
          {row.modules.map((status, moduleIndex) => (
            <ModuleChip
              key={`${row.nit}-${moduleIndex}`}
              status={status as "configured" | "pending" | "none"}
            />
          ))}
          {index === 1 && (
            <div
              className="row-highlight"
              style={{ opacity: highlight }}
            />
          )}
        </div>
      ))}
    </div>
  );
}

function ModalScene({ duration }: { duration: number }) {
  return (
    <SceneShell
      eyebrow="Crear o editar cliente"
      title="El modal concentra el formulario largo"
      subtitle="El código se ve, pero no se edita. El cuerpo del modal hace scroll y el footer conserva Guardar y Eliminar siempre visibles."
      duration={duration}
      aside={
        <BulletStack
          items={[
            "Código C-1042 asignado en servidor.",
            "Razón social, NIT, ERP y sector.",
            "Responsables en cascada.",
            "Casillas para activar módulos del cliente.",
          ]}
        />
      }
    >
      <ModalMock />
    </SceneShell>
  );
}

function ModalMock() {
  const frame = useCurrentFrame();
  const scroll = interpolate(frame, [74, 150], [0, -162], {
    easing: Easing.bezier(0.45, 0, 0.55, 1),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const footerPulse = interpolate(frame, [152, 178, 204], [0, 1, 0], {
    easing: Easing.bezier(0.34, 1.56, 0.64, 1),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div className="modal-stage">
      <div className="modal-window">
        <div className="modal-header">
          <strong>Nuevo cliente</strong>
          <span>x</span>
        </div>
        <div className="modal-body">
          <div className="modal-content" style={{ transform: `translateY(${scroll}px)` }}>
            <Field label="Código" value="C-1042" disabled />
            <Field label="Razón social" value="Comercial Andina S.A.S." />
            <Field label="NIT" value="900123456-7" />
            <div className="field-row">
              <Field label="ERP" value="Siigo" />
              <Field label="Sector" value="Retail" />
            </div>
            <div className="panel">
              <h3>Responsables de la auditoría</h3>
              <p>Staff ejecuta · Senior revisa · Gerente valida</p>
              <Field label="Gerente (valida)" value="Laura Gómez" />
              <Field label="Senior (revisa)" value="Mateo Rojas" />
              <Field label="Staff (ejecuta)" value="Ana Vega" />
            </div>
            <div className="panel">
              <h3>Módulos del cliente</h3>
              <div className="module-grid">
                <CheckItem label="Balance" checked />
                <CheckItem label="Conciliación" checked />
                <CheckItem label="DIAN" />
                <CheckItem label="Reportes" />
              </div>
            </div>
          </div>
        </div>
        <div
          className="modal-footer"
          style={{
            boxShadow: `0 0 ${20 + footerPulse * 22}px rgba(22, 101, 52, ${0.14 + footerPulse * 0.16})`,
          }}
        >
          <button className="delete">Eliminar</button>
          <button className="save">Guardar</button>
        </div>
      </div>
      <div className="fixed-footer-note">
        Footer fijo: Guardar no desaparece mientras el cuerpo hace scroll.
      </div>
    </div>
  );
}

function HierarchyScene({ duration }: { duration: number }) {
  return (
    <SceneShell
      eyebrow="Responsables en cascada"
      title="La jerarquía filtra y el servidor revalida"
      subtitle="El gerente acota seniors, el senior acota staff. Deben ser personas distintas, activas y con el rol exacto de su función."
      duration={duration}
      aside={
        <Callout title="Asignación final">
          Staff queda con writeScope. Senior y Gerente tienen lectura. El Socio
          no se asigna: su acceso se deriva por jerarquía.
        </Callout>
      }
    >
      <HierarchyChart />
    </SceneShell>
  );
}

function HierarchyChart() {
  const frame = useCurrentFrame();
  const nodes = [
    { title: "Gerente", subtitle: "Valida", x: 48, y: 28, delay: 0 },
    { title: "Senior", subtitle: "Revisa", x: 48, y: 48, delay: 28 },
    { title: "Staff", subtitle: "Ejecuta y escribe", x: 48, y: 68, delay: 56 },
  ];

  return (
    <div className="hierarchy-board">
      <div className="hierarchy-line" />
      {nodes.map((node) => {
        const show = interpolate(frame, [node.delay, node.delay + 24], [0, 1], {
          easing: Easing.bezier(0.16, 1, 0.3, 1),
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        return (
          <div
            className="hierarchy-node"
            key={node.title}
            style={{
              left: `${node.x}%`,
              top: `${node.y}%`,
              opacity: show,
              transform: `translate(-50%, -50%) scale(${interpolate(show, [0, 1], [0.92, 1])})`,
            }}
          >
            <strong>{node.title}</strong>
            <span>{node.subtitle}</span>
          </div>
        );
      })}
      <div className="validation-panel">
        <h3>Validaciones</h3>
        <ul>
          <li>Activos</li>
          <li>Roles exactos</li>
          <li>Personas distintas</li>
          <li>UserHierarchy consistente</li>
        </ul>
      </div>
    </div>
  );
}

function ModulesScene({ duration }: { duration: number }) {
  return (
    <SceneShell
      eyebrow="Módulos y eliminación"
      title="Activar un módulo crea parametrización pendiente"
      subtitle="Al guardar, la acción sincroniza las casillas. Los módulos nuevos entran como pending; desmarcar elimina la relación del cliente con ese módulo."
      duration={duration}
      aside={
        <BulletStack
          items={[
            "Editar módulos exige clientes:configurar.",
            "La eliminación corre en transacción.",
            "Se limpian asignaciones manualmente por FK suave.",
            "Si hay datos vinculados, la FK bloquea y sube al error boundary.",
          ]}
        />
      }
    >
      <ModulesBoard />
    </SceneShell>
  );
}

function ModulesBoard() {
  const frame = useCurrentFrame();
  const sync = interpolate(frame, [80, 132], [0, 1], {
    easing: Easing.bezier(0.16, 1, 0.3, 1),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div className="modules-board">
      <div className="checkbox-panel">
        <h3>Módulos del cliente</h3>
        <CheckItem label="Balance" checked />
        <CheckItem label="Conciliación" checked />
        <CheckItem label="DIAN" checked={sync > 0.5} />
        <CheckItem label="Reportes" />
      </div>
      <div className="sync-arrow" style={{ transform: `scaleX(${sync})` }} />
      <div className="database-panel">
        <h3>clientModule</h3>
        <div className="db-row">Balance <ModuleChip status="configured" /></div>
        <div className="db-row">Conciliación <ModuleChip status="pending" /></div>
        <div className="db-row">DIAN <ModuleChip status={sync > 0.5 ? "pending" : "none"} /></div>
      </div>
    </div>
  );
}

function ServerScene({ duration }: { duration: number }) {
  return (
    <SceneShell
      eyebrow="Datos que carga el servidor"
      title="page.tsx arma todo antes de entregar la UI"
      subtitle="La página lee en paralelo el catálogo y las relaciones necesarias para pintar filas, filtros, candidatos y responsables actuales."
      duration={duration}
      aside={
        <Callout title="Salida para la UI">
          ClientRow, ModuleRef, Personas, Aristas, ERPs, sectores y nextCode.
        </Callout>
      }
    >
      <ServerBoard />
    </SceneShell>
  );
}

function ServerBoard() {
  const queries = [
    "clientes + módulos",
    "catálogo de módulos",
    "usuarios activos por rol",
    "aristas de jerarquía",
    "asignaciones activas",
  ];

  return (
    <div className="server-board">
      <div className="promise-title">Promise.all</div>
      {queries.map((query, index) => (
        <LoadLine key={query} label={query} delay={index * 16} />
      ))}
      <div className="audit-strip">
        logAudit: CREÓ CLIENTE · ACTUALIZÓ CLIENTE · ELIMINÓ CLIENTE
      </div>
    </div>
  );
}

function LoadLine({ label, delay }: { label: string; delay: number }) {
  const frame = useCurrentFrame();
  const fill = interpolate(frame, [delay, delay + 42], [0, 1], {
    easing: Easing.bezier(0.16, 1, 0.3, 1),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div className="load-line">
      <span>{label}</span>
      <div className="load-track">
        <div className="load-fill" style={{ width: `${fill * 100}%` }} />
      </div>
    </div>
  );
}

function ClosingScene({ duration }: { duration: number }) {
  return (
    <SceneShell
      eyebrow="Resumen operativo"
      title="Cliente parametrizado, flujos listos"
      subtitle="La ruta no solo crea registros: deja definida la seguridad, la responsabilidad de auditoría, los módulos activos y la trazabilidad del cambio."
      duration={duration}
      aside={
        <div className="takeaway strong">
          Cliente + responsables + módulos + auditoría = base controlada para
          ejecutar los demás procesos.
        </div>
      }
    >
      <div className="closing-board">
        <ChecklistItem label="Alta del cliente con código automático" delay={0} />
        <ChecklistItem label="Responsables validados por jerarquía" delay={22} />
        <ChecklistItem label="Módulos sincronizados como pending" delay={44} />
        <ChecklistItem label="Mutaciones registradas en auditoría" delay={66} />
      </div>
    </SceneShell>
  );
}

function ChecklistItem({ label, delay }: { label: string; delay: number }) {
  const frame = useCurrentFrame();
  const show = interpolate(frame, [delay, delay + 20], [0, 1], {
    easing: Easing.bezier(0.16, 1, 0.3, 1),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div
      className="checklist-item"
      style={{
        opacity: show,
        transform: `translateX(${interpolate(show, [0, 1], [28, 0])}px)`,
      }}
    >
      <span>OK</span>
      <strong>{label}</strong>
    </div>
  );
}

function BulletStack({ items }: { items: string[] }) {
  const frame = useCurrentFrame();
  return (
    <div className="bullet-stack">
      {items.map((item, index) => {
        const show = interpolate(frame, [index * 12, index * 12 + 18], [0, 1], {
          easing: Easing.bezier(0.16, 1, 0.3, 1),
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        return (
          <div
            key={item}
            className="bullet"
            style={{
              opacity: show,
              transform: `translateX(${interpolate(show, [0, 1], [-18, 0])}px)`,
            }}
          >
            <span />
            <p>{item}</p>
          </div>
        );
      })}
    </div>
  );
}

function Callout({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="callout">
      <strong>{title}</strong>
      <p>{children}</p>
    </div>
  );
}

function ModuleChip({ status }: { status: "configured" | "pending" | "none" }) {
  if (status === "configured") return <span className="chip ok">Param.</span>;
  if (status === "pending") return <span className="chip warn">Pendiente</span>;
  return <span className="chip muted">N/A</span>;
}

function Field({
  label,
  value,
  disabled,
}: {
  label: string;
  value: string;
  disabled?: boolean;
}) {
  return (
    <div className="field">
      <span>{label}</span>
      <div className={disabled ? "input disabled" : "input"}>{value}</div>
    </div>
  );
}

function CheckItem({
  label,
  checked,
}: {
  label: string;
  checked?: boolean;
}) {
  return (
    <div className={checked ? "check-item selected" : "check-item"}>
      <span>{checked ? "✓" : ""}</span>
      <strong>{label}</strong>
    </div>
  );
}
