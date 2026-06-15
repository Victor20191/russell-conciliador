import type { CSSProperties } from "react";

export type IconName =
  | "home" | "play" | "folder" | "users" | "settings" | "bell" | "search"
  | "chev-r" | "chev-d" | "chev-l" | "plus" | "upload" | "download" | "check"
  | "x" | "warn" | "ai" | "doc" | "box" | "wallet" | "chip" | "chart"
  | "filter" | "more" | "msg" | "calendar" | "log" | "send" | "link" | "logout"
  | "eye" | "eye-off" | "menu";

export function Icon({
  name,
  size = 14,
  stroke = 1.6,
  className,
  style,
}: {
  name: IconName;
  size?: number;
  stroke?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const props = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: stroke,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className,
    style,
  };
  switch (name) {
    case "home": return <svg {...props}><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-7h-6v7H4a1 1 0 0 1-1-1z" /></svg>;
    case "play": return <svg {...props}><path d="M5 4l14 8-14 8z" /></svg>;
    case "folder": return <svg {...props}><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>;
    case "users": return <svg {...props}><circle cx="9" cy="8" r="3.5" /><path d="M2 20a7 7 0 0 1 14 0" /><path d="M16 11a3 3 0 1 0 0-6" /><path d="M22 20a6 6 0 0 0-4-5.66" /></svg>;
    case "settings": return <svg {...props}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1A2 2 0 1 1 4.3 17l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1A2 2 0 1 1 7 4.3l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1A2 2 0 1 1 19.7 7l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>;
    case "bell": return <svg {...props}><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>;
    case "search": return <svg {...props}><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>;
    case "chev-r": return <svg {...props}><path d="m9 6 6 6-6 6" /></svg>;
    case "chev-d": return <svg {...props}><path d="m6 9 6 6 6-6" /></svg>;
    case "chev-l": return <svg {...props}><path d="m15 18-6-6 6-6" /></svg>;
    case "plus": return <svg {...props}><path d="M12 5v14M5 12h14" /></svg>;
    case "upload": return <svg {...props}><path d="M12 16V4M6 10l6-6 6 6" /><path d="M4 20h16" /></svg>;
    case "download": return <svg {...props}><path d="M12 4v12M6 10l6 6 6-6" /><path d="M4 20h16" /></svg>;
    case "check": return <svg {...props}><path d="m4 12 5 5L20 6" /></svg>;
    case "x": return <svg {...props}><path d="M6 6l12 12M18 6 6 18" /></svg>;
    case "warn": return <svg {...props}><path d="M10.3 3.86a2 2 0 0 1 3.4 0l8.5 14a2 2 0 0 1-1.7 3H3.5a2 2 0 0 1-1.7-3z" /><path d="M12 9v4M12 17h0" /></svg>;
    case "ai": return <svg {...props}><path d="M12 3v3M12 18v3M5 12H2M22 12h-3M5.6 5.6 7.7 7.7M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" /><circle cx="12" cy="12" r="4" /></svg>;
    case "doc": return <svg {...props}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M8 13h8M8 17h6" /></svg>;
    case "box": return <svg {...props}><path d="M21 8 12 3 3 8v8l9 5 9-5z" /><path d="M3 8l9 5 9-5M12 13v9" /></svg>;
    case "wallet": return <svg {...props}><path d="M3 7a2 2 0 0 1 2-2h14v4M3 7v11a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-3" /><path d="M22 11h-5a2 2 0 1 0 0 4h5z" /></svg>;
    case "chip": return <svg {...props}><rect x="6" y="6" width="12" height="12" rx="1" /><path d="M9 1v3M15 1v3M9 20v3M15 20v3M1 9h3M1 15h3M20 9h3M20 15h3" /></svg>;
    case "chart": return <svg {...props}><path d="M3 3v18h18" /><path d="M7 15l3-4 4 3 5-8" /></svg>;
    case "filter": return <svg {...props}><path d="M3 4h18l-7 9v6l-4 2v-8z" /></svg>;
    case "more": return <svg {...props}><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></svg>;
    case "msg": return <svg {...props}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>;
    case "calendar": return <svg {...props}><rect x="3" y="5" width="18" height="16" rx="1" /><path d="M3 9h18M8 3v4M16 3v4" /></svg>;
    case "log": return <svg {...props}><path d="M4 4h16v16H4z" /><path d="M8 9h8M8 13h8M8 17h5" /></svg>;
    case "send": return <svg {...props}><path d="M22 2 11 13M22 2l-7 20-4-9-9-4z" /></svg>;
    case "link": return <svg {...props}><path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" /><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" /></svg>;
    case "logout": return <svg {...props}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5M21 12H9" /></svg>;
    case "eye": return <svg {...props}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>;
    case "eye-off": return <svg {...props}><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>;
    case "menu": return <svg {...props}><path d="M3 6h18M3 12h18M3 18h18" /></svg>;
    default: return null;
  }
}

// Recreación geométrica del logotipo Russell Bedford
export function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <svg viewBox="0 0 44 44" width={size} height={size}>
      <circle cx="22" cy="22" r="20.5" fill="#3B7CB8" />
      <g stroke="#ffffff" strokeWidth="2.2" strokeLinecap="square">
        <line x1="6" y1="32" x2="32" y2="6" />
        <line x1="11" y1="36" x2="36" y2="11" />
        <line x1="16" y1="40" x2="40" y2="16" />
      </g>
    </svg>
  );
}
