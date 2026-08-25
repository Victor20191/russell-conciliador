"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, BrandMark } from "@/components/icons";
import { Avatar } from "@/components/avatar";
import { EstadoProcesando } from "@/components/estado-procesando";
import { workNav, configNav, type NavChild, type NavItem } from "@/lib/nav";
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
      className="rounded p-1.5 text-[#A9B6C8] transition hover:bg-white/10 hover:text-white disabled:opacity-60"
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
}: {
  user: { name: string; role: string; initials: string; avatarUrl?: string | null } | null;
  permisos: string[];
  modulosVisibles: string[];
  modulosEnDesarrollo: string[];
  /** Última versión publicada de la plataforma (badge bajo la marca). */
  appVersion?: { number: string; title: string | null } | null;
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
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
    (!item.permiso || permset.has(item.permiso)) &&
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
  const visibleConfig = filtrarNav(configNav);

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
          className="fixed inset-0 z-40 bg-navy-900/50 backdrop-blur-sm lg:hidden"
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex h-dvh w-[232px] shrink-0 flex-col border-r border-navy-900 bg-navy-800 text-[#C9D4E2] transition-transform duration-200 lg:sticky lg:top-0 lg:z-auto lg:translate-x-0 ${
          mobileOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full lg:translate-x-0"
        }`}
      >
      {/* Marca + versión de la plataforma */}
      <div className="border-b border-white/10 px-[18px] py-3.5">
        <div className="flex items-center gap-2.5">
          <BrandMark size={28} />
          <div className="min-w-0 flex-1 font-serif text-sm font-medium leading-tight text-white">
            Russell Bedford
            <small className="block font-sans text-[9.5px] font-medium uppercase tracking-[0.18em] text-[#7C8DA3]">
              Conciliador
            </small>
          </div>
          <button
            type="button"
            onClick={onCloseMobile}
            aria-label="Cerrar menú"
            className="rounded p-1 text-[#A9B6C8] transition hover:bg-white/10 hover:text-white lg:hidden"
          >
            <Icon name="x" size={18} />
          </button>
        </div>
        {etiquetaVer && (
          <div className="mt-2.5">
            {puedeVerNovedades ? (
              <Link
                href="/novedades"
                onClick={onCloseMobile}
                title={
                  appVersion?.title
                    ? `${etiquetaVer} · ${appVersion.title}`
                    : `Changelog · ${etiquetaVer}`
                }
                className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-medium tracking-wide text-[#A9B6C8] transition hover:border-white/20 hover:bg-white/10 hover:text-white"
              >
                <span className="h-1 w-1 rounded-full bg-emerald-400/90" aria-hidden />
                {etiquetaVer}
              </Link>
            ) : (
              <span
                title={appVersion?.title ?? undefined}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-medium tracking-wide text-[#A9B6C8]"
              >
                <span className="h-1 w-1 rounded-full bg-emerald-400/90" aria-hidden />
                {etiquetaVer}
              </span>
            )}
          </div>
        )}
      </div>

      <div data-scroll-app className="min-h-0 flex-1 overflow-y-auto pb-2">
        <SectionLabel>Trabajo</SectionLabel>
        <nav className="flex flex-col gap-1 px-2">
          {visibleWork.map((it) => (
            <NavGroupItem
              key={it.href}
              item={it}
              pathname={pathname}
              open={openGroups[it.href] ?? false}
              onToggle={() => toggle(it.href)}
              developmentSet={developmentSet}
            />
          ))}
        </nav>

        <SectionLabel>Configuración</SectionLabel>
        <nav className="flex flex-col gap-1 px-2">
          {visibleConfig.map((it) => (
            <NavGroupItem
              key={it.href}
              item={it}
              pathname={pathname}
              open={openGroups[it.href] ?? false}
              onToggle={() => toggle(it.href)}
              developmentSet={developmentSet}
            />
          ))}
        </nav>
      </div>

      {/* Usuario + logout */}
      <div className="flex items-center gap-2.5 border-t border-white/10 px-[18px] py-3">
        <Link
          href="/perfil"
          onClick={onCloseMobile}
          title="Mi perfil"
          className="flex min-w-0 flex-1 items-center gap-2.5 rounded-md p-1 -m-1 transition hover:bg-white/5"
        >
          <Avatar
            src={user?.avatarUrl}
            initials={user?.initials ?? "··"}
            name={user?.name}
            size={32}
          />
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-[12.5px] font-semibold text-white">
              {user?.name ?? "Usuario"}
            </div>
            <div className="truncate text-[10.5px] text-[#7C8DA3]">
              {user?.role ?? ""}
            </div>
          </div>
        </Link>
        <form action={logout}>
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
}: {
  item: NavItem;
  pathname: string;
  open: boolean;
  onToggle: () => void;
  developmentSet: Set<string>;
}) {
  const active = isGroupActive(pathname, item);
  if (!item.children) {
    return <TopLink item={item} active={active} developmentSet={developmentSet} />;
  }
  const inDevelopment = !!item.modulo && developmentSet.has(item.modulo);
  return (
    <div className="min-w-0">
      <button
        type="button"
        onClick={onToggle}
        className={`flex w-full items-center gap-2.5 rounded px-3 py-2 text-[13px] transition ${
          active ? "bg-white/10 text-white" : "hover:bg-white/5"
        }`}
      >
        <span className="text-current"><Icon name={item.icon} /></span>
        <span className="truncate">{item.label}</span>
        {inDevelopment && <DevBadge />}
        {item.count != null && <Count n={item.count} />}
        <span className="ml-auto opacity-50">
          <Icon name={chevronDivulgacion(open)} size={11} />
        </span>
      </button>
      {open && (
        <div className="mb-2 mt-1.5 ml-3 flex flex-col gap-1 border-l border-white/10 pl-2.5">
          {item.children.map((ch) => {
            const childActive = isChildActive(pathname, ch.href);
            return (
              <Link
                key={ch.href}
                href={ch.href}
                className={`flex items-center gap-2 rounded px-2.5 py-2 text-[12.5px] transition ${
                  childActive
                    ? "bg-white/10 text-white"
                    : "text-[#A9B6C8] hover:bg-white/5"
                }`}
              >
                <span
                  className={`h-1 w-1 rounded-full ${
                    childActive ? "bg-blue-400" : "bg-[#5E7290]"
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
}: {
  item: NavItem;
  active: boolean;
  developmentSet: Set<string>;
}) {
  const inDevelopment = !!item.modulo && developmentSet.has(item.modulo);
  return (
    <Link
      href={item.href}
      className={`flex items-center gap-2.5 rounded px-3 py-2 text-[13px] transition ${
        active ? "bg-white/10 text-white" : "hover:bg-white/5"
      }`}
    >
      <span><Icon name={item.icon} /></span>
      <span className="truncate">{item.label}</span>
      {inDevelopment && <DevBadge />}
      {item.count != null && <Count n={item.count} />}
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
    <span className="ml-auto rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold text-white">
      {n}
    </span>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-3.5 pb-1 pt-3.5 text-[9.5px] font-semibold uppercase tracking-[0.18em] text-[#7C8DA3]">
      {children}
    </div>
  );
}
