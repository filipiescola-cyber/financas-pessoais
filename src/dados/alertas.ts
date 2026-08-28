// Coleta do que os alertas precisam (§8.6).
//
// A decisão de alertar mora em `dominio/alertas.ts` e é testada lá. Aqui é só
// buscar o estado atual — e cada consulta é barata de propósito: isto roda na
// abertura, e alerta que deixa o app lento vira alerta desligado.

import { paraCentavos } from '../dominio/dinheiro';
import { hoje, primeiroDiaDoMes, somarMeses, ultimoDiaDoMes, type DataISO } from '../dominio/datas';
import { gastoPorCategoria, type TransacaoDeRelatorio } from '../dominio/relatorios';
import { mereceAlerta, progressoDoOrcamento } from '../dominio/orcamento';
import { primeiroMesNegativo, projetarFluxo } from '../dominio/projecao';
import type { EntradaDosAlertas } from '../dominio/alertas';
import { listarOrcamentos } from './orcamentos';
import { montarDadosDaProjecao } from './projecao';
import { supabase } from './supabase';

export async function montarEntradaDosAlertas(
  referencia: DataISO = hoje(),
): Promise<EntradaDosAlertas> {
  const mes = primeiroDiaDoMes(referencia);

  const [projecao, orcamentos, categorias, transacoesDoMes, faturas, recorrencias, contas] =
    await Promise.all([
      montarDadosDaProjecao(referencia),
      listarOrcamentos(mes),
      supabase.from('categorias').select('id, nome'),
      supabase
        .from('transacoes')
        .select('valor, tipo, data_competencia, categoria_id, transacao_pai_id')
        .gte('data_competencia', mes)
        .lte('data_competencia', ultimoDiaDoMes(mes)),
      supabase
        .from('faturas')
        .select('cartao_id, data_fechamento, valor_total, status')
        .eq('status', 'aberta'),
      supabase.from('recorrencias').select('id, descricao, dia').eq('ativo', true),
      supabase
        .from('contas')
        .select('id, nome, tipo, data_conferencia')
        .eq('ativo', true),
    ]);

  // --- projeção ficando negativa ----------------------------------------
  const fluxo = projetarFluxo(
    {
      saldoAtual: projecao.saldoAtual,
      aPartirDe: mes,
      horizonteEmMeses: 12,
      renda: projecao.renda,
      fixasMensais: projecao.fixasMensais,
      provisaoEventualMensal: projecao.provisaoEventualMensal,
      medianaDasVariaveis: projecao.medianaDasVariaveis,
      jaLancadoPorMes: projecao.jaLancadoPorMes,
    },
    // O alerta usa o cenário pessimista: é o que o §8.3 manda olhar para
    // decidir, e um aviso baseado no cenário bom chegaria tarde demais.
    'pessimista',
  );
  const negativo = primeiroMesNegativo(fluxo);

  // --- orçamentos estourando --------------------------------------------
  const nomeCategoria = new Map((categorias.data ?? []).map((c) => [c.id, c.nome]));

  const paraRelatorio: TransacaoDeRelatorio[] = (transacoesDoMes.data ?? []).map((t) => ({
    valor: paraCentavos(t.valor),
    tipo: t.tipo as TransacaoDeRelatorio['tipo'],
    dataCompetencia: t.data_competencia,
    categoriaId: t.categoria_id,
    natureza: null,
    transacaoPaiId: t.transacao_pai_id,
    temFilhas: false,
  }));

  const realizado = new Map(
    gastoPorCategoria(paraRelatorio).map((f) => [f.categoriaId, f.total]),
  );

  const orcamentosEstourando = orcamentos
    .map((orcamento) => {
      const progresso = progressoDoOrcamento(
        orcamento.valorPlanejado,
        realizado.get(orcamento.categoriaId) ?? 0,
        referencia,
      );
      return { orcamento, progresso };
    })
    .filter(({ progresso }) => mereceAlerta(progresso, referencia))
    .map(({ orcamento, progresso }) => ({
      nome: nomeCategoria.get(orcamento.categoriaId) ?? 'Categoria',
      proporcao: progresso.proporcaoGasta,
    }));

  // --- faturas fechando --------------------------------------------------
  // A média vem das faturas já fechadas do mesmo cartão: sem base de comparação
  // não dá para dizer que uma fatura está cara.
  const { data: fechadas } = await supabase
    .from('faturas')
    .select('cartao_id, valor_total')
    .in('status', ['fechada', 'paga']);

  const somaPorCartao = new Map<string, { total: number; quantidade: number }>();
  for (const fatura of fechadas ?? []) {
    const atual = somaPorCartao.get(fatura.cartao_id) ?? { total: 0, quantidade: 0 };
    somaPorCartao.set(fatura.cartao_id, {
      total: atual.total + Math.abs(paraCentavos(fatura.valor_total)),
      quantidade: atual.quantidade + 1,
    });
  }

  const { data: cartoes } = await supabase.from('cartoes').select('conta_id');
  const nomesDeCartao = new Map<string, string>();
  if (cartoes && cartoes.length > 0) {
    const { data: contasDeCartao } = await supabase
      .from('contas')
      .select('id, nome')
      .in('id', cartoes.map((c) => c.conta_id));
    for (const conta of contasDeCartao ?? []) nomesDeCartao.set(conta.id, conta.nome);
  }

  const faturasFechando = (faturas.data ?? []).map((fatura) => {
    const media = somaPorCartao.get(fatura.cartao_id);
    return {
      nome: nomesDeCartao.get(fatura.cartao_id) ?? 'Cartão',
      dataFechamento: fatura.data_fechamento,
      valor: Math.abs(paraCentavos(fatura.valor_total)),
      media: media && media.quantidade > 0 ? Math.round(media.total / media.quantidade) : 0,
    };
  });

  // --- recorrência que não aconteceu -------------------------------------
  const { data: geradas } = await supabase
    .from('transacoes')
    .select('recorrencia_id')
    .gte('data_competencia', mes)
    .lte('data_competencia', ultimoDiaDoMes(mes))
    .not('recorrencia_id', 'is', null);

  const jaGeradas = new Set((geradas ?? []).map((t) => t.recorrencia_id));
  const diaDeHoje = Number(referencia.split('-')[2]);

  const recorrenciasFaltando = (recorrencias.data ?? [])
    // Só o que já passou do dia esperado, com folga de 2 dias: cobrar no próprio
    // dia geraria alerta para conta que ainda vai cair à noite.
    .filter((r) => r.dia + 2 < diaDeHoje && !jaGeradas.has(r.id))
    .map((r) => ({ descricao: r.descricao, diaEsperado: r.dia }));

  // --- conta Empresa ------------------------------------------------------
  const contaEmpresa = (contas.data ?? []).find((c) => c.tipo === 'empresa');
  const historicoDaEmpresa: number[] = [];

  if (contaEmpresa) {
    const { data: movimentos } = await supabase
      .from('transacoes')
      .select('valor, data_caixa')
      .eq('conta_id', contaEmpresa.id)
      .lte('data_caixa', referencia)
      .order('data_caixa');

    let acumulado = 0;
    const porMes = new Map<string, number>();
    for (const movimento of movimentos ?? []) {
      acumulado += paraCentavos(movimento.valor);
      porMes.set(movimento.data_caixa.slice(0, 7), acumulado);
    }

    // Últimos 4 meses fechados, para ter inclinação em vez de ponto solto.
    for (let i = 3; i >= 0; i -= 1) {
      const alvo = somarMeses(mes, -i).slice(0, 7);
      const anterior = historicoDaEmpresa[historicoDaEmpresa.length - 1] ?? 0;
      historicoDaEmpresa.push(porMes.get(alvo) ?? anterior);
    }
  }

  return {
    hoje: referencia,
    mesNegativo: negativo ? { mes: negativo.mes, saldo: negativo.saldoFinal } : null,
    orcamentosEstourando,
    faturasFechando,
    recorrenciasFaltando,
    historicoDaEmpresa,
    contasSemConferencia: (contas.data ?? [])
      .filter((c) => ['corrente', 'poupanca', 'carteira'].includes(c.tipo))
      .map((c) => ({ nome: c.nome, ultimaConferencia: c.data_conferencia })),
  };
}
