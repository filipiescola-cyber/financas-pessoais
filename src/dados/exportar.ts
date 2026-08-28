// Export completo (§10.2).
//
// "É o seguro contra você mesmo quebrar o schema numa migration." O §12 coloca
// isto na Fase 1 de propósito: o backfill que abre a Fase 2 vai mexer em
// transações já gravadas, e rodar isso sem um export na mão é apostar.
//
// O export sai do banco pela mesma anon key do app, então o que ele enxerga é
// exatamente o que a RLS permite — nada de privilégio especial.

import { supabase } from './supabase';
import { hoje } from '../dominio/datas';

/**
 * Todas as tabelas do schema, inclusive as dormentes. Uma tabela esquecida aqui
 * é uma tabela que não volta no restore — por isso a lista é explícita e não
 * derivada de nada que possa mudar em silêncio.
 */
export const TABELAS = [
  'contas',
  'cartoes',
  'categorias',
  'transacoes',
  'faturas',
  'recorrencias',
  'modelos',
  'memoria_descricao',
  'config',
  'orcamentos',
  'metas',
  'importacoes',
  'perfis_importacao',
  'investimentos',
  'movimentacoes_investimento',
  'indexadores',
  'rendimentos',
  'aliquotas_ir',
  'feriados',
] as const;

export type Tabela = (typeof TABELAS)[number];

export type Exportacao = {
  gerado_em: string;
  versao_schema: string;
  tabelas: Record<string, unknown[]>;
  contagem: Record<string, number>;
};

export async function exportarTudo(): Promise<Exportacao> {
  const tabelas: Record<string, unknown[]> = {};
  const contagem: Record<string, number> = {};

  // Sequencial de propósito: são poucas tabelas e um lote paralelo grande no
  // plano gratuito só aumenta a chance de estourar limite no meio do backup.
  for (const tabela of TABELAS) {
    const { data, error } = await supabase.from(tabela).select('*');
    if (error) throw new Error(`Falha ao exportar ${tabela}: ${error.message}`);
    tabelas[tabela] = data ?? [];
    contagem[tabela] = (data ?? []).length;
  }

  return {
    gerado_em: new Date().toISOString(),
    versao_schema: '20260827120013',
    tabelas,
    contagem,
  };
}

/** Uma tabela em CSV, para abrir no Excel ou migrar um dia (§10.2). */
export function paraCSV(linhas: unknown[]): string {
  if (linhas.length === 0) return '';

  const colunas = [...new Set(linhas.flatMap((linha) => Object.keys(linha as object)))];
  const escapar = (valor: unknown): string => {
    if (valor === null || valor === undefined) return '';
    const texto = typeof valor === 'object' ? JSON.stringify(valor) : String(valor);
    return /[",;\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
  };

  const cabecalho = colunas.join(';');
  const corpo = linhas.map((linha) =>
    colunas.map((coluna) => escapar((linha as Record<string, unknown>)[coluna])).join(';'),
  );

  // Ponto e vírgula e BOM: é o que o Excel em português abre sem perguntar nada.
  return `﻿${[cabecalho, ...corpo].join('\n')}`;
}

export function baixarArquivo(nome: string, conteudo: string, tipo: string): void {
  const blob = new Blob([conteudo], { type: tipo });
  const url = URL.createObjectURL(blob);
  const ancora = document.createElement('a');
  ancora.href = url;
  ancora.download = nome;
  ancora.click();
  URL.revokeObjectURL(url);
}

export function nomeDoArquivo(extensao: string, sufixo = ''): string {
  return `financas-${hoje()}${sufixo ? `-${sufixo}` : ''}.${extensao}`;
}
