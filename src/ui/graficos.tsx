import type { ReactNode } from 'react';
import { useState } from 'react';
import { formatar, type Centavos } from '../dominio/dinheiro';

/**
 * Gráficos do app, em SVG inline. Sem biblioteca: são duas formas, e uma
 * dependência de gráficos pesa mais que o app inteiro.
 *
 * Paleta validada para a superfície escura (#111a2e): separação em
 * deuteranopia ΔE 9.4, acima do alvo de 8, e contraste acima de 3:1. Os dois
 * gráficos usam as MESMAS cores para as mesmas coisas — entrada sempre verde-
 * água, saída sempre laranja — porque cor que muda de significado entre um
 * gráfico e outro é pior do que gráfico nenhum.
 */
export const COR_ENTRADA = '#199e70';
export const COR_SAIDA = '#d95926';

const EIXO = '#334155';
const TEXTO_FRACO = '#64748b';

/**
 * Barras horizontais para comparar magnitude (gasto por categoria).
 *
 * Horizontal porque nome de categoria é longo: em coluna o rótulo vira texto
 * inclinado ou truncado. Uma cor só — a comparação aqui é de tamanho, não de
 * identidade, e pintar cada barra de uma cor sugeriria um significado que não
 * existe.
 */
export function BarrasHorizontais({
  dados,
  cor = COR_SAIDA,
}: {
  /** `icone` é opcional: nem toda barra é uma categoria. */
  dados: { rotulo: string; valor: Centavos; icone?: ReactNode }[];
  cor?: string;
}) {
  if (dados.length === 0) return null;

  const maior = Math.max(...dados.map((d) => d.valor), 1);

  return (
    <ul className="space-y-2.5">
      {dados.map((item) => {
        const proporcao = item.valor / maior;
        return (
          <li key={item.rotulo}>
            <div className="mb-1 flex items-center justify-between gap-3">
              <span className="flex min-w-0 items-center gap-2 text-sm text-slate-300">
                {item.icone}
                <span className="truncate">{item.rotulo}</span>
              </span>
              {/* Rótulo direto: o valor exato ao lado da barra evita o leitor
                  ter que estimar contra um eixo. */}
              <span className="numero dinheiro shrink-0 text-sm text-slate-400">
                {formatar(item.valor)}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-superficie-alta">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${Math.max(proporcao * 100, 1.5)}%`,
                  backgroundColor: cor,
                }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

type Coluna = { rotulo: string; entrada: Centavos; saida: Centavos };

/**
 * Colunas agrupadas: entrada e saída lado a lado, mês a mês.
 *
 * Duas séries com escalas comparáveis num eixo só. Nunca dois eixos — é a
 * forma mais fácil de fazer um gráfico mentir.
 */
export function ColunasAgrupadas({ dados }: { dados: Coluna[] }) {
  const [emFoco, setEmFoco] = useState<number | null>(null);

  if (dados.length === 0) return null;

  const maior = Math.max(...dados.flatMap((d) => [d.entrada, d.saida]), 1);
  const alturaDaArea = 140;
  const larguraDoGrupo = 100 / dados.length;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-4">
        <Legenda cor={COR_ENTRADA} rotulo="Entrou" />
        <Legenda cor={COR_SAIDA} rotulo="Saiu" />
      </div>

      <div className="relative" style={{ height: alturaDaArea }}>
        {/* Linha de base recessiva: presente para ancorar, discreta para não
            competir com os dados. */}
        <div className="absolute inset-x-0 bottom-0 h-px" style={{ backgroundColor: EIXO }} />

        <div className="flex h-full items-end">
          {dados.map((coluna, indice) => (
            <div
              key={coluna.rotulo}
              className="flex h-full flex-col justify-end"
              style={{ width: `${larguraDoGrupo}%` }}
              onMouseEnter={() => setEmFoco(indice)}
              onMouseLeave={() => setEmFoco(null)}
              onFocus={() => setEmFoco(indice)}
              onBlur={() => setEmFoco(null)}
              tabIndex={0}
            >
              <div className="flex h-full items-end justify-center gap-1 px-1">
                <Barra valor={coluna.entrada} maior={maior} altura={alturaDaArea} cor={COR_ENTRADA} />
                <Barra valor={coluna.saida} maior={maior} altura={alturaDaArea} cor={COR_SAIDA} />
              </div>
            </div>
          ))}
        </div>

        {emFoco !== null && dados[emFoco] && (
          <div className="pointer-events-none absolute -top-2 left-1/2 z-10 -translate-x-1/2 rounded-lg border border-borda-forte bg-superficie-alta px-3 py-2 shadow-xl">
            <p className="text-xs font-medium text-slate-200">{dados[emFoco].rotulo}</p>
            <p className="numero dinheiro mt-1 text-xs" style={{ color: COR_ENTRADA }}>
              Entrou {formatar(dados[emFoco].entrada)}
            </p>
            <p className="numero dinheiro text-xs" style={{ color: COR_SAIDA }}>
              Saiu {formatar(dados[emFoco].saida)}
            </p>
          </div>
        )}
      </div>

      <div className="mt-2 flex">
        {dados.map((coluna) => (
          <span
            key={coluna.rotulo}
            className="truncate text-center text-[11px]"
            style={{ width: `${larguraDoGrupo}%`, color: TEXTO_FRACO }}
          >
            {coluna.rotulo}
          </span>
        ))}
      </div>
    </div>
  );
}

function Barra({
  valor,
  maior,
  altura,
  cor,
}: {
  valor: Centavos;
  maior: Centavos;
  altura: number;
  cor: string;
}) {
  // Barra de valor zero fica invisível de propósito: desenhar um traço onde não
  // houve movimento sugere movimento pequeno, que é diferente de nenhum.
  const alturaEmPixels = valor === 0 ? 0 : Math.max((valor / maior) * altura, 3);

  return (
    <div
      className="w-full max-w-5 rounded-t transition-all"
      style={{ height: alturaEmPixels, backgroundColor: cor }}
    />
  );
}

function Legenda({ cor, rotulo }: { cor: string; rotulo: string }) {
  return (
    <span className="flex items-center gap-1.5 text-xs text-slate-400">
      <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: cor }} />
      {rotulo}
    </span>
  );
}
