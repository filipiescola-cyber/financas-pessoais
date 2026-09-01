import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  formatarBR,
  hoje,
  primeiroDiaDoMes,
  somarMeses,
  ultimoDiaDoMes,
  type DataISO,
} from '../dominio/datas';
import { formatar } from '../dominio/dinheiro';
import {
  despesaPorNatureza,
  totalDeDespesas,
  totalDeReceitas,
  type TransacaoDeRelatorio,
} from '../dominio/relatorios';
import {
  passoEstaFeito,
  faltaramNoMes,
  progressoDoFechamento,
  type IdDoPasso,
  type PendenciasDoMes,
} from '../dominio/fechamento';
import { previstoDoMes } from '../dominio/previsto';
import { copiarOrcamentoDoMesAnterior } from '../dados/orcamentos';
import { listarFechamentos, salvarFechamento } from '../dados/fechamentos';
import { ocorrenciasDoPeriodo } from '../dados/geracaoRecorrencias';
import { baixarArquivo, exportarTudo, nomeDoArquivo } from '../dados/exportar';
import { usarContasComSaldo } from '../dados/usarContas';
import { usarCartoes } from '../dados/usarCartoes';
import { usarRecorrencias } from '../dados/usarModelos';
import { usarFeriados } from '../dados/usarFeriados';
import { naturezaEfetiva } from '../dominio/natureza';
import { usarCategorias, usarTransacoes } from '../dados/usarTransacoes';
import { usarAviso } from '../ui/Aviso';
import {
  ALVO_DE_TOQUE,
  Botao,
  Cartao,
  CartaoIndicador,
  Dinheiro,
  Nota,
  Pagina,
  Secao,
} from '../ui/base';

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

function nomeDoMes(data: DataISO): string {
  return `${MESES[Number(data.split('-')[1]) - 1]} de ${data.slice(0, 4)}`;
}

/**
 * Fechamento mensal (§8.7).
 *
 * "Ritual de 10 minutos, uma vez por mês. É o que mantém o app vivo depois que
 * o entusiasmo inicial passa. Sem esse ritual o app vira projeto abandonado no
 * mês 4."
 *
 * A tela é uma lista de passos, não um relatório: o objetivo é terminar, não
 * contemplar. Cada passo aponta para onde resolver e volta para cá.
 *
 * Três coisas que faltavam, e a primeira invalidava a própria ideia de ritual:
 *
 *   Os checks viviam só na memória do navegador. Fechar o app apagava tudo, e
 *   voltar no dia seguinte para terminar significava começar de novo.
 *
 *   Só dava para fechar o mês passado. Quem atrasasse dois meses não tinha como
 *   fechar o primeiro deles — e quem atrasa é justamente quem mais precisa.
 *
 *   Não havia registro nenhum, então a pergunta mais simples do ritual ficava
 *   sem resposta: quais meses eu já fechei?
 */
export function Fechamento() {
  const { mostrar } = usarAviso();
  const cliente = useQueryClient();

  // Abre no mês ANTERIOR: o corrente ainda vai mudar, e fechar o que não
  // terminou é fechar um número que muda depois.
  const [mes, setMes] = useState<DataISO>(primeiroDiaDoMes(somarMeses(hoje(), -1)));
  const mesNovo = primeiroDiaDoMes(somarMeses(mes, 1));
  const fimDoMes = ultimoDiaDoMes(mes);

  const fechamentos = useQuery({ queryKey: ['fechamentos'], queryFn: listarFechamentos });
  const registro = (fechamentos.data ?? []).find((f) => f.mes === mes) ?? null;
  const marcados = new Set(registro?.passos ?? []);

  const contas = usarContasComSaldo();
  const cartoes = usarCartoes();
  const categorias = usarCategorias(true);
  const recorrencias = usarRecorrencias();
  const feriados = usarFeriados();
  const doMes = usarTransacoes({ de: mes, ate: fimDoMes });

  const geradas = useQuery({
    queryKey: ['ocorrencias-geradas', 'fechamento', mes],
    queryFn: () => ocorrenciasDoPeriodo(mes, fimDoMes),
  });

  const naturezaDaCategoria = new Map((categorias.data ?? []).map((c) => [c.id, c.natureza]));

  const paraRelatorio: TransacaoDeRelatorio[] = (doMes.data ?? []).map((t) => ({
    valor: t.valor,
    tipo: t.tipo,
    dataCompetencia: t.dataCompetencia,
    categoriaId: t.categoriaId,
    natureza: naturezaEfetiva(t, {
      natureza: t.categoriaId ? (naturezaDaCategoria.get(t.categoriaId) ?? null) : null,
    }),
    transacaoPaiId: t.transacaoPaiId,
    temFilhas: false,
  }));

  const receitas = totalDeReceitas(paraRelatorio);
  const despesas = totalDeDespesas(paraRelatorio);
  const natureza = despesaPorNatureza(paraRelatorio);
  const sobra = receitas - despesas;

  const semCategoria = (doMes.data ?? []).filter(
    (t) => t.categoriaId === null && t.tipo !== 'transferencia',
  );

  const semConferencia = (contas.data ?? []).filter(
    (c) =>
      ['corrente', 'poupanca', 'carteira'].includes(c.tipo) &&
      (c.dataConferencia === null || c.dataConferencia < mes),
  );

  /**
   * Recorrência esperada que não aconteceu (§8.6).
   *
   * "Conta esquecida ou cobrança que sumiu." É o alerta que o fechamento estava
   * deixando passar: um mês fechado com o aluguel faltando parece um mês barato,
   * e o número errado entra na mediana que projeta os próximos.
   *
   * O "hoje" da conta é o ÚLTIMO DIA do mês fechado: dentro dele, tudo que não
   * foi gerado já deveria ter sido.
   *
   * Cobrança de CARTÃO fica de fora, e a distinção não é detalhe: a assinatura
   * de 10/08 não é conta esquecida em agosto — ela entra na fatura que vence em
   * setembro, e dinheiro nenhum devia ter saído no mês que se está fechando. O
   * corte é pelo caixa (§2.4), que é sobre o que o fechamento fala.
   */
  const faltaram = faltaramNoMes(
    recorrencias.data && geradas.data && cartoes.data
      ? previstoDoMes(
          recorrencias.data.map((r) => {
            const cartao = cartoes.data?.find((c) => c.contaId === r.contaId);

            return {
              id: r.id,
              contaId: r.contaId,
              descricao: r.descricao,
              tipo: r.tipo,
              valorPrevisto: r.valorPrevisto,
              dia: r.dia,
              regra: r.regra,
              comecaEm: r.comecaEm,
              terminaEm: r.terminaEm,
              incremento: r.incremento,
              cartao: cartao
                ? { diaFechamento: cartao.diaFechamento, diaVencimento: cartao.diaVencimento }
                : null,
            };
          }),
          geradas.data.geradas,
          mes,
          fimDoMes,
          feriados,
          geradas.data.puladas,
        )
      : [],
    fimDoMes,
  );

  const pendencias: PendenciasDoMes = {
    contasPorConferir: semConferencia.length,
    lancamentosSemCategoria: semCategoria.length,
    recorrenciasQueFaltaram: faltaram.length,
  };

  const progresso = progressoDoFechamento(marcados, pendencias);

  const salvar = useMutation({
    mutationFn: (passos: string[]) =>
      salvarFechamento({
        mes,
        passos,
        // O domínio é quem sabe se acabou: ele conhece a lista inteira,
        // inclusive os passos que os dados resolvem e que nunca entram aqui.
        concluido: progressoDoFechamento(new Set(passos), pendencias).concluido,
      }),
    onSuccess: () => cliente.invalidateQueries({ queryKey: ['fechamentos'] }),
  });

  const marcar = (passo: IdDoPasso) => {
    const proximo = new Set(marcados);
    proximo.has(passo) ? proximo.delete(passo) : proximo.add(passo);
    salvar.mutate([...proximo]);
  };

  const feito = (passo: IdDoPasso) => passoEstaFeito(passo, marcados, pendencias);

  const copiarOrcamento = useMutation({
    mutationFn: () => copiarOrcamentoDoMesAnterior(mesNovo, mes),
    onSuccess: async (quantidade) => {
      await cliente.invalidateQueries({ queryKey: ['orcamentos'] });
      if (!marcados.has('orcamento')) marcar('orcamento');
      mostrar(
        quantidade > 0
          ? `${quantidade} teto(s) copiado(s) para ${nomeDoMes(mesNovo)}.`
          : 'Não havia teto definido no mês anterior.',
      );
    },
  });

  const backup = useMutation({
    mutationFn: exportarTudo,
    onSuccess: (dados) => {
      baixarArquivo(nomeDoArquivo('json'), JSON.stringify(dados, null, 2), 'application/json');
      if (!marcados.has('backup')) marcar('backup');
      mostrar('Backup baixado.');
    },
  });

  const podeAvancar = mes < primeiroDiaDoMes(somarMeses(hoje(), -1));

  return (
    <Pagina
      titulo="Fechamento mensal"
      subtitulo={nomeDoMes(mes)}
      acao={
        <div className="flex items-center gap-1">
          <Botao tipo="secundario" aoClicar={() => setMes(somarMeses(mes, -1))} className="px-3">
            ‹
          </Botao>
          <Botao
            tipo="secundario"
            aoClicar={() => setMes(somarMeses(mes, 1))}
            desabilitado={!podeAvancar}
            className="px-3"
          >
            ›
          </Botao>
        </div>
      }
    >
      {/* Falha ao gravar precisa aparecer: um check que não pega e não explica
          é indistinguível de um botão que não funciona. */}
      {salvar.isError && (
        <Nota tom="atencao">
          Não deu para gravar o passo: {(salvar.error as Error).message}
        </Nota>
      )}

      <Nota tom={progresso.concluido ? 'positivo' : undefined}>
        {progresso.concluido ? (
          <>
            {nomeDoMes(mes)} está fechado
            {registro?.concluidoEm && ` desde ${formatarBR(registro.concluidoEm.slice(0, 10))}`}. É
            a repetição disto que mantém os números confiáveis.
          </>
        ) : (
          <>
            <strong>
              {progresso.feitos} de {progresso.total}
            </strong>{' '}
            — dez minutos, uma vez por mês. É o ritual que mantém o app vivo depois que o
            entusiasmo inicial passa, e o passo que mais decide se o projeto sobrevive ao mês 4.
            Dá para parar no meio: o que você marcar fica guardado.
          </>
        )}
      </Nota>

      <Passo
        numero={1}
        titulo="Conferir os saldos"
        porque="Sem integração bancária o saldo derrapa. Conferir é o que impede a diferença de virar bola de neve — e o único jeito de saber se falta lançamento."
        feito={feito('conferencia')}
        automatico={pendencias.contasPorConferir === 0}
        aoMarcar={() => marcar('conferencia')}
      >
        {semConferencia.length === 0 ? (
          <p className="text-sm text-slate-400">
            Todas as contas já foram conferidas com data dentro de {nomeDoMes(mes)} ou depois.
          </p>
        ) : (
          <>
            <p className="text-sm text-slate-400">
              {semConferencia.length} conta(s) sem conferência desde {nomeDoMes(mes)}:{' '}
              {semConferencia.map((c) => c.nome).join(', ')}.
            </p>
            <p className="text-xs leading-relaxed text-slate-600">
              Na conferência, escolha <strong>{formatarBR(fimDoMes)}</strong> como data — é o saldo
              que está no extrato deste mês. O de hoje já tem o que veio depois.
            </p>
            <Link to="/conferencia">
              <Botao tipo="secundario">Ir para a conferência</Botao>
            </Link>
          </>
        )}
      </Passo>

      <Passo
        numero={2}
        titulo="Revisar o que ficou sem categoria"
        porque="Lançamento sem categoria some do relatório por categoria — e é justamente esse relatório que mostra onde dá para cortar."
        feito={feito('categorias')}
        automatico={pendencias.lancamentosSemCategoria === 0}
        aoMarcar={() => marcar('categorias')}
      >
        {semCategoria.length === 0 ? (
          <p className="text-sm text-slate-400">Nada sem categoria no mês.</p>
        ) : (
          <>
            <p className="text-sm text-slate-400">
              {semCategoria.length} lançamento(s) sem categoria.
            </p>
            <ul className="space-y-1 text-xs text-slate-500">
              {semCategoria.slice(0, 5).map((t) => (
                <li key={t.id} className="flex justify-between gap-3">
                  <span className="truncate">
                    {formatarBR(t.dataCompetencia)} · {t.descricao || 'sem descrição'}
                  </span>
                  <Dinheiro centavos={t.valor} className="shrink-0" />
                </li>
              ))}
              {semCategoria.length > 5 && <li>E mais {semCategoria.length - 5}…</li>}
            </ul>
            <Link to="/transacoes">
              <Botao tipo="secundario">Ir para os lançamentos</Botao>
            </Link>
          </>
        )}
      </Passo>

      <Passo
        numero={3}
        titulo="O que era para ter acontecido e não aconteceu"
        porque="Um mês fechado com o aluguel faltando parece um mês barato — e o número errado entra na mediana que projeta os próximos."
        feito={feito('recorrencias')}
        automatico={pendencias.recorrenciasQueFaltaram === 0}
        aoMarcar={() => marcar('recorrencias')}
      >
        {faltaram.length === 0 ? (
          <p className="text-sm text-slate-400">
            Toda recorrência do mês virou lançamento. Nada esquecido.
          </p>
        ) : (
          <>
            <p className="text-sm text-slate-400">
              {faltaram.length} recorrência(s) venceram em {nomeDoMes(mes)} e não têm lançamento.
              Pode ser conta esquecida — ou cobrança que sumiu, que também é bom saber.
            </p>
            <ul className="space-y-1 text-xs text-slate-500">
              {faltaram.slice(0, 5).map((item) => (
                <li key={item.recorrenciaId} className="flex justify-between gap-3">
                  <span className="truncate">
                    {formatarBR(item.dataPrevista)} · {item.descricao}
                  </span>
                  {item.valor !== null && (
                    <Dinheiro
                      centavos={item.tipo === 'receita' ? item.valor : -item.valor}
                      className="shrink-0"
                    />
                  )}
                </li>
              ))}
              {faltaram.length > 5 && <li>E mais {faltaram.length - 5}…</li>}
            </ul>
            <Link to="/transacoes">
              <Botao tipo="secundario">Ver o mês e lançar</Botao>
            </Link>
          </>
        )}
      </Passo>

      <Passo
        numero={4}
        titulo={`Como foi ${nomeDoMes(mes)}`}
        porque="É a única parte do ritual que não é tarefa. Olhar o mês fechado é o que transforma lançamento em informação."
        feito={feito('resumo')}
        gravando={salvar.isPending}
        aoMarcar={() => marcar('resumo')}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <CartaoIndicador rotulo="Entrou" sotaque="verde" tamanho="medio" valor={formatar(receitas)} />
          <CartaoIndicador rotulo="Saiu" sotaque="ambar" tamanho="medio" valor={formatar(despesas)} />
        </div>

        <p className={`text-sm ${sobra < 0 ? 'text-amber-300' : 'text-slate-300'}`}>
          {sobra >= 0
            ? `Sobrou ${formatar(sobra)}.`
            : `Faltou ${formatar(Math.abs(sobra))} — o mês fechou no vermelho.`}
        </p>

        {/* Nunca um total único de despesa (§14): o número consolidado esconde
            exatamente a informação que interessa. */}
        <div className="grid gap-2 text-xs text-slate-500 sm:grid-cols-3">
          <span>fixas {formatar(natureza.fixa)}</span>
          <span>variáveis {formatar(natureza.variavel)}</span>
          <span>eventuais {formatar(natureza.eventual)}</span>
        </div>

        <p className="text-xs leading-relaxed text-slate-600">
          As <strong>fixas</strong> são o seu custo de vida mínimo: é quanto precisa entrar todo mês
          para nada atrasar. As <strong>variáveis</strong> são onde dá para cortar. As{' '}
          <strong>eventuais</strong> não são para cortar, são para provisionar — o IPVA de janeiro
          só parece um desastre quando não foi guardado ao longo do ano.
        </p>

        <Link to="/relatorios">
          <Botao tipo="secundario">Ver relatório completo</Botao>
        </Link>
      </Passo>

      <Passo
        numero={5}
        titulo={`Preparar ${nomeDoMes(mesNovo)}`}
        porque="Teto definido depois que o mês começou já nasce atrasado: metade do gasto aconteceu antes de existir referência."
        feito={feito('orcamento')}
        gravando={salvar.isPending}
        aoMarcar={() => marcar('orcamento')}
      >
        <p className="text-sm text-slate-400">
          Copiar os tetos do mês anterior evita redigitar tudo. Depois é só ajustar o que mudou —
          e lembrar das eventuais que caem no mês novo.
        </p>
        <div className="flex flex-wrap gap-2">
          <Botao
            tipo="secundario"
            aoClicar={() => copiarOrcamento.mutate()}
            desabilitado={copiarOrcamento.isPending}
          >
            {copiarOrcamento.isPending ? 'Copiando…' : `Copiar os tetos de ${nomeDoMes(mes)}`}
          </Botao>
          <Link to="/orcamento">
            <Botao tipo="secundario">Ajustar tetos</Botao>
          </Link>
        </div>
      </Passo>

      <Passo
        numero={6}
        titulo="Backup"
        porque="Backup nunca restaurado não é backup, é esperança. Um arquivo por mês, guardado fora do computador, é o que separa perder o histórico de perder um mês."
        feito={feito('backup')}
        gravando={salvar.isPending}
        aoMarcar={() => marcar('backup')}
      >
        <p className="text-sm text-slate-400">
          Baixa tudo em JSON: contas, lançamentos, faturas, investimentos, dívidas. É também a rede
          de segurança de qualquer mudança futura no banco.
        </p>
        <Botao tipo="secundario" aoClicar={() => backup.mutate()} desabilitado={backup.isPending}>
          {backup.isPending ? 'Exportando…' : 'Baixar backup em JSON'}
        </Botao>
      </Passo>

      <HistoricoDeFechamentos
        fechamentos={fechamentos.data ?? []}
        mesAtual={mes}
        aoEscolher={setMes}
      />
    </Pagina>
  );
}

/**
 * Quais meses já foram fechados.
 *
 * A pergunta mais simples do ritual, e a que não tinha resposta: sem registro
 * nenhum, "eu fechei julho?" só se respondia pela memória. E memória é
 * exatamente o que um ritual mensal não pode exigir.
 */
function HistoricoDeFechamentos({
  fechamentos,
  mesAtual,
  aoEscolher,
}: {
  fechamentos: readonly { mes: DataISO; passos: string[]; concluidoEm: string | null }[];
  mesAtual: DataISO;
  aoEscolher: (mes: DataISO) => void;
}) {
  if (fechamentos.length === 0) {
    return (
      <Secao titulo="Histórico">
        <p className="text-sm text-slate-500">
          Nenhum mês fechado ainda. Assim que você marcar o primeiro passo, este mês aparece aqui —
          e daí em diante dá para ver de relance quais ficaram para trás.
        </p>
      </Secao>
    );
  }

  return (
    <Secao titulo="Histórico">
      <Cartao className="overflow-hidden">
        <ul className="divide-y divide-borda">
          {fechamentos.map((f) => (
            <li key={f.mes}>
              <button
                onClick={() => aoEscolher(f.mes)}
                className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-superficie-alta ${ALVO_DE_TOQUE} ${
                  f.mes === mesAtual ? 'bg-superficie-alta' : ''
                }`}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm text-slate-200">{nomeDoMes(f.mes)}</span>
                  <span className="block truncate text-xs text-slate-500">
                    {f.concluidoEm
                      ? `fechado em ${formatarBR(f.concluidoEm.slice(0, 10))}`
                      : `${f.passos.length} passo(s) marcado(s) — em aberto`}
                  </span>
                </span>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] ${
                    f.concluidoEm
                      ? 'bg-emerald-950/40 text-emerald-300'
                      : 'bg-amber-950/30 text-amber-300/80'
                  }`}
                >
                  {f.concluidoEm ? '✓ fechado' : 'em aberto'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Cartao>
    </Secao>
  );
}

function Passo({
  numero,
  titulo,
  porque,
  feito,
  automatico = false,
  gravando = false,
  aoMarcar,
  children,
}: {
  numero: number;
  titulo: string;
  /** Por que o passo existe. Sem isso ele vira uma tarefa a cumprir sem motivo. */
  porque: string;
  feito: boolean;
  /** Resolvido pelos dados, não por um clique: o check fica travado e explicado. */
  automatico?: boolean;
  gravando?: boolean;
  aoMarcar: () => void;
  children: React.ReactNode;
}) {
  // `null` enquanto ninguém tocou: aí o passo acompanha o estado dele. Um
  // booleano inicializado com `!feito` congelaria o valor do primeiro render —
  // que é ANTES de os dados chegarem, quando nada está feito ainda.
  const [aberto, setAberto] = useState<boolean | null>(null);
  const expandido = aberto ?? !feito;

  return (
    <Secao>
      <Cartao className={`p-4 ${feito ? 'opacity-70' : ''}`}>
        <div className="flex items-start gap-3">
          <button
            onClick={aoMarcar}
            aria-pressed={feito}
            title={
              automatico
                ? 'Este passo se resolve sozinho quando não sobra pendência — não precisa de check.'
                : 'Marcar como feito'
            }
            className={`-m-2 mt-[-2px] flex h-10 w-10 shrink-0 items-center justify-center p-2 ${ALVO_DE_TOQUE}`}
          >
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full border text-xs transition ${
                feito
                  ? 'border-emerald-600 bg-emerald-600 text-white'
                  : 'border-borda-forte text-slate-500'
              }`}
            >
              {feito ? '✓' : numero}
            </span>
          </button>
          <div className="min-w-0 flex-1 space-y-3">
            <button
              onClick={() => setAberto(!expandido)}
              className="flex w-full items-start justify-between gap-3 text-left"
            >
              <h2
                className={`font-medium ${feito ? 'text-slate-400 line-through' : 'text-slate-100'}`}
              >
                {titulo}
              </h2>
              <span className="shrink-0 pt-1 text-xs text-slate-600">
                {expandido ? '−' : '+'}
              </span>
            </button>

            {expandido && (
              <>
                {/* O "por quê" fica junto do passo, não num manual à parte: um
                    ritual que não se explica vira tarefa, e tarefa se abandona. */}
                <p className="text-xs leading-relaxed text-slate-600">{porque}</p>
                {children}

                {/* O círculo numerado não parece um check, e ninguém o
                    encontrava depois de ler o passo. O botão fica onde a
                    leitura termina, que é onde a decisão é tomada. */}
                {!automatico && (
                  <button
                    onClick={aoMarcar}
                    disabled={gravando}
                    className={`text-xs transition ${ALVO_DE_TOQUE} ${
                      feito
                        ? 'text-slate-500 hover:text-slate-300'
                        : 'text-emerald-400 hover:text-emerald-300'
                    }`}
                  >
                    {gravando ? 'Salvando…' : feito ? '↩︎ Desmarcar' : '✓ Marcar como feito'}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </Cartao>
    </Secao>
  );
}
