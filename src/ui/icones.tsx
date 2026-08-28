type Props = { className?: string };

/**
 * Ícones em SVG inline. Nada de biblioteca: são seis desenhos, e uma dependência
 * a mais no bundle de um app que precisa abrir rápido no celular não se paga.
 */
const base = 'h-[18px] w-[18px] shrink-0';

function Svg({ className = '', children }: Props & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`${base} ${className}`}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function IconeInicio(p: Props) {
  return (
    <Svg {...p}>
      <path d="M4 10.5 12 4l8 6.5" />
      <path d="M6 10v10h12V10" />
    </Svg>
  );
}

export function IconeLancamentos(p: Props) {
  return (
    <Svg {...p}>
      <path d="M4 6h16M4 12h16M4 18h10" />
    </Svg>
  );
}

export function IconeContas(p: Props) {
  return (
    <Svg {...p}>
      <rect x="3" y="6" width="18" height="13" rx="2" />
      <path d="M3 10h18M7 15h4" />
    </Svg>
  );
}

export function IconeFaturas(p: Props) {
  return (
    <Svg {...p}>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M8 8h8M8 12h8M8 16h5" />
    </Svg>
  );
}

export function IconeRelatorios(p: Props) {
  return (
    <Svg {...p}>
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </Svg>
  );
}

export function IconeCategorias(p: Props) {
  return (
    <Svg {...p}>
      <circle cx="7.5" cy="7.5" r="3.5" />
      <circle cx="16.5" cy="16.5" r="3.5" />
      <path d="M14 4h6v6" />
    </Svg>
  );
}

export function IconeDados(p: Props) {
  return (
    <Svg {...p}>
      <path d="M12 3v12" />
      <path d="m8 11 4 4 4-4" />
      <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </Svg>
  );
}

export function IconeImportar(p: Props) {
  return (
    <Svg {...p}>
      <path d="M12 15V3" />
      <path d="m7 10 5 5 5-5" />
      <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </Svg>
  );
}

export function IconeMais(p: Props) {
  return (
    <Svg {...p}>
      <circle cx="5" cy="12" r="1.4" />
      <circle cx="12" cy="12" r="1.4" />
      <circle cx="19" cy="12" r="1.4" />
    </Svg>
  );
}

export function IconeOlho({ fechado, ...p }: Props & { fechado?: boolean }) {
  return (
    <Svg {...p}>
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z" />
      <circle cx="12" cy="12" r="2.5" />
      {fechado && <path d="m3 3 18 18" />}
    </Svg>
  );
}
