import type { ReactNode } from 'react';
import {
  IconeAtalhos,
  IconeCartoes,
  IconeCategorias,
  IconeConferencia,
  IconeContas,
  IconeDados,
  IconeDividas,
  IconeFaturas,
  IconeFechamento,
  IconeFluxo,
  IconeImportar,
  IconeInicio,
  IconeInvestimentos,
  IconeLancamentos,
  IconeLote,
  IconeMetas,
  IconeOrcamento,
  IconeRelatorios,
  IconeSimulador,
} from './icones';

export type ItemDeNavegacao = {
  para: string;
  rotulo: string;
  /** Uma linha dizendo o que a tela responde. Aparece no "Mais" do celular. */
  descricao: string;
  icone: (p: { className?: string }) => ReactNode;
};

export type GrupoDeNavegacao = { titulo: string; itens: ItemDeNavegacao[] };

const INICIO: ItemDeNavegacao = {
  para: '/',
  rotulo: 'Início',
  descricao: 'Saldo, o que falta entrar e os alertas do mês',
  icone: IconeInicio,
};

const LANCAMENTOS: ItemDeNavegacao = {
  para: '/transacoes',
  rotulo: 'Lançamentos',
  descricao: 'A lista do mês, com saldo dia a dia',
  icone: IconeLancamentos,
};

const CONTAS: ItemDeNavegacao = {
  para: '/contas',
  rotulo: 'Contas',
  descricao: 'Onde o dinheiro está, e quanto',
  icone: IconeContas,
};

/**
 * A navegação inteira, em um lugar só.
 *
 * Antes eram duas listas — uma na barra lateral, outra na tela "Mais" — com os
 * mesmos itens em ordens diferentes. Duas listas da mesma coisa divergem: é só
 * questão de qual das duas alguém lembra de atualizar.
 *
 * Os grupos respondem a perguntas, não a categorias de software. "onde está" e
 * "para onde vai" são as duas metades da pergunta que o app existe para
 * responder, e nessa ordem: o presente antes do futuro.
 */
export const GRUPOS: GrupoDeNavegacao[] = [
  {
    titulo: 'lançar',
    itens: [
      LANCAMENTOS,
      {
        para: '/lote',
        rotulo: 'Em lote',
        descricao: 'Vários de uma vez, em tabela',
        icone: IconeLote,
      },
      {
        para: '/importar',
        rotulo: 'Importar',
        descricao: 'OFX de conta corrente, com conciliação',
        icone: IconeImportar,
      },
    ],
  },
  {
    titulo: 'onde está',
    itens: [
      CONTAS,
      {
        para: '/cartoes',
        rotulo: 'Cartões',
        descricao: 'Fechamento, vencimento e limite',
        icone: IconeCartoes,
      },
      {
        para: '/faturas',
        rotulo: 'Faturas',
        descricao: 'Fatura por mês, compras e pagamento',
        icone: IconeFaturas,
      },
      {
        para: '/investimentos',
        rotulo: 'Investimentos',
        descricao: 'Rendimento diário, bruto x líquido',
        icone: IconeInvestimentos,
      },
      {
        para: '/dividas',
        rotulo: 'Dívidas',
        descricao: 'Saldo devedor, juros e mês da quitação',
        icone: IconeDividas,
      },
    ],
  },
  {
    titulo: 'para onde vai',
    itens: [
      {
        para: '/fluxo',
        rotulo: 'Fluxo de caixa',
        descricao: 'Projeção de 12 meses em três cenários',
        icone: IconeFluxo,
      },
      {
        para: '/simulador',
        rotulo: 'Simulador',
        descricao: 'O que uma compra faz com os próximos meses',
        icone: IconeSimulador,
      },
      {
        para: '/orcamento',
        rotulo: 'Orçamento',
        descricao: 'Teto por categoria, planejado x realizado',
        icone: IconeOrcamento,
      },
      {
        para: '/metas',
        rotulo: 'Metas',
        descricao: 'Objetivos e meses de custo fixo cobertos',
        icone: IconeMetas,
      },
    ],
  },
  {
    titulo: 'fechar o mês',
    itens: [
      {
        para: '/conferencia',
        rotulo: 'Conferência',
        descricao: 'O que o banco diz x o que o app diz',
        icone: IconeConferencia,
      },
      {
        para: '/fechamento',
        rotulo: 'Fechamento',
        descricao: 'O ritual de 10 minutos, uma vez por mês',
        icone: IconeFechamento,
      },
      {
        para: '/relatorios',
        rotulo: 'Relatórios',
        descricao: 'Por categoria, por natureza e evolução mensal',
        icone: IconeRelatorios,
      },
    ],
  },
  {
    titulo: 'ajustes',
    itens: [
      {
        para: '/atalhos',
        rotulo: 'Atalhos',
        descricao: 'Modelos e recorrências',
        icone: IconeAtalhos,
      },
      {
        para: '/categorias',
        rotulo: 'Categorias',
        descricao: 'Natureza fixa, variável e eventual',
        icone: IconeCategorias,
      },
      {
        para: '/dados',
        rotulo: 'Dados',
        descricao: 'Backup e exportação em JSON e CSV',
        icone: IconeDados,
      },
    ],
  },
];

/** Início não entra em grupo nenhum: é o destino padrão, não uma categoria. */
export const PRIMEIRO = INICIO;

/**
 * No celular só cabem quatro abas; o resto vive atrás de "Mais".
 *
 * São as três telas do uso diário — ver como está, ver o mês, ver as contas.
 * Tudo o mais é semanal ou mensal, e uma aba a mais só encolheria estas.
 */
export const ABAS_DO_CELULAR: ItemDeNavegacao[] = [INICIO, LANCAMENTOS, CONTAS];

/** O que o "Mais" precisa listar: tudo que não está a um toque na barra. */
export function gruposForaDasAbas(): GrupoDeNavegacao[] {
  const nasAbas = new Set(ABAS_DO_CELULAR.map((item) => item.para));
  return GRUPOS.map((grupo) => ({
    titulo: grupo.titulo,
    itens: grupo.itens.filter((item) => !nasAbas.has(item.para)),
  })).filter((grupo) => grupo.itens.length > 0);
}
