import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  analisarOFX,
  ErroDeOFX,
  lerDataOFX,
  lerValorOFX,
  removerDuplicadasDoArquivo,
} from '../src/import/ofx';

const sgml = readFileSync('fixtures/extrato-sgml.ofx', 'latin1');
const xml = readFileSync('fixtures/extrato-xml.ofx', 'utf8');

describe('data do OFX', () => {
  it('lê os formatos que os bancos emitem', () => {
    expect(lerDataOFX('20260827')).toBe('2026-08-27');
    expect(lerDataOFX('20260827120000')).toBe('2026-08-27');
    expect(lerDataOFX('20260827120000[-3:BRT]')).toBe('2026-08-27');
  });

  it('descarta a hora em vez de arrastar fuso para o app', () => {
    // 23h de Brasília em UTC seria outro dia. Como só a data importa, o horário
    // do banco é jogado fora na entrada (§13.1).
    expect(lerDataOFX('20260827235959[-3:BRT]')).toBe('2026-08-27');
  });

  it('recusa data impossível em vez de aceitar', () => {
    expect(lerDataOFX('20260230')).toBeNull();
    expect(lerDataOFX('2026')).toBeNull();
    expect(lerDataOFX('')).toBeNull();
  });
});

describe('valor do OFX', () => {
  it('lê o padrão com ponto decimal', () => {
    expect(lerValorOFX('-52.90')).toBe(-5290);
    expect(lerValorOFX('3200.00')).toBe(320000);
  });

  it('lê banco brasileiro que emite vírgula', () => {
    // Ler o decimal errado erraria por 100x sem avisar.
    expect(lerValorOFX('-35,50')).toBe(-3550);
  });

  it('lê valor com separador de milhar', () => {
    expect(lerValorOFX('-1.234,56')).toBe(-123456);
    expect(lerValorOFX('1,234.56')).toBe(123456);
  });

  it('recusa o que não é número', () => {
    expect(lerValorOFX('abc')).toBeNull();
    expect(lerValorOFX('')).toBeNull();
  });
});

describe('OFX 1.x (SGML, tags sem fechamento)', () => {
  const extrato = analisarOFX(sgml);

  it('lê todas as transações', () => {
    expect(extrato.transacoes).toHaveLength(4);
  });

  it('lê identificador, data, valor e descrição', () => {
    expect(extrato.transacoes[0]).toEqual({
      fitid: '202608030001',
      data: '2026-08-03',
      valor: -5290,
      descricao: 'SUPERMERCADO CENTRAL',
      tipo: 'DEBIT',
    });
  });

  it('preserva o sinal: crédito entra positivo', () => {
    const salario = extrato.transacoes.find((t) => t.fitid === '202608050002');
    expect(salario?.valor).toBe(320000);
  });

  it('usa NAME quando não há MEMO', () => {
    const posto = extrato.transacoes.find((t) => t.fitid === '202608100003');
    expect(posto?.descricao).toBe('POSTO IPIRANGA');
  });

  it('normaliza espaços em excesso da descrição', () => {
    const aluguel = extrato.transacoes.find((t) => t.fitid === '202608150004');
    expect(aluguel?.descricao).toBe('ALUGUEL AGOSTO');
  });

  it('lê a conta do arquivo e o período', () => {
    expect(extrato.contaDoArquivo).toBe('12345-6');
    expect(extrato.periodoInicio).toBe('2026-08-03');
    expect(extrato.periodoFim).toBe('2026-08-15');
  });
});

describe('OFX 2.x (XML)', () => {
  const extrato = analisarOFX(xml);

  it('lê as transações com tags fechadas', () => {
    expect(extrato.transacoes).toHaveLength(2);
    expect(extrato.transacoes[0]?.fitid).toBe('XML-0001');
    expect(extrato.transacoes[0]?.descricao).toBe('PADARIA DO BAIRRO');
  });

  it('não engole a tag de fechamento no valor', () => {
    expect(extrato.transacoes[0]?.valor).toBe(-3550);
    expect(extrato.transacoes[1]?.valor).toBe(-123456);
  });
});

describe('arquivo inválido', () => {
  it('avisa quando não é OFX', () => {
    expect(() => analisarOFX('data;valor;descricao\n01/08;10;padaria')).toThrow(ErroDeOFX);
  });

  it('avisa quando o período não tem movimentação', () => {
    expect(() => analisarOFX('<OFX><BANKTRANLIST></BANKTRANLIST></OFX>')).toThrow(ErroDeOFX);
  });

  it('ignora transação sem FITID em vez de importar sem identificador', () => {
    // Sem FITID não há deduplicação possível, e importar assim garante duplicata
    // na próxima vez.
    const semId = `<OFX><STMTTRN><DTPOSTED>20260801<TRNAMT>-10.00<MEMO>X</STMTTRN>
      <STMTTRN><FITID>ok<DTPOSTED>20260801<TRNAMT>-10.00<MEMO>Y</STMTTRN></OFX>`;
    expect(analisarOFX(semId).transacoes).toHaveLength(1);
  });
});

describe('duplicadas dentro do próprio arquivo', () => {
  it('mantém a primeira e conta as repetidas', () => {
    const { unicas, removidas } = removerDuplicadasDoArquivo([
      { fitid: 'a', data: '2026-08-01', valor: -100, descricao: 'x', tipo: null },
      { fitid: 'a', data: '2026-08-01', valor: -100, descricao: 'x', tipo: null },
      { fitid: 'b', data: '2026-08-02', valor: -200, descricao: 'y', tipo: null },
    ]);
    expect(unicas).toHaveLength(2);
    expect(removidas).toBe(1);
  });
});
