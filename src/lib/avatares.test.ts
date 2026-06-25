import { test, expect, describe } from "vitest";
import {
  extensionDeNombre,
  pareceImagen,
  detectarTipoImagen,
  validarImagen,
  keyAvatar,
  urlAvatar,
  emparejarFotosPorCedula,
  AVATAR_MAX_BYTES,
} from "./avatares";

const JPG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const WEBP = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, // RIFF
  0x00, 0x00, 0x00, 0x00, // size
  0x57, 0x45, 0x42, 0x50, // WEBP
]);

describe("extensión y tipo de imagen", () => {
  test("extensionDeNombre ignora rutas del zip y mayúsculas", () => {
    expect(extensionDeNombre("fotos/52123456.JPG")).toBe("jpg");
    expect(extensionDeNombre("sin_extension")).toBe("");
  });

  test("pareceImagen reconoce extensiones admitidas", () => {
    expect(pareceImagen("a.png")).toBe(true);
    expect(pareceImagen("a.webp")).toBe(true);
    expect(pareceImagen("a.gif")).toBe(false);
    expect(pareceImagen("notas.txt")).toBe(false);
  });

  test("detectarTipoImagen identifica por magic bytes", () => {
    expect(detectarTipoImagen(JPG)).toBe("jpg");
    expect(detectarTipoImagen(PNG)).toBe("png");
    expect(detectarTipoImagen(WEBP)).toBe("webp");
    expect(detectarTipoImagen(new Uint8Array([0x00, 0x01, 0x02, 0x03]))).toBe(null);
  });
});

describe("validarImagen", () => {
  test("acepta una imagen válida y devuelve su content-type", () => {
    const r = validarImagen(PNG);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.contentType).toBe("image/png");
  });

  test("rechaza archivo vacío", () => {
    const r = validarImagen(new Uint8Array([]));
    expect(r.ok).toBe(false);
  });

  test("rechaza un archivo que no es imagen (aunque la extensión mienta)", () => {
    const r = validarImagen(new Uint8Array([0x25, 0x50, 0x44, 0x46])); // %PDF
    expect(r.ok).toBe(false);
  });

  test("rechaza imágenes que superan el máximo", () => {
    const grande = new Uint8Array(AVATAR_MAX_BYTES + 10);
    grande.set(JPG, 0);
    const r = validarImagen(grande);
    expect(r.ok).toBe(false);
  });
});

describe("keyAvatar y urlAvatar", () => {
  test("keyAvatar incluye id y extensión real", () => {
    expect(keyAvatar(42, "png")).toBe("avatares/usuario-42.png");
  });

  test("urlAvatar es null sin foto y trae cache-busting con foto", () => {
    expect(urlAvatar({ id: 7, avatarKey: null })).toBe(null);
    const url = urlAvatar({ id: 7, avatarKey: "avatares/usuario-7.jpg", updatedAt: new Date("2026-06-25T00:00:00Z") });
    expect(url).toMatch(/^\/api\/usuarios\/7\/foto\?v=\d+$/);
  });
});

describe("emparejarFotosPorCedula", () => {
  const usuarios = [
    { id: 1, cedula: "52.123.456", name: "Ana" }, // con separadores
    { id: 2, cedula: "1098765432", name: "Beto" },
    { id: 3, cedula: null, name: "Sin cédula" },
  ];

  test("empareja por cédula normalizada (con o sin separadores)", () => {
    const r = emparejarFotosPorCedula(["52123456.jpg", "1.098.765.432.png"], usuarios);
    expect(r.emparejados).toEqual([
      { userId: 1, nombreArchivo: "52123456.jpg", name: "Ana" },
      { userId: 2, nombreArchivo: "1.098.765.432.png", name: "Beto" },
    ]);
    expect(r.sinUsuario).toEqual([]);
  });

  test("clasifica sin-usuario, ignorados y duplicados", () => {
    const r = emparejarFotosPorCedula(
      [
        "fotos/", // carpeta → no cuenta
        "99999999.jpg", // cédula inexistente
        "notas.txt", // no imagen
        "52123456.jpg", // Ana
        "52.123.456.png", // Ana de nuevo → duplicado
      ],
      usuarios,
    );
    expect(r.emparejados).toHaveLength(1);
    expect(r.emparejados[0].userId).toBe(1);
    expect(r.sinUsuario).toEqual(["99999999.jpg"]);
    expect(r.ignorados).toEqual(["notas.txt"]);
    expect(r.duplicados).toEqual(["52.123.456.png"]);
  });
});
