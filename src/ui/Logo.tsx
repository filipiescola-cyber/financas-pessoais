/**
 * A marca do app: moedas e uma calculadora.
 *
 * Desenho próprio em SVG, não um PNG: a marca aparece de 32 a 180 pixels (barra
 * lateral, cabeçalho do celular, ícone do PWA) e vetor é o único jeito de ela
 * ficar nítida nos três sem carregar três arquivos.
 *
 * As cores são fixas de propósito — não seguem o tema. Marca que troca de cor
 * junto com o fundo deixa de ser marca.
 */
export function Logo({ className = 'h-9 w-9' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <g stroke="#334155" strokeWidth="2.4" strokeLinejoin="round">
        {/* calculadora */}
        <rect x="27" y="9" width="31" height="47" rx="4.5" fill="#cbd5e1" />
        <rect x="32" y="14" width="21" height="10" rx="1.5" fill="#5ed3f0" />
        <g strokeWidth="2">
          <rect x="32" y="29" width="5.5" height="5" rx="1" fill="#a7e58c" />
          <rect x="40" y="29" width="5.5" height="5" rx="1" fill="#a7e58c" />
          <rect x="48" y="29" width="5.5" height="5" rx="1" fill="#a7e58c" />
          <rect x="32" y="38" width="5.5" height="5" rx="1" fill="#a7e58c" />
          <rect x="40" y="38" width="5.5" height="5" rx="1" fill="#a7e58c" />
          <rect x="48" y="38" width="5.5" height="5" rx="1" fill="#a7e58c" />
          <rect x="32" y="47" width="5.5" height="5" rx="1" fill="#a7e58c" />
          <rect x="40" y="47" width="5.5" height="5" rx="1" fill="#a7e58c" />
          <rect x="48" y="47" width="5.5" height="5" rx="1" fill="#f28b8b" />
        </g>

        {/* moedas, da de trás para a da frente */}
        <circle cx="16" cy="45" r="10.5" fill="#fbd97a" />
        <circle cx="13" cy="31" r="10.5" fill="#fbd97a" />
        <circle cx="26" cy="19" r="12" fill="#fcc42c" />
      </g>

      {/* cifrões: sem contorno, para não pesar no tamanho pequeno */}
      <g fill="none" stroke="#334155" strokeWidth="2" strokeLinecap="round">
        <path d="M26 13.5v11M29 16.6a3 3 0 0 0-3-1.7h-1a2.3 2.3 0 0 0 0 4.6h2a2.3 2.3 0 0 1 0 4.6h-1a3 3 0 0 1-3-1.7" />
        <path d="M13 26.5v9M15.4 28.7a2.4 2.4 0 0 0-2.4-1.2h-.8a1.9 1.9 0 0 0 0 3.7h1.6a1.9 1.9 0 0 1 0 3.7H13a2.4 2.4 0 0 1-2.4-1.2" />
      </g>
    </svg>
  );
}
