"use client";

import { Fragment, useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/icons";
import { LogoRussellBedford } from "@/components/marca";
import { Avatar } from "@/components/avatar";
import { EstadoProcesando } from "@/components/estado-procesando";
import { workNav, configNav, configSecciones, type NavChild, type NavItem } from "@/lib/nav";
import { etiquetaVersion } from "@/lib/version-app";
import { chevronDivulgacion } from "@/lib/ui/chevron-divulgacion";
import { logout } from "@/app/actions/auth";

function BotonCerrarSesion() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      title="Cerrar sesión"
      aria-busy={pending}
      disabled={pending}
      className="sidebar-logout inline-flex h-8 w-8 shrink-0 items-center justify-center rounded text-navy-300 transition enabled:hover:bg-navy-600 enabled:hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy-300"
    >
      {pending ? (
        <EstadoProcesando etiqueta="Cerrando sesión" />
      ) : (
        <Icon name="logout" size={15} />
      )}
    </button>
  );
}

function isChildActive(pathname: string, href: string) {
  return pathname === href;
}

function isGroupActive(pathname: string, item: NavItem) {
  if (!item.children) return pathname === item.href;
  return (
    item.children.some((c) => pathname === c.href) ||
    (item.href !== "/dashboard" && pathname.startsWith(item.href + "/")) ||
    pathname === item.href
  );
}

export default function Sidebar({
  user,
  permisos,
  modulosVisibles,
  modulosEnDesarrollo,
  appVersion = null,
  mobileOpen = false,
  onCloseMobile,
  desktopCollapsed = false,
  onExpandDesktop,
  onDesktopHoverChange,
}: {
  user: { name: string; role: string; initials: string; avatarUrl?: string | null } | null;
  permisos: string[];
  modulosVisibles: string[];
  modulosEnDesarrollo: string[];
  /** Última versión publicada de la plataforma (badge bajo la marca). */
  appVersion?: { number: string; title: string | null } | null;
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
  /** Colapso VISUAL efectivo (fijado por el usuario y no expandido por hover). */
  desktopCollapsed?: boolean;
  onExpandDesktop?: () => void;
  /** Notifica al contenedor que el mouse entró/salió del sidebar en escritorio. */
  onDesktopHoverChange?: (hovering: boolean) => void;
}) {
  const pathname = usePathname();

  // Visibilidad por PERMISO (matriz RBAC), no por jerarquía legado: el menú
  // muestra exactamente lo que la página deja entrar (mismo permiso del guard).
  const permset = new Set(permisos);
  const puedeVerNovedades = permset.has("novedades:ver");
  const etiquetaVer = appVersion?.number ? etiquetaVersion(appVersion.number) || null : null;
  const moduleset = new Set(modulosVisibles);
  const developmentSet = new Set(modulosEnDesarrollo);
  const puedeVer = (item: NavItem | NavChild) =>
    (!item.permiso
      || permset.has(item.permiso)
      || ("permisoAlterno" in item && item.permisoAlterno != null && permset.has(item.permisoAlterno))) &&
    (!item.modulo || moduleset.has(item.modulo)) &&
    (!item.roles || (user != null && item.roles.includes(user.role)));
  const filtrarNav = (items: NavItem[]) =>
    items.flatMap((it) => {
      const children = it.children?.filter(puedeVer);
      if (it.children) {
        if (children?.length) return [{ ...it, children }];
        return puedeVer(it) ? [{ ...it, children: undefined }] : [];
      }
      return puedeVer(it) ? [it] : [];
    });
  const visibleWork = filtrarNav(workNav);
  // Una sección sin entradas visibles para el usuario no muestra ni su rótulo.
  const seccionesVisibles = configSecciones
    .map((s) => ({ titulo: s.titulo, items: filtrarNav(s.items) }))
    .filter((s) => s.items.length > 0);

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    [...workNav, ...configNav].forEach((it) => {
      if (it.children && isGroupActive(pathname, it)) init[it.href] = true;
    });
    return init;
  });

  const toggle = (href: string) =>
    setOpenGroups((o) => ({ ...o, [href]: !o[href] }));

  // Auto-expandir el grupo activo al navegar (sin colapsar lo que el usuario abrió),
  // ajustando el estado durante el render cuando cambia la ruta — patrón recomendado
  // por React en vez de un efecto con setState.
  const [prevPath, setPrevPath] = useState(pathname);
  if (pathname !== prevPath) {
    setPrevPath(pathname);
    setOpenGroups((prev) => {
      const next = { ...prev };
      [...workNav, ...configNav].forEach((it) => {
        if (it.children && isGroupActive(pathname, it)) next[it.href] = true;
      });
      return next;
    });
  }

  return (
    <>
      {/* Overlay: cierra el drawer al tocar fuera (solo en pantallas angostas) */}
      {mobileOpen && (
        <button
          type="button"
          aria-label="Cerrar menú"
          onClick={onCloseMobile}
          className="fixed inset-0 z-40 bg-navy-900/40 lg:hidden"
        />
      )}
      <aside
        id="app-sidebar"
        data-collapsed={desktopCollapsed}
        onClickCapture={(event) => {
          if (!desktopCollapsed || !onExpandDesktop || !window.matchMedia("(min-width: 1024px)").matches) return;
          // El primer clic abre el menú; la opción se elige con el menú visible.
          event.preventDefault();
          event.stopPropagation();
          onExpandDesktop();
        }}
        onMouseEnter={() => {
          // Solo importa en escritorio: en el drawer móvil no hay hover real.
          if (!window.matchMedia("(min-width: 1024px)").matches) return;
          onDesktopHoverChange?.(true);
        }}
        onMouseLeave={() => onDesktopHoverChange?.(false)}
        className={`sidebar-motion fixed inset-y-0 left-0 z-50 flex h-dvh w-[232px] shrink-0 flex-col overflow-hidden border-r border-navy-900 bg-navy-800 text-navy-100 transition-[transform,width] duration-200 lg:sticky lg:top-0 lg:z-auto lg:translate-x-0 ${
          mobileOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full lg:translate-x-0"
        } ${desktopCollapsed ? "lg:w-14 lg:cursor-pointer" : "lg:w-[232px]"}`}
      >
      {/* Marca + versión de la plataforma. El logotipo blanco sobre el azul
          institucional (§1.2) con su espacio libre (padding del componente, 20 %
          del ancho). Con el menú contraído no cabe a su ancho mínimo de 30 mm y
          el isotipo no puede hacer de logo (§4.1): la marca se oculta. */}
      <div className={`border-b border-navy-600 ${desktopCollapsed ? "lg:hidden" : ""}`}>
        <div className="flex items-start justify-between">
          <LogoRussellBedford variante="blanco" ancho={130} prioridad className="sidebar-reveal" />
          <button
            type="button"
            onClick={onCloseMobile}
            aria-label="Cerrar menú"
            className="mt-3 mr-3 rounded p-1 text-navy-300 transition hover:bg-navy-600 hover:text-white lg:hidden"
          >
            <Icon name="x" size={18} />
          </button>
        </div>
        {etiquetaVer && (
          <div className="sidebar-reveal px-[26px] pb-3.5">
            {puedeVerNovedades ? (
              <Link
                href="/novedades"
                onClick={onCloseMobile}
                title={
                  appVersion?.title
                    ? `${etiquetaVer} · ${appVersion.title}`
                    : `Changelog · ${etiquetaVer}`
                }
                className="inline-flex items-center gap-1.5 rounded-full border border-navy-600 px-2 py-0.5 text-[10px] font-medium tracking-wide text-navy-200 transition hover:bg-navy-600 hover:text-white"
              >
                <span className="h-1 w-1 rounded-full bg-ok-500" aria-hidden />
                Conciliador · {etiquetaVer}
              </Link>
            ) : (
              <span
                title={appVersion?.title ?? undefined}
                className="inline-flex items-center gap-1.5 rounded-full border border-navy-600 px-2 py-0.5 text-[10px] font-medium tracking-wide text-navy-200"
              >
                <span className="h-1 w-1 rounded-full bg-ok-500" aria-hidden />
                Conciliador · {etiquetaVer}
              </span>
            )}
          </div>
        )}
      </div>

      <div data-scroll-app className={`min-h-0 flex-1 overflow-y-auto pb-2 [color-scheme:dark] [scrollbar-color:var(--color-navy-500)_var(--color-navy-800)] ${desktopCollapsed ? "sidebar-scroll-collapsed lg:pt-2" : ""}`}>
        <SectionLabel collapsed={desktopCollapsed}>Trabajo</SectionLabel>
        <nav className="flex flex-col gap-1 px-2">
          {visibleWork.map((it) => (
            <NavGroupItem
              key={it.href}
              item={it}
              pathname={pathname}
              open={openGroups[it.href] ?? false}
              onToggle={() => toggle(it.href)}
              developmentSet={developmentSet}
              desktopCollapsed={desktopCollapsed}
            />
          ))}
        </nav>

        {seccionesVisibles.map((s) => (
          <Fragment key={s.titulo}>
            <SectionLabel collapsed={desktopCollapsed}>{s.titulo}</SectionLabel>
            <nav className="flex flex-col gap-1 px-2">
              {s.items.map((it) => (
                <NavGroupItem
                  key={it.href}
                  item={it}
                  pathname={pathname}
                  open={openGroups[it.href] ?? false}
                  onToggle={() => toggle(it.href)}
                  developmentSet={developmentSet}
                  desktopCollapsed={desktopCollapsed}
                />
              ))}
            </nav>
          </Fragment>
        ))}
      </div>

      {/* Usuario + logout */}
      <div className={`flex items-center gap-2.5 border-t border-navy-600 px-[18px] py-3 ${desktopCollapsed ? "lg:justify-center lg:gap-0 lg:px-2 lg:pb-9" : "lg:pr-8"}`}>
        <Link
          href="/perfil"
          onClick={onCloseMobile}
          title="Mi perfil"
          className={`flex min-w-0 flex-1 items-center gap-2.5 rounded-md p-1 -m-1 transition hover:bg-navy-600 ${desktopCollapsed ? "lg:m-0 lg:justify-center lg:gap-0 lg:p-0" : ""}`}
        >
          <Avatar
            src={user?.avatarUrl}
            initials={user?.initials ?? "··"}
            name={user?.name}
            size={32}
          />
          <div className={`sidebar-reveal min-w-0 flex-1 leading-tight ${desktopCollapsed ? "lg:hidden" : ""}`}>
            <div className="truncate text-[12.5px] font-semibold text-white">
              {user?.name ?? "Usuario"}
            </div>
            <div className="truncate text-[10.5px] text-navy-300">
              {user?.role ?? ""}
            </div>
          </div>
        </Link>
        <form action={logout} className={`sidebar-reveal ${desktopCollapsed ? "lg:hidden" : ""}`}>
          <BotonCerrarSesion />
        </form>
      </div>
      </aside>
    </>
  );
}

function NavGroupItem({
  item,
  pathname,
  open,
  onToggle,
  developmentSet,
  desktopCollapsed,
}: {
  item: NavItem;
  pathname: string;
  open: boolean;
  onToggle: () => void;
  developmentSet: Set<string>;
  desktopCollapsed: boolean;
}) {
  const active = isGroupActive(pathname, item);
  if (!item.children) {
    return <TopLink item={item} active={active} developmentSet={developmentSet} desktopCollapsed={desktopCollapsed} />;
  }
  const inDevelopment = !!item.modulo && developmentSet.has(item.modulo);
  return (
    <div className="min-w-0">
      {desktopCollapsed && (
        <Link
          href={item.href}
          title={item.label}
          aria-label={item.label}
          className={`mx-auto hidden h-9 w-9 items-center justify-center rounded-md transition lg:flex lg:[&_svg]:size-4 ${
            active ? "bg-navy-600 text-white shadow-[inset_3px_0_0_0_var(--color-sky-blue)]" : "hover:bg-navy-600 hover:text-white"
          }`}
        >
          <span className="shrink-0 text-current"><Icon name={item.icon} /></span>
        </Link>
      )}
      <button
        type="button"
        onClick={onToggle}
        title={item.label}
        aria-expanded={open}
        className={`flex w-full items-center gap-2.5 rounded px-3 py-2 text-[13px] transition ${desktopCollapsed ? "lg:hidden" : ""} ${
          active ? "bg-navy-600 text-white shadow-[inset_3px_0_0_0_var(--color-sky-blue)]" : "hover:bg-navy-600 hover:text-white"
        }`}
      >
        <span className="shrink-0 text-current"><Icon name={item.icon} /></span>
        <span className="sidebar-reveal truncate">{item.label}</span>
        {inDevelopment && <DevBadge />}
        {item.count != null && <Count n={item.count} />}
        <span className="sidebar-reveal ml-auto text-navy-300">
          <Icon name={chevronDivulgacion(open)} size={11} />
        </span>
      </button>
      {open && (
        <div className={`sidebar-reveal mb-2 mt-1.5 ml-3 flex flex-col gap-1 border-l border-navy-600 pl-2.5 ${desktopCollapsed ? "lg:hidden" : ""}`}>
          {item.children.map((ch) => {
            const childActive = isChildActive(pathname, ch.href);
            return (
              <Link
                key={ch.href}
                href={ch.href}
                className={`flex items-center gap-2 rounded px-2.5 py-2 text-[12.5px] transition ${
                  childActive
                    ? "bg-navy-600 text-white shadow-[inset_3px_0_0_0_var(--color-sky-blue)]"
                    : "text-navy-300 hover:bg-navy-600 hover:text-white"
                }`}
              >
                <span
                  className={`h-1 w-1 rounded-full ${
                    childActive ? "bg-blue-400" : "bg-navy-500"
                  }`}
                />
                <span className="truncate">{ch.label}</span>
                {ch.modulo && developmentSet.has(ch.modulo) && <DevBadge />}
                {ch.count != null && <Count n={ch.count} />}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TopLink({
  item,
  active,
  developmentSet,
  desktopCollapsed,
}: {
  item: NavItem;
  active: boolean;
  developmentSet: Set<string>;
  desktopCollapsed: boolean;
}) {
  const inDevelopment = !!item.modulo && developmentSet.has(item.modulo);
  return (
    <Link
      href={item.href}
      title={item.label}
      aria-label={desktopCollapsed ? item.label : undefined}
      className={`flex items-center gap-2.5 rounded px-3 py-2 text-[13px] transition ${desktopCollapsed ? "lg:h-9 lg:w-9 lg:self-center lg:justify-center lg:gap-0 lg:rounded-md lg:p-0 lg:[&_svg]:size-4" : ""} ${
        active ? "bg-navy-600 text-white shadow-[inset_3px_0_0_0_var(--color-sky-blue)]" : "hover:bg-navy-600 hover:text-white"
      }`}
    >
      <span className="shrink-0"><Icon name={item.icon} /></span>
      <span className={`sidebar-reveal truncate ${desktopCollapsed ? "lg:sr-only" : ""}`}>{item.label}</span>
      <span className={desktopCollapsed ? "lg:hidden" : "contents"}>
        {inDevelopment && <DevBadge />}
        {item.count != null && <Count n={item.count} />}
      </span>
    </Link>
  );
}

function DevBadge() {
  return (
    <span className="shrink-0 rounded-full bg-warn-100 px-1.5 py-0.5 text-[9.5px] font-semibold text-warn-700">
      Dev
    </span>
  );
}

function Count({ n }: { n: number }) {
  return (
    <span className="ml-auto rounded-full bg-navy-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
      {n}
    </span>
  );
}

function SectionLabel({ children, collapsed }: { children: React.ReactNode; collapsed: boolean }) {
  return (
    <div className={`sidebar-reveal whitespace-nowrap px-3.5 pb-1 pt-3.5 text-[9.5px] font-semibold uppercase tracking-[0.18em] text-navy-300 ${collapsed ? "lg:sr-only" : ""}`}>
      {children}
    </div>
  );
}
