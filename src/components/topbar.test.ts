import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import Topbar from "./topbar";

const navigation = vi.hoisted(() => ({ pathname: "/" }));
vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("@/app/actions/notifications", () => ({ markAllNotificationsRead: vi.fn() }));
vi.mock("@/components/action-form", () => ({ ActionForm: () => null }));
vi.stubGlobal("React", React);

function breadcrumbs(pathname: string) {
  navigation.pathname = pathname;
  const html = renderToStaticMarkup(React.createElement(Topbar, { notifications: [] }));
  return html.match(/<nav\b[^>]*>[\s\S]*?<\/nav>/)![0];
}

describe("navegación superior", () => {
  it.each([
    ["/balance/borradores/297eaba6-5fad-4425-8ecc-7d66448cd16b", ["/balance", "/balance/borradores"]],
    ["/balance/245/terceros", ["/balance", "/balance/245"]],
    ["/modulos/1105/borradores/lote", ["/modulos/1105", "/modulos/1105/borradores"]],
    ["/conciliacion/resultados/12", ["/conciliacion/resultados"]],
    ["/config/soporte/12", ["/config/soporte"]],
    ["/config/perfiles-carga/balance", ["/config/perfiles-carga"]],
  ])("enlaza cada página anterior de %s", (pathname, expected) => {
    const html = breadcrumbs(pathname);
    const links = [...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);
    expect(links).toEqual(expected);
    expect(html).toContain('aria-current="page"');
    expect(links).not.toContain(pathname);
  });

  it.each(["/", "/dashboard", "/balance", "/config/clientes"])("no inventa destinos en %s", (pathname) => {
    const html = breadcrumbs(pathname);
    expect(html).not.toContain("href=");
    expect(html).toContain('aria-current="page"');
  });
});
