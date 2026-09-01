import { describe, expect, it } from 'vitest';
import {
  contasDaVenda,
  posicaoPorCotacao,
  valorEmReais,
  type MovimentoDeUnidade,
} from '../src/dominio/cotacao';

const recebimento = (
  data: string,
  quantidade: number,
  preco: number,
  cambio: number,
): MovimentoDeUnidade => ({ data, quantidade, preco, cambio, tipo: 'entrada', origem: 'recebimento' });

const compra = (
  data: string,
  quantidade: number,
  preco: number,
  cambio: number,
): MovimentoDeUnidade => ({ data, quantidade, preco, cambio, tipo: 'entrada', origem: 'compra' });

const venda = (data: string, quantidade: number): MovimentoDeUnidade => ({
  data,
  quantidade,
  preco: 0,
  cambio: 0,
  tipo: 'saida',
  origem: 'compra',
});

describe('valor em reais', () => {
  it('quantidade × preço × câmbio, arredondado uma vez só', () => {
    // 10 ações a US$ 12,34 com dólar a 5,40.
    expect(valorEmReais(10, 12.34, 5.4)).toBe(66636);
  });

  it('em real o câmbio é 1 e some da conta', () => {
    expect(valorEmReais(100, 32.5, 1)).toBe(325000);
  });
});

describe('posição por cotação', () => {
  it('soma o que entrou e reavalia pela cotação de hoje', () => {
    const p = posicaoPorCotacao([recebimento('2026-03-01', 10, 20, 5)], 25, 5.5);
    expect(p.quantidade).toBe(10);
    expect(p.custoTotal).toBe(100000);
    expect(p.valorAtual).toBe(137500);
    expect(p.ganhoNaoRealizado).toBe(37500);
  });

  it('o que foi recebido não conta como custo em caixa', () => {
    // A distinção que impede o app de tirar de uma conta um dinheiro que ela
    // nunca teve.
    const p = posicaoPorCotacao([recebimento('2026-03-01', 10, 20, 5)], 20, 5);
    expect(p.custoTotal).toBe(100000);
    expect(p.custoEmCaixa).toBe(0);
  });

  it('compra entra nos dois custos', () => {
    const p = posicaoPorCotacao([compra('2026-03-01', 10, 20, 5)], 20, 5);
    expect(p.custoTotal).toBe(100000);
    expect(p.custoEmCaixa).toBe(100000);
  });

  it('sem cotação informada, o valor de hoje é o custo', () => {
    // Fingir zero seria pior, e inventar outro número também.
    const p = posicaoPorCotacao([recebimento('2026-03-01', 10, 20, 5)], null, null);
    expect(p.valorAtual).toBe(100000);
    expect(p.ganhoNaoRealizado).toBe(0);
  });

  it('venda leva a mesma fração do custo que leva da quantidade', () => {
    const p = posicaoPorCotacao(
      [recebimento('2026-03-01', 12, 20, 5), venda('2026-06-01', 4)],
      20,
      5,
    );
    expect(p.quantidade).toBe(8);
    expect(p.custoTotal).toBe(80000);
  });

  it('custo médio: dois lotes viram um preço só', () => {
    const p = posicaoPorCotacao(
      [recebimento('2026-03-01', 10, 10, 5), recebimento('2026-06-01', 10, 30, 5)],
      30,
      5,
    );
    expect(p.custoTotal).toBe(50000 + 150000);
    expect(p.quantidade).toBe(20);

    const metade = posicaoPorCotacao(
      [recebimento('2026-03-01', 10, 10, 5), recebimento('2026-06-01', 10, 30, 5), venda('2026-07-01', 10)],
      30,
      5,
    );
    // Metade do custo, não o lote barato nem o caro.
    expect(metade.custoTotal).toBe(100000);
  });

  it('vender tudo zera a posição', () => {
    const p = posicaoPorCotacao(
      [recebimento('2026-03-01', 10, 20, 5), venda('2026-06-01', 10)],
      20,
      5,
    );
    expect(p.quantidade).toBe(0);
    expect(p.custoTotal).toBe(0);
    expect(p.valorAtual).toBe(0);
  });

  it('a ordem dos movimentos não muda o resultado', () => {
    const movimentos = [venda('2026-07-01', 5), recebimento('2026-03-01', 10, 20, 5)];
    expect(posicaoPorCotacao(movimentos, 20, 5).quantidade).toBe(5);
  });

  it('queda de preço vira ganho negativo, não zero', () => {
    const p = posicaoPorCotacao([recebimento('2026-03-01', 10, 20, 5)], 10, 5);
    expect(p.ganhoNaoRealizado).toBe(-50000);
  });
});

describe('contas da venda', () => {
  it('ação recebida: a venda inteira é dinheiro novo', () => {
    // Ela nunca teve contrapartida em caixa, e não era receita no recebimento
    // porque não dava para gastar (§2.7). É agora que ela entra.
    const posicao = posicaoPorCotacao([recebimento('2026-03-01', 10, 20, 5)], 30, 5);
    const c = contasDaVenda(posicao, 10, 30, 5);

    expect(c.bruto).toBe(150000);
    expect(c.devolucaoDeCaixa).toBe(0);
    expect(c.remuneracao).toBe(100000);
    expect(c.ganho).toBe(50000);
    expect(c.devolucaoDeCaixa + c.remuneracao + c.ganho).toBe(c.bruto);
  });

  it('ação comprada: só o que passou do custo é receita', () => {
    // O resto é o dinheiro voltando de onde saiu — transferência (§7.4).
    const posicao = posicaoPorCotacao([compra('2026-03-01', 10, 20, 5)], 30, 5);
    const c = contasDaVenda(posicao, 10, 30, 5);

    expect(c.devolucaoDeCaixa).toBe(100000);
    expect(c.remuneracao).toBe(0);
    expect(c.ganho).toBe(50000);
  });

  it('venda parcial leva a fração proporcional do custo', () => {
    const posicao = posicaoPorCotacao([recebimento('2026-03-01', 10, 20, 5)], 30, 5);
    const c = contasDaVenda(posicao, 4, 30, 5);

    expect(c.bruto).toBe(60000);
    expect(c.remuneracao).toBe(40000);
    expect(c.ganho).toBe(20000);
  });

  it('prejuízo: o ganho é negativo e as três partes ainda somam o bruto', () => {
    const posicao = posicaoPorCotacao([compra('2026-03-01', 10, 20, 5)], 10, 5);
    const c = contasDaVenda(posicao, 10, 10, 5);

    expect(c.bruto).toBe(50000);
    expect(c.ganho).toBe(-50000);
    expect(c.devolucaoDeCaixa + c.remuneracao + c.ganho).toBe(c.bruto);
  });

  it('câmbio sozinho já produz ganho', () => {
    // Recebida com dólar a 5,00 e vendida ao mesmo preço com dólar a 6,00.
    const posicao = posicaoPorCotacao([recebimento('2026-03-01', 10, 20, 5)], 20, 6);
    const c = contasDaVenda(posicao, 10, 20, 6);
    expect(c.ganho).toBe(20000);
  });

  it('posição vazia não inventa venda', () => {
    const posicao = posicaoPorCotacao([], 30, 5);
    expect(contasDaVenda(posicao, 10, 30, 5).ganho).toBe(150000);
  });
});

describe('o que a venda faz com o saldo', () => {
  it('ação recebida: nada sai da conta de investimentos', () => {
    // Ela nunca entrou lá. Tirar o bruto deixaria a conta negativa pelo valor
    // das ações, e impediria o saldo consolidado de subir na venda — quando é
    // justamente aí que aquele dinheiro passa a existir.
    const posicao = posicaoPorCotacao([recebimento('2026-03-01', 10, 20, 5)], 30, 5);
    const c = contasDaVenda(posicao, 10, 30, 5);

    expect(c.devolucaoDeCaixa).toBe(0);
    // Tudo que entra na conta é dinheiro novo.
    expect(c.remuneracao + c.ganho).toBe(c.bruto);
  });

  it('ação comprada: só o que saiu do caixa volta como transferência', () => {
    const posicao = posicaoPorCotacao([compra('2026-03-01', 10, 20, 5)], 30, 5);
    const c = contasDaVenda(posicao, 10, 30, 5);

    expect(c.devolucaoDeCaixa).toBe(100000);
    expect(c.remuneracao).toBe(0);
  });

  it('lote misto: cada parte volta pelo caminho dela', () => {
    const posicao = posicaoPorCotacao(
      [compra('2026-03-01', 10, 20, 5), recebimento('2026-04-01', 10, 20, 5)],
      20,
      5,
    );
    const c = contasDaVenda(posicao, 20, 20, 5);

    expect(c.devolucaoDeCaixa).toBe(100000);
    expect(c.remuneracao).toBe(100000);
    expect(c.ganho).toBe(0);
  });
});
