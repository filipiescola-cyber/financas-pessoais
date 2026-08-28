import { describe, expect, it } from 'vitest';
import {
  encontrarCandidatas,
  montarPreview,
  resumirPreview,
  type CandidataManual,
} from '../src/import/conciliacao';
import type { TransacaoOFX } from '../src/import/ofx';

const doExtrato = (
  fitid: string,
  data: string,
  valor: number,
  descricao = 'compra',
): TransacaoOFX => ({ fitid, data, valor, descricao, tipo: 'DEBIT' });

const manual = (
  id: string,
  data: string,
  valor: number,
  fitid: string | null = null,
): CandidataManual => ({ id, valor, dataCaixa: data, descricao: null, fitid });

describe('casamento com lançamento manual (§6.4)', () => {
  const linha = doExtrato('f1', '2026-08-10', -5290);

  it('casa mesmo valor no mesmo dia', () => {
    expect(encontrarCandidatas(linha, [manual('a', '2026-08-10', -5290)])).toHaveLength(1);
  });

  it('casa dentro da janela de 3 dias, para os dois lados', () => {
    // O usuário lança no dia da compra; o banco às vezes posta dias depois.
    expect(encontrarCandidatas(linha, [manual('a', '2026-08-07', -5290)])).toHaveLength(1);
    expect(encontrarCandidatas(linha, [manual('a', '2026-08-13', -5290)])).toHaveLength(1);
  });

  it('NÃO casa fora da janela', () => {
    expect(encontrarCandidatas(linha, [manual('a', '2026-08-06', -5290)])).toHaveLength(0);
    expect(encontrarCandidatas(linha, [manual('a', '2026-08-14', -5290)])).toHaveLength(0);
  });

  it('NÃO casa valor diferente, nem por um centavo', () => {
    expect(encontrarCandidatas(linha, [manual('a', '2026-08-10', -5291)])).toHaveLength(0);
  });

  it('NÃO casa transação que já veio de extrato', () => {
    // Ela já tem fitid: casar de novo criaria vínculo cruzado entre dois lotes.
    expect(encontrarCandidatas(linha, [manual('a', '2026-08-10', -5290, 'outro')])).toHaveLength(0);
  });
});

describe('preview da importação (§6.5)', () => {
  it('marca como nova o que não existe em lugar nenhum', () => {
    const preview = montarPreview([doExtrato('f1', '2026-08-10', -5290)], new Set(), []);
    expect(preview[0]?.situacao).toBe('nova');
    expect(preview[0]?.importar).toBe(true);
  });

  it('marca como duplicada o que já foi importado antes', () => {
    const preview = montarPreview([doExtrato('f1', '2026-08-10', -5290)], new Set(['f1']), []);
    expect(preview[0]?.situacao).toBe('duplicada');
    // Duplicada não entra: é exatamente o que o FITID existe para impedir.
    expect(preview[0]?.importar).toBe(false);
  });

  it('marca como conciliada quando casa com um lançamento manual', () => {
    const preview = montarPreview(
      [doExtrato('f1', '2026-08-10', -5290)],
      new Set(),
      [manual('a', '2026-08-09', -5290)],
    );
    expect(preview[0]?.situacao).toBe('conciliada');
    expect(preview[0]?.candidatas[0]?.id).toBe('a');
  });

  it('NÃO escolhe sozinho quando casa com mais de um', () => {
    // Dois cafés iguais no mesmo dia. Escolher um seria chutar.
    const preview = montarPreview(
      [doExtrato('f1', '2026-08-10', -5290)],
      new Set(),
      [manual('a', '2026-08-10', -5290), manual('b', '2026-08-11', -5290)],
    );
    expect(preview[0]?.situacao).toBe('ambigua');
    expect(preview[0]?.importar).toBe(false);
    expect(preview[0]?.candidatas).toHaveLength(2);
  });

  it('não deixa o mesmo lançamento manual casar com duas linhas do extrato', () => {
    // Duas compras iguais no extrato e um único lançamento manual: a primeira
    // concilia, a segunda entra como nova. Sem isso, o manual sumiria.
    const preview = montarPreview(
      [doExtrato('f1', '2026-08-10', -5290), doExtrato('f2', '2026-08-10', -5290)],
      new Set(),
      [manual('a', '2026-08-10', -5290)],
    );
    expect(preview[0]?.situacao).toBe('conciliada');
    expect(preview[1]?.situacao).toBe('nova');
  });

  it('sugere categoria pela memória, e deixa em branco quando não sabe', () => {
    const preview = montarPreview(
      [doExtrato('f1', '2026-08-10', -5290, 'SUPERMERCADO'), doExtrato('f2', '2026-08-11', -900, 'XPTO')],
      new Set(),
      [],
      (descricao) => (descricao === 'SUPERMERCADO' ? 'cat-mercado' : null),
    );
    expect(preview[0]?.categoriaSugeridaId).toBe('cat-mercado');
    // Sem match, fica sem categoria. Nunca chutar (§6.5).
    expect(preview[1]?.categoriaSugeridaId).toBeNull();
  });

  it('resume o lote para a tela', () => {
    const preview = montarPreview(
      [
        doExtrato('f1', '2026-08-10', -100),
        doExtrato('f2', '2026-08-11', -200),
        doExtrato('f3', '2026-08-12', -300),
      ],
      new Set(['f3']),
      [manual('a', '2026-08-11', -200)],
    );

    expect(resumirPreview(preview)).toEqual({
      novas: 1,
      conciliadas: 1,
      duplicadas: 1,
      ambiguas: 0,
      aImportar: 2,
    });
  });
});
