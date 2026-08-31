// Posição em renda fixa: vários aportes, vários resgates (§7.1, §7.2).
//
// O modelo antigo tratava um investimento como UMA aplicação: uma data, um
// valor. Não é assim que se usa. Quem tem um RDB guardando para o carro aporta
// de novo no mês seguinte, e quem precisa de R$ 200 resgata R$ 200 — não a
// posição inteira. Sem isto, aportar exigia criar um segundo investimento com o
// mesmo nome (a carteira enchia de "RDB Carro" repetidos), e o resgate parcial
// tirava o dinheiro da aplicação sem reduzi-la: o mesmo dinheiro aparecia na
// conta e no investimento ao mesmo tempo.
//
// Cada aporte é uma PARCELA que rende a partir da sua própria data, porque é
// isso que acontece no banco: dinheiro que entrou em março não rendeu em
// janeiro, e a alíquota de IR dele conta a partir de março. Somar tudo numa
// data média daria um número que nenhum extrato confirma.
//
// O resgate reduz as parcelas PROPORCIONALMENTE, não a mais antiga primeiro.
// Tirar 10% da posição tira 10% de cada parcela, o que preserva a idade média
// do que restou — e a idade é o que decide a alíquota do que sair depois.
//
// E o valor do resgate é o LÍQUIDO, porque é o que o banco credita e o que a
// tela pergunta. Descontá-lo do bruto deixaria para trás justamente o IR e o
// IOF retidos: resgatar uma posição de R$ 1.000 por inteiro deixava R$ 17 de
// saldo fantasma rendendo para sempre. Como bruto, rendimento, IOF e IR são
// todos lineares no principal, tirar a fração `líquido / líquido total` de cada
// parcela remove exatamente o que saiu.

import type { Centavos } from './dinheiro';
import type { DataISO } from './datas';
import { diasCorridosEntre, diasUteisEntre, type Feriados } from './diasUteis';
import { calcular, type Aplicacao, type FaixaDeIR, type Resultado } from './rendimento';

export type Movimento = {
  tipo: 'aporte' | 'resgate';
  valor: Centavos;
  data: DataISO;
};

/** Um pedaço de principal ainda vivo, com a data em que entrou. */
export type Parcela = { data: DataISO; valor: Centavos };

/** Aplicação sem o par (valor, data): eles passam a vir dos movimentos. */
export type Papel = Omit<Aplicacao, 'valorAplicado' | 'dataAplicacao'>;

function aplicacaoDaParcela(papel: Papel, parcela: Parcela): Aplicacao {
  return { ...papel, valorAplicado: parcela.valor, dataAplicacao: parcela.data };
}

/**
 * O principal que ainda está aplicado, parcela a parcela.
 *
 * No mesmo dia, aporte vem antes de resgate: não dá para resgatar o que ainda
 * não entrou, e a ordem inversa zeraria a posição por um instante.
 */
export function parcelasVivas(
  papel: Papel,
  movimentos: readonly Movimento[],
  taxaDoIndexador: number | null,
  feriados: Feriados,
  tabelaDeIR: readonly FaixaDeIR[],
): Parcela[] {
  const ordenados = [...movimentos].sort((a, b) =>
    a.data === b.data
      ? Number(a.tipo === 'resgate') - Number(b.tipo === 'resgate')
      : a.data.localeCompare(b.data),
  );

  let parcelas: Parcela[] = [];

  for (const movimento of ordenados) {
    if (movimento.tipo === 'aporte') {
      if (movimento.valor > 0) parcelas.push({ data: movimento.data, valor: movimento.valor });
      continue;
    }

    // Quanto a posição PAGARIA no dia do resgate, já com IR e IOF descontados:
    // é com esse número que o valor informado se compara. Sem taxa conhecida o
    // líquido é o próprio principal — mesma degradação honesta do resto do
    // cálculo (§13.5).
    const liquido = parcelas.reduce(
      (total, parcela) =>
        total +
        calcular(
          aplicacaoDaParcela(papel, parcela),
          taxaDoIndexador,
          movimento.data,
          feriados,
          tabelaDeIR,
        ).saldoLiquido,
      0,
    );

    if (liquido <= 0) {
      parcelas = [];
      continue;
    }

    // Resgatar mais do que existe zera a posição em vez de virar principal
    // negativo, que faria o saldo do app render para baixo para sempre.
    const fatorQueSobra = Math.max(0, 1 - movimento.valor / liquido);

    parcelas = parcelas
      .map((parcela) => ({ ...parcela, valor: Math.round(parcela.valor * fatorQueSobra) }))
      .filter((parcela) => parcela.valor > 0);
  }

  return parcelas;
}

const ZERADO: Resultado = {
  diasUteis: 0,
  diasCorridos: 0,
  saldoBruto: 0,
  rendimentoBruto: 0,
  ir: 0,
  iof: 0,
  saldoLiquido: 0,
  aliquotaIR: 0,
  taxaAnualUsada: null,
};

/**
 * Bruto e líquido da posição inteira (§7.2).
 *
 * Cada parcela passa pelo mesmo cálculo de sempre — inclusive IOF e a tabela
 * regressiva de IR, que dependem dos dias daquela parcela e não da posição. A
 * alíquota devolvida é a efetiva: o IR total sobre o rendimento total, que é o
 * único número que faz sentido quando as parcelas têm idades diferentes.
 *
 * `diasUteis` e `diasCorridos` são os da parcela mais antiga ainda viva — a
 * idade da posição, que é o que a tela mostra ao lado do nome.
 */
export function calcularPosicao(
  papel: Papel,
  movimentos: readonly Movimento[],
  taxaDoIndexador: number | null,
  ate: DataISO,
  feriados: Feriados,
  tabelaDeIR: readonly FaixaDeIR[],
): Resultado {
  const parcelas = parcelasVivas(papel, movimentos, taxaDoIndexador, feriados, tabelaDeIR);
  if (parcelas.length === 0) return ZERADO;

  const somados = parcelas.reduce(
    (total, parcela) => {
      const r = calcular(
        aplicacaoDaParcela(papel, parcela),
        taxaDoIndexador,
        ate,
        feriados,
        tabelaDeIR,
      );

      return {
        saldoBruto: total.saldoBruto + r.saldoBruto,
        rendimentoBruto: total.rendimentoBruto + r.rendimentoBruto,
        ir: total.ir + r.ir,
        iof: total.iof + r.iof,
        saldoLiquido: total.saldoLiquido + r.saldoLiquido,
        taxaAnualUsada: r.taxaAnualUsada,
      };
    },
    { saldoBruto: 0, rendimentoBruto: 0, ir: 0, iof: 0, saldoLiquido: 0, taxaAnualUsada: null as number | null },
  );

  const maisAntiga = parcelas.reduce((a, b) => (a.data <= b.data ? a : b)).data;

  return {
    ...somados,
    diasUteis: diasUteisEntre(maisAntiga, ate, feriados),
    diasCorridos: diasCorridosEntre(maisAntiga, ate),
    aliquotaIR: somados.rendimentoBruto > 0 ? somados.ir / somados.rendimentoBruto : 0,
  };
}

/** O principal ainda aplicado. É o que a tela chama de "aplicado". */
export function principalVivo(parcelas: readonly Parcela[]): Centavos {
  return parcelas.reduce((total, parcela) => total + parcela.valor, 0);
}
