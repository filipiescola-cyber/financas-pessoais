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
import { TABELAS, VERSAO_DO_SCHEMA, type Tabela } from './tabelas';

export { TABELAS, type Tabela } from './tabelas';



export type Exportacao = {
  gerado_em: string;
  versao_schema: string;
  tabelas: Record<string, unknown[]>;
  contagem: Record<string, number>;
  /**
   * Tabelas da lista que ainda não existem no banco.
   *
   * Acontece entre um deploy e o `db push` que o acompanha: o código já conhece
   * a tabela nova e o banco ainda não. Fica registrado NO ARQUIVO, e não só na
   * tela, porque quem for restaurar precisa saber que a ausência foi conhecida
   * e não um pedaço perdido.
   */
  ausentes: string[];
};

/**
 * Quantas linhas por ida ao banco.
 *
 * O PostgREST tem um teto de linhas por resposta (`db.max_rows`, mil por
 * padrão no Supabase) e ele não dá erro: devolve as primeiras mil e cala.
 * Um `select('*')` sem página, portanto, gera um backup TRUNCADO que parece
 * completo — o arquivo baixa, o JSON abre, a contagem mostra um número
 * plausível, e a falta só aparece no restore, que é quando não dá mais para
 * consertar. É o pior modo de falha possível para a rede de segurança do
 * §10.2, e o §14 já avisa: não confiar em backup que você nunca restaurou.
 *
 * Quinhentas por página fica abaixo de qualquer teto praticado e mantém a
 * resposta pequena o bastante para o plano gratuito.
 */
const POR_PAGINA = 500;

/**
 * Uma tabela inteira, página a página.
 *
 * A ordem por `ctid` não existe no PostgREST, então a paginação usa `range`
 * puro. Sem ordenação estável duas páginas poderiam repetir ou pular linha se
 * alguém escrevesse no meio do backup — por isso ordena por uma coluna que
 * toda tabela tem. Nem todas têm `id` (as de chave composta), e aí sobra a
 * ordem natural mesmo: o backup é disparado por quem está na frente do app,
 * não concorre com ninguém.
 */
async function baixarTabela(tabela: Tabela): Promise<unknown[] | null> {
  const linhas: unknown[] = [];

  for (let pagina = 0; ; pagina += 1) {
    const de = pagina * POR_PAGINA;
    const { data, error } = await supabase
      .from(tabela)
      .select('*')
      .range(de, de + POR_PAGINA - 1);

    /*
      Tabela que ainda não existe não derruba o backup inteiro.

      A lista de tabelas vive no código e o schema vive no banco, e entre um
      deploy e o `db push` que o acompanha os dois ficam um passo fora de fase.
      Abortar aí transforma "falta uma tabela vazia" em "você não tem backup" —
      e logo na hora em que o backup mais importa, que é justamente antes de
      rodar a migration (§13.6).

      Só a ausência é tolerada. Erro de permissão, de rede ou de RLS continua
      subindo: esses significam que a tabela EXISTE e não veio, o que é um
      backup furado se passar batido.
    */
    if (error && naoExiste(error)) return null;
    if (error) throw new Error(`Falha ao exportar ${tabela}: ${error.message}`);

    const lote = data ?? [];
    linhas.push(...lote);

    // Lote incompleto significa fim da tabela. Lote cheio pode ser o fim exato,
    // e aí a próxima volta vem vazia e encerra — uma ida a mais custa menos que
    // um backup faltando linha.
    if (lote.length < POR_PAGINA) break;
  }

  return linhas;
}

/** O PostgREST responde PGRST205 quando a tabela não está no schema. */
function naoExiste(erro: { code?: string; message?: string }): boolean {
  return (
    erro.code === 'PGRST205' ||
    erro.code === '42P01' ||
    /could not find the table|does not exist/i.test(erro.message ?? '')
  );
}

export async function exportarTudo(): Promise<Exportacao> {
  const tabelas: Record<string, unknown[]> = {};
  const contagem: Record<string, number> = {};
  const ausentes: string[] = [];

  // Sequencial de propósito: são poucas tabelas e um lote paralelo grande no
  // plano gratuito só aumenta a chance de estourar limite no meio do backup.
  for (const tabela of TABELAS) {
    const linhas = await baixarTabela(tabela);

    if (linhas === null) {
      ausentes.push(tabela);
      continue;
    }

    tabelas[tabela] = linhas;
    contagem[tabela] = linhas.length;
  }

  return {
    gerado_em: new Date().toISOString(),
    versao_schema: VERSAO_DO_SCHEMA,
    tabelas,
    contagem,
    ausentes,
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

  /*
    A âncora precisa estar NO documento e a URL precisa sobreviver ao clique.

    Fora do DOM, o clique não dispara download em parte dos navegadores; e
    revogar a URL na linha seguinte cancela o download que acabou de começar,
    porque o navegador ainda não leu o blob. Nos dois casos o botão de backup
    não faz nada e não explica — o pior jeito de falhar para a função que
    existe justamente para o dia em que tudo der errado (§10.2).
  */
  ancora.style.display = 'none';
  document.body.appendChild(ancora);
  ancora.click();
  document.body.removeChild(ancora);
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function nomeDoArquivo(extensao: string, sufixo = ''): string {
  return `financas-${hoje()}${sufixo ? `-${sufixo}` : ''}.${extensao}`;
}
