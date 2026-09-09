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
  /**
   * Percentual do indexador DESTE aporte, quando difere do da aplicação.
   *
   * Não é o caso comum — quase sempre o aporte segue a taxa contratada da
   * aplicação, e aí isto é nulo. Mas quando difere, herdar a taxa da aplicação
   * rende o dinheiro novo à taxa velha: um número inventado que não avisa que
   * é inventado.
   */
  percentual?: number | null;
  /** Vencimento próprio deste aporte. Só informativo: não muda o rendimento. */
  vencimento?: DataISO | null;
};

/** Um pedaço de principal ainda vivo, com a data e a taxa em que entrou. */
export type Parcela = {
  data: DataISO;
  valor: Centavos;
  /** Herdado do aporte. Nulo segue o papel da aplicação. */
  percentual?: number | null;
};

/** Aplicação sem o par (valor, data): eles passam a vir dos movimentos. */
export type Papel = Omit<Aplicacao, 'valorAplicado' | 'dataAplicacao'>;

function aplicacaoDaParcela(papel: Papel, parcela: Parcela): Aplicacao {
  return {
    ...papel,
    // A taxa da parcela vence a da aplicação: dinheiro que entrou a 105% não
    // rende a 120% só porque o primeiro aporte foi contratado assim.
    percentualIndexador: parcela.percentual ?? papel.percentualIndexador,
    valorAplicado: parcela.valor,
    dataAplicacao: parcela.data,
  };
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
  /**
   * Até quando olhar. Movimento posterior fica de fora (§13.2).
   *
   * Sem este corte, "a posição em 30 de junho" incluía um resgate de agosto —
   * e a conferência, que compara o saldo do banco numa data com o cálculo
   * daquela data, acusava como erro cada resgate feito depois dela. A diferença
   * só crescia a cada movimento, e conferência que só piora ensina a ignorar a
   * conferência.
   */
  ate?: DataISO,
): Parcela[] {
  const ordenados = [...movimentos]
    .filter((m) => ate === undefined || m.data <= ate)
    .sort((a, b) =>
    a.data === b.data
      ? Number(a.tipo === 'resgate') - Number(b.tipo === 'resgate')
      : a.data.localeCompare(b.data),
  );

  let parcelas: Parcela[] = [];

  for (const movimento of ordenados) {
    if (movimento.tipo === 'aporte') {
      if (movimento.valor > 0) {
        parcelas.push({
          data: movimento.data,
          valor: movimento.valor,
          percentual: movimento.percentual ?? null,
        });
      }
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
  const parcelas = parcelasVivas(papel, movimentos, taxaDoIndexador, feriados, tabelaDeIR, ate);
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

export type ContasDoResgate = {
  bruto: Centavos;
  /** O que volta de onde saiu: transferência, não receita (§7.4). */
  principal: Centavos;
  /** O que a aplicação rendeu. É AGORA que ele vira receita (§7.4). */
  rendimento: Centavos;
};

/**
 * O resgate em duas partes (§7.4).
 *
 * O resgate saía como uma transferência só, do valor inteiro, da conta de
 * investimentos para a corrente. Mas naquela conta só entrou o PRINCIPAL — o
 * rendimento nunca foi lançado, porque rendimento não realizado não é
 * lançamento (§7.4). Tirar principal mais rendimento de uma conta que só tem
 * principal deixa a conta NEGATIVA, em exatamente o valor do rendimento.
 *
 * E havia a outra metade da mesma regra: "só vira receita quando resgatado".
 * O app nunca chegava a lançar essa receita. Então o dinheiro que a aplicação
 * rendeu aparecia no saldo sem nunca aparecer como entrada — e a conta de
 * investimentos pagava a conta com um saldo negativo.
 *
 * A divisão é proporcional ao que se resgata: quem tira um terço da posição
 * tira um terço do principal e um terço do rendimento acumulado.
 */
export function contasDoResgate(
  aplicado: Centavos,
  liquidoDaPosicao: Centavos,
  valorResgatado: Centavos,
): ContasDoResgate {
  const bruto = Math.max(0, Math.round(valorResgatado));
  const principalVivo = Math.max(0, aplicado);

  // Sem principal vivo, o resgate é todo rendimento — e não o contrário.
  //
  // Chamar de principal o que o app sabe que não está mais aplicado tiraria
  // dinheiro da conta de investimentos por uma transferência sem lastro, que é
  // exatamente como ela ficou negativa antes. Rendimento é a leitura honesta:
  // a posição rendeu além do que o cálculo enxergava, e o §7.4 diz que
  // rendimento resgatado é receita.
  const referencia = liquidoDaPosicao > 0 ? liquidoDaPosicao : principalVivo;
  if (referencia <= 0) return { bruto, principal: 0, rendimento: bruto };

  const fracao = Math.min(1, bruto / referencia);
  const principal = Math.min(principalVivo, Math.round(principalVivo * fracao));

  return { bruto, principal, rendimento: bruto - principal };
}
