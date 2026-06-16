"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, BrandMark } from "@/components/icons";
import { workNav, configNav, type NavChild, type NavItem } from "@/lib/nav";
import { logout } from "@/app/actions/auth";

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
  mobileOpen = false,
  onCloseMobile,
}: {
  user: { name: string; role: string; initials: string } | null;
  permisos: string[];
  modulosVisibles: string[];
  modulosEnDesarrollo: string[];
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}) {
  const pathname = usePathname();

  // Visibilidad por PERMISO (matriz RBAC), no por jerarquía legado: el menú
  // muestra exactamente lo que la página deja entrar (mismo permiso del guard).
  const permset = new Set(permisos);
  const moduleset = new Set(modulosVisibles);
  const developmentSet = new Set(modulosEnDesarrollo);
  const puedeVer = (item: NavItem | NavChild) =>
    (!item.permiso || permset.has(item.permiso)) &&
    (!item.modulo || moduleset.has(item.modulo));
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
    workNav.forEach((it) => {
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
      workNav.forEach((it) => {
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
      {/* Marca */}
      <div className="flex items-center gap-2.5 border-b border-white/10 px-[18px] py-3.5">
        <BrandMark size={28} />
        <div className="font-serif text-sm font-medium leading-tight text-white">
          Russell Bedford
          <small className="block font-sans text-[9.5px] font-medium uppercase tracking-[0.18em] text-[#7C8DA3]">
            Conciliador
          </small>
        </div>
        <button
          type="button"
          onClick={onCloseMobile}
          aria-label="Cerrar menú"
          className="ml-auto rounded p-1 text-[#A9B6C8] transition hover:bg-white/10 hover:text-white lg:hidden"
        >
          <Icon name="x" size={18} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pb-2">
        <SectionLabel>Trabajo</SectionLabel>
        <nav className="flex flex-col px-2">
          {visibleWork.map((it) => {
            const active = isGroupActive(pathname, it);
            const open = openGroups[it.href] ?? false;
            if (!it.children) {
              return <TopLink key={it.href} item={it} active={active} developmentSet={developmentSet} />;
            }
            const inDevelopment = !!it.modulo && developmentSet.has(it.modulo);
            return (
              <div key={it.href}>
                <button
                  onClick={() => toggle(it.href)}
                  className={`flex w-full items-center gap-2.5 rounded px-3 py-2 text-[13px] transition ${
                    active ? "bg-white/10 text-white" : "hover:bg-white/5"
                  }`}
                >
                  <span className="text-current"><Icon name={it.icon} /></span>
                  <span className="truncate">{it.label}</span>
                  {inDevelopment && <DevBadge />}
                  {it.count != null && <Count n={it.count} />}
                  <span
                    className="ml-auto opacity-50 transition-transform"
                    style={{ transform: open ? "rotate(90deg)" : "none" }}
                  >
                    <Icon name="chev-r" size={11} />
                  </span>
                </button>
                {open && (
                  <div className="mb-1 ml-3 flex flex-col gap-0.5 border-l border-white/10 pl-2">
                    {it.children.map((ch) => {
                      const childActive = isChildActive(pathname, ch.href);
                      return (
                        <Link
                          key={ch.href}
                          href={ch.href}
                          className={`flex items-center gap-2 rounded px-2.5 py-1.5 text-[12.5px] transition ${
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
          })}
        </nav>

        <SectionLabel>Configuración</SectionLabel>
        <nav className="flex flex-col px-2">
          {visibleConfig.map((it) => (
            <TopLink key={it.href} item={it} active={pathname === it.href} developmentSet={developmentSet} />
          ))}
        </nav>
      </div>

      {/* Usuario + logout */}
      <div className="flex items-center gap-2.5 border-t border-white/10 px-[18px] py-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-500 text-[11px] font-semibold text-white">
          {user?.initials ?? "··"}
        </div>
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate text-[12.5px] font-semibold text-white">
            {user?.name ?? "Usuario"}
          </div>
          <div className="truncate text-[10.5px] text-[#7C8DA3]">
            {user?.role ?? ""}
          </div>
        </div>
        <form action={logout}>
          <button
            type="submit"
            title="Cerrar sesión"
            className="rounded p-1.5 text-[#A9B6C8] transition hover:bg-white/10 hover:text-white"
          >
            <Icon name="logout" size={15} />
          </button>
        </form>
      </div>
      </aside>
    </>
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
    <div className="px-3.5 pb-1 pt-3.5 text-[9.5px] font-semibold uppercase tracking-[0.18em] text-[#5E7290]">
      {children}
    </div>
  );
}
