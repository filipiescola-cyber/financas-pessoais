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

// Conta é carteira; cartão é o retângulo com tarja. Eram o mesmo desenho
// enquanto viviam longe um do outro na lista — agrupados, viraram dois itens
// iguais lado a lado.
export function IconeContas(p: Props) {
  return (
    <Svg {...p}>
      <rect x="3" y="6" width="18" height="13" rx="2" />
      <path d="M16 11h5v4h-5a2 2 0 0 1 0-4z" />
    </Svg>
  );
}

export function IconeCartoes(p: Props) {
  return (
    <Svg {...p}>
      <rect x="3" y="6" width="18" height="13" rx="2" />
      <path d="M3 10h18M7 15h3" />
    </Svg>
  );
}

export function IconeLote(p: Props) {
  return (
    <Svg {...p}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 9.5h18M3 14.5h18M9 4v16" />
    </Svg>
  );
}

export function IconeAtalhos(p: Props) {
  return (
    <Svg {...p}>
      <path d="M13 3 5 13.5h5.5L10 21l8-10.5h-5.5z" />
    </Svg>
  );
}

export function IconeFechamento(p: Props) {
  return (
    <Svg {...p}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
      <path d="M9.5 15.5 11 17l3.5-3.5" />
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

export function IconeOrcamento(p: Props) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </Svg>
  );
}

/** Dívida: a seta que aponta para baixo, saindo. */
export function IconeDividas(p: Props) {
  return (
    <Svg {...p}>
      <path d="M3 7h18v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
      <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M12 11v5M9.5 13.5 12 16l2.5-2.5" />
    </Svg>
  );
}

export function IconeInvestimentos(p: Props) {
  return (
    <Svg {...p}>
      <path d="M3 17.5 9 11l4 4 8-8.5" />
      <path d="M14 6.5h7v7" />
    </Svg>
  );
}

export function IconeMetas(p: Props) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3.5" />
    </Svg>
  );
}

export function IconeConferencia(p: Props) {
  return (
    <Svg {...p}>
      <path d="M20 6 9 17l-5-5" />
    </Svg>
  );
}

export function IconeFluxo(p: Props) {
  return (
    <Svg {...p}>
      <path d="M3 16.5 8 11l4 3.5L21 6" />
      <path d="M21 11V6h-5" />
    </Svg>
  );
}

export function IconeSimulador(p: Props) {
  return (
    <Svg {...p}>
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M9 7h6M9 12h.01M12 12h.01M15 12h.01M9 16h.01M12 16h.01M15 16h.01" />
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

export function IconeRelogio(p: Props) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </Svg>
  );
}

export function IconeConfere(p: Props) {
  return (
    <Svg {...p}>
      <path d="M20 6 9 17l-5-5" />
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
