import type { ReactNode } from 'react';

/**
 * Banco de ícones das categorias (§3, coluna `categorias.icone`).
 *
 * SVG inline, como o resto do app: uma biblioteca de ícones traria centenas de
 * desenhos que nunca seriam usados para dentro do bundle de um app que precisa
 * abrir rápido no celular.
 *
 * O que é gravado no banco é a CHAVE, não o desenho. Um ícone que sai daqui
 * vira uma categoria sem ícone — nunca uma tela quebrada — e trocar o desenho
 * de `mercado` amanhã não exige tocar em dado nenhum.
 *
 * As chaves são genéricas de propósito (`carrinho`, não `mercado`): o mesmo
 * desenho serve para "Mercado", "Compras" e "Feira", e nomear pelo desenho
 * evita um banco com três chaves para o mesmo carrinho.
 */

const D: Record<string, ReactNode> = {
  // — casa e contas —
  casa: (
    <>
      <path d="M4 10.5 12 4l8 6.5" />
      <path d="M6 10v10h12V10" />
    </>
  ),
  lampada: (
    <>
      <path d="M12 3a6 6 0 0 0-3 11.2V17h6v-2.8A6 6 0 0 0 12 3z" />
      <path d="M10 20h4" />
    </>
  ),
  gota: <path d="M12 3s6 6.4 6 10a6 6 0 0 1-12 0c0-3.6 6-10 6-10z" />,
  wifi: (
    <>
      <path d="M4.5 11.5a11 11 0 0 1 15 0" />
      <path d="M7.5 15a7 7 0 0 1 9 0" />
      <path d="M10.5 18.4a3 3 0 0 1 3 0" />
    </>
  ),
  chave: (
    <>
      <circle cx="7.5" cy="16.5" r="3.5" />
      <path d="M10 14 20 4" />
      <path d="M17 7l2.5 2.5" />
    </>
  ),
  sofa: (
    <>
      <path d="M5 12V9a2 2 0 0 1 4 0v3h6V9a2 2 0 0 1 4 0v3" />
      <rect x="3" y="12" width="18" height="6" rx="2" />
      <path d="M7 18v2M17 18v2" />
    </>
  ),
  ferramenta: (
    <>
      <path d="M3 21l7.5-7.5" />
      <path d="M13.5 4.5 20 11l-3 3-6.5-6.5z" />
      <path d="M11.5 12.5 14 10" />
    </>
  ),

  // — comida —
  talheres: (
    <>
      <path d="M6 3v6a2 2 0 0 0 4 0V3" />
      <path d="M8 9v12" />
      <path d="M17 3c-1.4 1.8-2 3.8-2 6h4c0-2.2-.6-4.2-2-6z" />
      <path d="M17 9v12" />
    </>
  ),
  carrinho: (
    <>
      <path d="M3 4h2l2.4 10.5h10L20 7H6" />
      <circle cx="9" cy="19" r="1.5" />
      <circle cx="17" cy="19" r="1.5" />
    </>
  ),
  cafe: (
    <>
      <path d="M4 8h12v5a6 6 0 0 1-12 0z" />
      <path d="M16 9h2a2.5 2.5 0 0 1 0 5h-2" />
      <path d="M3 21h15" />
    </>
  ),
  pizza: (
    <>
      <path d="M12 3 4 19a20 20 0 0 0 16 0z" />
      <circle cx="10.5" cy="12" r=".9" />
      <circle cx="14" cy="15.5" r=".9" />
    </>
  ),
  sacola: (
    <>
      <path d="M6 8h12l-1 12H7z" />
      <path d="M9.5 8V6a2.5 2.5 0 0 1 5 0v2" />
    </>
  ),
  taca: (
    <>
      <path d="M7 4h10l-5 7z" />
      <path d="M12 11v7" />
      <path d="M8 21h8" />
    </>
  ),

  // — transporte —
  carro: (
    <>
      <path d="M5 11.5 6.5 7.4A2 2 0 0 1 8.4 6h7.2a2 2 0 0 1 1.9 1.4L19 11.5" />
      <path d="M3 17v-3.5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2V17z" />
      <circle cx="7.5" cy="17" r="1.7" />
      <circle cx="16.5" cy="17" r="1.7" />
    </>
  ),
  onibus: (
    <>
      <rect x="4" y="4" width="16" height="14" rx="2" />
      <path d="M4 11h16" />
      <path d="M8 18v2M16 18v2" />
      <circle cx="8" cy="15" r=".9" />
      <circle cx="16" cy="15" r=".9" />
    </>
  ),
  bicicleta: (
    <>
      <circle cx="6" cy="17" r="3.5" />
      <circle cx="18" cy="17" r="3.5" />
      <path d="M9.5 17 12 9h4" />
      <path d="M12 9 10 6H8" />
    </>
  ),
  combustivel: (
    <>
      <rect x="3.5" y="3" width="10" height="17" rx="2" />
      <path d="M3.5 9.5h10" />
      <path d="M2.5 20h12" />
      <path d="M13.5 7h3A1.5 1.5 0 0 1 18 8.5V16a1.5 1.5 0 0 0 3 0v-5l-2-2.5" />
    </>
  ),
  aviao: (
    <>
      <path d="M21 3 3 10.5l7.5 3 3 7.5z" />
      <path d="M10.5 13.5 21 3" />
    </>
  ),
  moto: (
    <>
      <circle cx="5.5" cy="16.5" r="3.5" />
      <circle cx="18.5" cy="16.5" r="3.5" />
      <path d="M9 16.5h5.5l2.2-5.5H10.5z" />
      <path d="M14.5 7.5h3.5L20 11" />
    </>
  ),

  // — saúde e cuidados —
  coracao: <path d="M12 20s-7.5-4.6-7.5-9.6A4 4 0 0 1 12 7.8a4 4 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20z" />,
  remedio: (
    <>
      <rect x="2.5" y="9" width="19" height="6" rx="3" />
      <path d="M12 9v6" />
    </>
  ),
  cruz: <path d="M9.5 3h5v6h6v5h-6v6h-5v-6h-6V9h6z" />,
  oculos: (
    <>
      <circle cx="6.5" cy="14" r="3.5" />
      <circle cx="17.5" cy="14" r="3.5" />
      <path d="M10 14h4" />
      <path d="M3.5 10.5 6 8M20.5 10.5 18 8" />
    </>
  ),
  halteres: (
    <>
      <path d="M4 9.5v5M7 6.5v11M17 6.5v11M20 9.5v5" />
      <path d="M7 12h10" />
    </>
  ),
  tesoura: (
    <>
      <circle cx="6.5" cy="18" r="2.5" />
      <circle cx="17.5" cy="18" r="2.5" />
      <path d="M8.5 16 18 4M15.5 16 6 4" />
    </>
  ),

  // — lazer e pessoal —
  controle: (
    <>
      <rect x="2" y="8" width="20" height="10" rx="4" />
      <path d="M7 11v4M5 13h4" />
      <circle cx="16" cy="12" r="1" />
      <circle cx="18.5" cy="14.5" r="1" />
    </>
  ),
  musica: (
    <>
      <path d="M9 17V5.5l10-2V15" />
      <circle cx="6.5" cy="17.5" r="2.5" />
      <circle cx="16.5" cy="15.5" r="2.5" />
    </>
  ),
  filme: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M8 4v16M16 4v16" />
      <path d="M3 9h5M3 15h5M16 9h5M16 15h5" />
    </>
  ),
  livro: (
    <>
      <path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" />
      <path d="M8 3v14" />
    </>
  ),
  camiseta: <path d="M9 3.5H6.5L3 7.5l3 2.5V20h12V10l3-2.5-3.5-4H15a3 3 0 0 1-6 0z" />,
  presente: (
    <>
      <rect x="3" y="8" width="18" height="4.5" rx="1" />
      <path d="M5 12.5V20h14v-7.5" />
      <path d="M12 8v12" />
      <path d="M12 8S10.5 3 8.5 3a2.5 2.5 0 0 0 0 5M12 8s1.5-5 3.5-5a2.5 2.5 0 0 1 0 5" />
    </>
  ),
  pata: (
    <>
      <circle cx="5.8" cy="10" r="1.9" />
      <circle cx="9.8" cy="6.8" r="1.9" />
      <circle cx="14.2" cy="6.8" r="1.9" />
      <circle cx="18.2" cy="10" r="1.9" />
      <path d="M12 12.5c-3.4 0-6 2.5-6 4.8 0 2 2 3.2 6 3.2s6-1.2 6-3.2c0-2.3-2.6-4.8-6-4.8z" />
    </>
  ),
  mala: (
    <>
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
      <path d="M3 12h18" />
    </>
  ),

  // — dinheiro —
  cifrao: (
    <>
      <path d="M12 3v18" />
      <path d="M16.5 7A3.5 3.5 0 0 0 13 5h-2a3 3 0 0 0 0 6h3a3 3 0 0 1 0 6h-2a3.5 3.5 0 0 1-3.5-2" />
    </>
  ),
  carteira: (
    <>
      <rect x="3" y="6" width="18" height="13" rx="2" />
      <path d="M16 11h5v4h-5a2 2 0 0 1 0-4z" />
    </>
  ),
  grafico: (
    <>
      <path d="M4 4v16h16" />
      <path d="M8 16v-4M12 16V8M16 16v-6" />
    </>
  ),
  cofre: (
    <>
      <rect x="3" y="4" width="18" height="15" rx="2" />
      <circle cx="12" cy="11.5" r="3.5" />
      <path d="M12 8v7M8.5 11.5h7" />
      <path d="M6.5 19v2M17.5 19v2" />
    </>
  ),
  maleta: (
    <>
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M9 7V5h6v2" />
      <path d="M3 12.5h18" />
    </>
  ),
  recibo: (
    <>
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" />
      <path d="M9 8h6M9 12h6" />
    </>
  ),
  percentual: (
    <>
      <circle cx="7" cy="7" r="2.8" />
      <circle cx="17" cy="17" r="2.8" />
      <path d="M5 19 19 5" />
    </>
  ),
  etiqueta: (
    <>
      <path d="M3 12V5a2 2 0 0 1 2-2h7l9 9-9 9z" />
      <circle cx="7.5" cy="7.5" r="1.2" />
    </>
  ),
  devolver: (
    <>
      <path d="M4 10h11a5 5 0 0 1 0 10H9" />
      <path d="M8 6 4 10l4 4" />
    </>
  ),
  cartao: (
    <>
      <rect x="3" y="6" width="18" height="13" rx="2" />
      <path d="M3 10h18" />
      <path d="M7 15h3" />
    </>
  ),
  documento: (
    <>
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M9 8h6M9 12h6M9 16h3" />
    </>
  ),

  // — outros —
  estrela: <path d="m12 4 2.5 5.1 5.5.8-4 3.9.9 5.6-4.9-2.6-4.9 2.6.9-5.6-4-3.9 5.5-.8z" />,
  pessoa: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
    </>
  ),
  crianca: (
    <>
      <circle cx="12" cy="6.5" r="3" />
      <path d="M12 9.5v6M8.5 12.5h7M9 21l3-5.5 3 5.5" />
    </>
  ),
  escola: (
    <>
      <path d="M12 4 2 9l10 5 10-5z" />
      <path d="M6 11.5V17c0 1.7 2.7 3 6 3s6-1.3 6-3v-5.5" />
    </>
  ),
  celular: (
    <>
      <rect x="6" y="2" width="12" height="20" rx="3" />
      <path d="M10.5 5.5h3" />
      <path d="M11 18.5h2" />
    </>
  ),
  nuvem: <path d="M7 18.5a4.2 4.2 0 0 1 .6-8.4 5.6 5.6 0 0 1 10.6 1.7 3.5 3.5 0 0 1-.7 6.7z" />,
  doacao: (
    <>
      <path d="M12 8.5s-1.4-2-3-2a2.6 2.6 0 0 0 0 5.2l3 2.8 3-2.8a2.6 2.6 0 0 0 0-5.2c-1.6 0-3 2-3 2z" />
      <path d="M3.5 20.5c1.8-2.8 4-4.2 5.8-4.2M20.5 20.5c-1.8-2.8-4-4.2-5.8-4.2" />
    </>
  ),
  circulo: <circle cx="12" cy="12" r="8" />,
};

/** Um valor fora do banco é tratado como "sem ícone". */
export function ehChaveDeIcone(valor: string | null): valor is string {
  return valor !== null && valor in D;
}

/**
 * O ícone de uma categoria. Sem chave, ou com uma chave que não existe mais,
 * devolve `null` — a tela cai no ponto colorido, que nunca deixa de funcionar.
 */
export function IconeDeCategoria({
  chave,
  className = 'h-[18px] w-[18px]',
  cor,
}: {
  chave: string | null;
  className?: string;
  cor?: string | null;
}) {
  if (!ehChaveDeIcone(chave)) return null;

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke={cor ?? 'currentColor'}
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
      aria-hidden="true"
    >
      {D[chave]}
    </svg>
  );
}

/**
 * Os ícones agrupados, para escolher.
 *
 * Grupos existem para procurar, não para classificar: ninguém sabe se "mala" é
 * lazer ou transporte, mas quem procura por ela olha nos dois. Por isso são
 * poucos e largos.
 */
export const GRUPOS_DE_ICONES: { titulo: string; chaves: string[] }[] = [
  { titulo: 'casa', chaves: ['casa', 'lampada', 'gota', 'wifi', 'chave', 'sofa', 'ferramenta'] },
  { titulo: 'comida', chaves: ['talheres', 'carrinho', 'cafe', 'pizza', 'sacola', 'taca'] },
  {
    titulo: 'transporte',
    chaves: ['carro', 'onibus', 'bicicleta', 'combustivel', 'aviao', 'moto'],
  },
  { titulo: 'saúde', chaves: ['coracao', 'remedio', 'cruz', 'oculos', 'halteres', 'tesoura'] },
  {
    titulo: 'lazer',
    chaves: ['controle', 'musica', 'filme', 'livro', 'camiseta', 'presente', 'pata', 'mala'],
  },
  {
    titulo: 'dinheiro',
    chaves: [
      'cifrao',
      'carteira',
      'grafico',
      'cofre',
      'maleta',
      'recibo',
      'percentual',
      'etiqueta',
      'devolver',
      'cartao',
      'documento',
    ],
  },
  {
    titulo: 'outros',
    chaves: ['estrela', 'pessoa', 'crianca', 'escola', 'celular', 'nuvem', 'doacao', 'circulo'],
  },
];
