import { describe, expect, it } from 'vitest';
import {
  parcelaPrice,
  resumoDaDivida,
  tabelaComAmortizacoes,
  tabelaDeAmortizacao,
  taxaAnualDeMensal,
  taxaImplicita,
  taxaMensalDeAnual,
} from '../src/dominio/divida';

describe('conversão de taxa', () => {
  it('12% ao ano não é 1% ao mês: juros compõem', () => {
    const mensal = taxaMensalDeAnual(0.12);
    expect(mensal).toBeGreaterThan(0.0094);
    expect(mensal).toBeLessThan(0.0096);
  });

  it('a volta desfaz a ida', () => {
    expect(taxaAnualDeMensal(taxaMensalDeAnual(0.12))).toBeCloseTo(0.12, 10);
  });
});

describe('Price: parcela constante', () => {
  it('acerta o valor conhecido da fórmula', () => {
    // R$ 1.000 em 12x a 1% a.m. dá R$ 88,85.
    expect(parcelaPrice(100000, 0.01, 12)).toBe(8885);
  });

  it('com taxa zero é divisão simples', () => {
    expect(parcelaPrice(120000, 0, 12)).toBe(10000);
  });

  it('todas as parcelas têm o mesmo valor, menos a última do arredondamento', () => {
    const tabela = tabelaDeAmortizacao(100000, 0.01, 12, 'price');
    const valores = new Set(tabela.slice(0, -1).map((p) => p.valor));
    expect(valores.size).toBe(1);
  });

  it('começa quase tudo em juros e termina quase tudo em amortização', () => {
    const tabela = tabelaDeAmortizacao(10000000, 0.008, 240, 'price');
    expect(tabela[0]!.juros).toBeGreaterThan(tabela[0]!.amortizacao);
    expect(tabela[239]!.amortizacao).toBeGreaterThan(tabela[239]!.juros);
  });
});

describe('SAC: amortização constante', () => {
  const tabela = tabelaDeAmortizacao(120000, 0.01, 12, 'sac');

  it('amortiza o mesmo todo mês', () => {
    expect(tabela[0]!.amortizacao).toBe(10000);
    expect(tabela[5]!.amortizacao).toBe(10000);
  });

  it('a parcela CAI, porque os juros correm sobre um saldo menor', () => {
    expect(tabela[0]!.valor).toBeGreaterThan(tabela[11]!.valor);
    expect(tabela[0]!.juros).toBe(1200);
    expect(tabela[11]!.juros).toBe(100);
  });

  it('paga menos juros que o Price no mesmo prazo e taxa', () => {
    const price = tabelaDeAmortizacao(120000, 0.01, 12, 'price');
    const jurosSac = tabela.reduce((t, p) => t + p.juros, 0);
    const jurosPrice = price.reduce((t, p) => t + p.juros, 0);
    expect(jurosSac).toBeLessThan(jurosPrice);
  });
});

describe('a dívida termina zerada, nos dois sistemas', () => {
  it.each([
    ['price', 100000, 0.0123, 37],
    ['sac', 100000, 0.0123, 37],
    ['price', 33333, 0.007, 11],
    ['sac', 98765, 0.0099, 60],
  ] as const)('%s, %i centavos em %ix', (sistema, principal, taxa, n) => {
    const tabela = tabelaDeAmortizacao(principal, taxa, n, sistema);

    // A soma das amortizações bate EXATAMENTE com o financiado: sem isso a
    // dívida terminaria devendo alguns centavos para sempre (§13.1).
    expect(tabela.reduce((t, p) => t + p.amortizacao, 0)).toBe(principal);
    expect(tabela[tabela.length - 1]!.saldoDevedor).toBe(0);
  });
});

describe('resumo', () => {
  const tabela = tabelaDeAmortizacao(100000, 0.01, 12, 'price');

  it('sem nenhuma paga, deve o valor financiado inteiro', () => {
    expect(resumoDaDivida(tabela, 0).saldoDevedor).toBe(100000);
    expect(resumoDaDivida(tabela, 0).jurosJaPagos).toBe(0);
  });

  it('a metade do prazo NÃO é a metade da dívida, no Price', () => {
    // É o número que engana: 6 de 12 parcelas pagas e ainda se deve mais da
    // metade, porque o começo é quase todo juros.
    const meio = resumoDaDivida(tabela, 6);
    expect(meio.saldoDevedor).toBeGreaterThan(50000);
    expect(meio.parcelasRestantes).toBe(6);
  });

  it('quitada, não deve nada e não há próxima', () => {
    const fim = resumoDaDivida(tabela, 12);
    expect(fim.saldoDevedor).toBe(0);
    expect(fim.proxima).toBeNull();
    expect(fim.totalAindaAPagar).toBe(0);
  });

  it('pagas além do prazo não viram saldo negativo', () => {
    expect(resumoDaDivida(tabela, 99).saldoDevedor).toBe(0);
  });
});

describe('taxa implícita', () => {
  it('deduz a taxa do que o banco informa', () => {
    // O caminho de volta: sei a parcela, quero a taxa.
    const taxa = taxaImplicita(100000, 8885, 12);
    expect(taxa).not.toBeNull();
    expect(taxa!).toBeCloseTo(0.01, 4);
  });

  it('devolve null quando não existe taxa possível, em vez de inventar', () => {
    // Parcela x prazo menor que o financiado seria juro negativo.
    expect(taxaImplicita(100000, 8000, 12)).toBeNull();
    expect(taxaImplicita(100000, 100000 / 12, 12)).toBeNull();
  });

  it('ida e volta: a taxa deduzida reproduz a parcela', () => {
    const taxa = taxaImplicita(5000000, 65000, 120)!;
    expect(parcelaPrice(5000000, taxa, 120)).toBe(65000);
  });
});

describe('taxa implícita: o que ela recusa', () => {
  it('devolve a taxa quando ela existe, mesmo em prazo curto', () => {
    // O corte antigo era "parcela acima de 1,5x o financiado": recusava casos
    // legítimos de poucas parcelas, que é onde a parcela é naturalmente alta.
    const taxa = taxaImplicita(10000, 6000, 2);
    expect(taxa).not.toBeNull();
    expect(parcelaPrice(10000, taxa!, 2)).toBe(6000);
  });

  it('recusa o que não cabe em 100% ao mês, em vez de devolver número errado', () => {
    // Antes, uma parcela absurda podia sair da faixa da bisseção e devolver
    // uma taxa plausível que não reproduz a parcela informada.
    expect(taxaImplicita(10000, 500000, 3)).toBeNull();
  });

  it('toda taxa devolvida reproduz exatamente a parcela informada', () => {
    for (const [principal, parcela, n] of [
      [100000, 8885, 12],
      [5000000, 65000, 120],
      [250000, 30000, 10],
    ] as const) {
      const taxa = taxaImplicita(principal, parcela, n);
      if (taxa === null) continue;
      expect(parcelaPrice(principal, taxa, n)).toBe(parcela);
    }
  });
});

describe('amortização extraordinária', () => {
  const PRINCIPAL = 10000000;
  const TAXA = 0.008;
  const N = 120;

  it('sem nenhuma, devolve exatamente a tabela original', () => {
    // Quem não amortizou não pode ver o número mudar.
    const original = tabelaDeAmortizacao(PRINCIPAL, TAXA, N, 'price');
    const com = tabelaComAmortizacoes(PRINCIPAL, TAXA, N, 'price', []);
    expect(com).toEqual(original);
  });

  it('reduzindo prazo, o financiamento acaba antes', () => {
    const com = tabelaComAmortizacoes(PRINCIPAL, TAXA, N, 'price', [
      { aposParcela: 12, valor: 2000000, modo: 'prazo', parcelasReduzidas: 30 },
    ]);
    expect(com.length).toBe(N - 30);
    expect(com[com.length - 1]!.saldoDevedor).toBe(0);
  });

  it('reduzindo prazo, a parcela quase não muda: é o prazo que cai', () => {
    const com = tabelaComAmortizacoes(PRINCIPAL, TAXA, N, 'price', [
      { aposParcela: 12, valor: 2000000, modo: 'prazo', parcelasReduzidas: 30 },
    ]);
    const antes = com[11]!.valor;
    const depois = com[12]!.valor;
    // Mesma ordem de grandeza — não é o alívio de parcela, é o encurtamento.
    expect(Math.abs(depois - antes) / antes).toBeLessThan(0.2);
  });

  it('reduzindo parcela, o prazo fica e a parcela cai', () => {
    const com = tabelaComAmortizacoes(PRINCIPAL, TAXA, N, 'price', [
      { aposParcela: 12, valor: 2000000, modo: 'parcela', parcelasReduzidas: 0 },
    ]);
    expect(com.length).toBe(N);
    expect(com[12]!.valor).toBeLessThan(com[11]!.valor);
  });

  it('reduzir prazo economiza mais juros que reduzir parcela', () => {
    // É a razão de o "reduzir prazo" quase sempre compensar: juros correm
    // sobre TEMPO, e cortar tempo corta mais do que cortar valor.
    const juros = (linhas: { juros: number }[]) => linhas.reduce((t, l) => t + l.juros, 0);

    const prazo = tabelaComAmortizacoes(PRINCIPAL, TAXA, N, 'price', [
      { aposParcela: 12, valor: 2000000, modo: 'prazo', parcelasReduzidas: 30 },
    ]);
    const parcela = tabelaComAmortizacoes(PRINCIPAL, TAXA, N, 'price', [
      { aposParcela: 12, valor: 2000000, modo: 'parcela', parcelasReduzidas: 0 },
    ]);

    expect(juros(prazo)).toBeLessThan(juros(parcela));
  });

  it('duas amortizações no mesmo financiamento se acumulam', () => {
    const com = tabelaComAmortizacoes(PRINCIPAL, TAXA, N, 'price', [
      { aposParcela: 12, valor: 1000000, modo: 'prazo', parcelasReduzidas: 15 },
      { aposParcela: 40, valor: 1000000, modo: 'prazo', parcelasReduzidas: 20 },
    ]);
    expect(com.length).toBe(N - 35);
    expect(com[com.length - 1]!.saldoDevedor).toBe(0);
  });

  it('amortizar o saldo inteiro quita a dívida ali', () => {
    const original = tabelaDeAmortizacao(PRINCIPAL, TAXA, N, 'price');
    const saldoApos12 = original[11]!.saldoDevedor;

    const com = tabelaComAmortizacoes(PRINCIPAL, TAXA, N, 'price', [
      { aposParcela: 12, valor: saldoApos12, modo: 'prazo', parcelasReduzidas: 0 },
    ]);

    expect(com.length).toBe(12);
    expect(com[11]!.saldoDevedor).toBe(0);
  });

  it('a numeração continua sequencial depois do corte', () => {
    const com = tabelaComAmortizacoes(PRINCIPAL, TAXA, N, 'price', [
      { aposParcela: 12, valor: 2000000, modo: 'prazo', parcelasReduzidas: 30 },
    ]);
    expect(com.map((l) => l.numero)).toEqual(com.map((_, i) => i + 1));
  });

  it('vale para SAC também', () => {
    const com = tabelaComAmortizacoes(PRINCIPAL, TAXA, N, 'sac', [
      { aposParcela: 24, valor: 3000000, modo: 'prazo', parcelasReduzidas: 40 },
    ]);
    expect(com.length).toBe(N - 40);
    expect(com[com.length - 1]!.saldoDevedor).toBe(0);
  });
});
