import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function Base({ children, ...props }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export function RouteMark({ className = "h-6 w-6", ...props }: IconProps) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className} aria-hidden="true" {...props}>
      <rect width="32" height="32" rx="9" fill="currentColor" opacity="0.12" />
      <path d="M8 22.5c0-4 3.4-4 6-4s5.5 0 5.5-3.5-3-3.5-6-3.5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      <circle cx="9" cy="23" r="2.4" fill="currentColor" />
      <circle cx="23" cy="9.5" r="2.4" fill="currentColor" />
    </svg>
  );
}

export function Truck(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M2 7.5h11v9H2z" />
      <path d="M13 10.5h4.6L21 14v2.5h-8z" />
      <circle cx="6" cy="18.5" r="1.8" />
      <circle cx="17" cy="18.5" r="1.8" />
      <path d="M2 16.5h2.2M7.8 16.5H13M18.8 16.5H21" />
    </Base>
  );
}

export function FileSheet(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M14 2.5H6.5A1.5 1.5 0 0 0 5 4v16a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 20V7.5z" />
      <path d="M14 2.5V8h5" />
      <path d="M8.5 12.5h7M8.5 16h7" />
    </Base>
  );
}

export function Clipboard(props: IconProps) {
  return (
    <Base {...props}>
      <rect x="7" y="4" width="10" height="3.5" rx="1" />
      <path d="M8.5 5.5H6.5A1.5 1.5 0 0 0 5 7v12a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19V7a1.5 1.5 0 0 0-1.5-1.5h-2" />
      <path d="M8.5 12h7M8.5 16h4.5" />
    </Base>
  );
}

export function Upload(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M12 16V4" />
      <path d="m7.5 8.5 4.5-4.5 4.5 4.5" />
      <path d="M4 15v3.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V15" />
    </Base>
  );
}

export function Search(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </Base>
  );
}

export function X(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Base>
  );
}

export function Check(props: IconProps) {
  return (
    <Base {...props}>
      <path d="m4.5 12.5 5 5 10-11" />
    </Base>
  );
}

export function Alert(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M12 4.5 3 20h18z" />
      <path d="M12 10v4.5M12 17.5v.01" />
    </Base>
  );
}

export function Clock(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </Base>
  );
}

export function Banknote(props: IconProps) {
  return (
    <Base {...props}>
      <rect x="2.5" y="6" width="19" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.6" />
      <path d="M6 9.5v5M18 9.5v5" />
    </Base>
  );
}

export function Weight(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M7 8.5h10l2.2 11a1 1 0 0 1-1 1.2H5.8a1 1 0 0 1-1-1.2z" />
      <circle cx="12" cy="5.8" r="2.3" />
      <path d="m10.5 15 1.5-2 1.5 2" />
    </Base>
  );
}

export function Compass(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m15 9-1.8 4.2L9 15l1.8-4.2z" />
    </Base>
  );
}

export function Download(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M12 4v11" />
      <path d="m7.5 10.5 4.5 4.5 4.5-4.5" />
      <path d="M4 16v2.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V16" />
    </Base>
  );
}

export function Trash(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M4 7h16" />
      <path d="M9.5 7V4.8h5V7" />
      <path d="M6.5 7l.8 12.2a1.3 1.3 0 0 0 1.3 1.2h6.8a1.3 1.3 0 0 0 1.3-1.2L17.5 7" />
      <path d="M10.5 11v5.5M13.5 11v5.5" />
    </Base>
  );
}

export function Sliders(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
      <circle cx="15" cy="7" r="2" />
      <circle cx="9" cy="17" r="2" />
    </Base>
  );
}

export function ArrowLeft(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M20 12H5" />
      <path d="m10 7-5 5 5 5" />
    </Base>
  );
}

export function ArrowRight(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M4 12h15" />
      <path d="m14 7 5 5-5 5" />
    </Base>
  );
}

export function ChevronDown(props: IconProps) {
  return (
    <Base {...props}>
      <path d="m6 9.5 6 6 6-6" />
    </Base>
  );
}

export function ChevronLeft(props: IconProps) {
  return (
    <Base {...props}>
      <path d="m14.5 6-6 6 6 6" />
    </Base>
  );
}

export function ChevronRight(props: IconProps) {
  return (
    <Base {...props}>
      <path d="m9.5 6 6 6-6 6" />
    </Base>
  );
}

export function Sparkle(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M12 3.5 13.7 9 19 10.7 13.7 12.4 12 18l-1.7-5.6L5 10.7 10.3 9z" />
      <path d="M18.5 16.5 19 18l1.5.5L19 19l-.5 1.5-.5-1.5L16.5 18l1.5-.5z" />
    </Base>
  );
}

export function Layers(props: IconProps) {
  return (
    <Base {...props}>
      <path d="m12 3.5 8 4.2-8 4.2-8-4.2z" />
      <path d="m4 12 8 4.2 8-4.2" />
      <path d="m4 16.3 8 4.2 8-4.2" />
    </Base>
  );
}

export function Building(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M4 20.5V5.5A1.5 1.5 0 0 1 5.5 4h7A1.5 1.5 0 0 1 14 5.5v15" />
      <path d="M14 10h4.5A1.5 1.5 0 0 1 20 11.5v9" />
      <path d="M2.5 20.5h19M7 8h4M7 12h4M7 16h4M16.5 14h1.5M16.5 17.5h1.5" />
    </Base>
  );
}

export function History(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1" />
      <path d="M3.5 4.5V10H9" />
      <path d="M12 8v4.3l2.8 1.8" />
    </Base>
  );
}

export function Pin(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M12 21s6.5-6.1 6.5-11a6.5 6.5 0 1 0-13 0C5.5 14.9 12 21 12 21z" />
      <circle cx="12" cy="10" r="2.4" />
    </Base>
  );
}

export function Filter(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M3.5 5.5h17l-6.5 7.6V20l-4-2.3v-4.6z" />
    </Base>
  );
}

export function ArrowUpDown(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M8 4v16M8 4 4.5 7.5M8 4l3.5 3.5M16 20V4M16 20l-3.5-3.5M16 20l3.5-3.5" />
    </Base>
  );
}

export function Grid(props: IconProps) {
  return (
    <Base {...props}>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
    </Base>
  );
}

export function Table(props: IconProps) {
  return (
    <Base {...props}>
      <rect x="3" y="4.5" width="18" height="15" rx="2" />
      <path d="M3 9.5h18M3 14.5h18M9 9.5v10" />
    </Base>
  );
}

export function Bolt(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M13 2.5 5 13.5h5l-1 8L19 9.5h-5.5z" />
    </Base>
  );
}

export function Plus(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M12 5v14M5 12h14" />
    </Base>
  );
}
