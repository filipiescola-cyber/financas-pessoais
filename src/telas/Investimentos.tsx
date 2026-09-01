import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatarBR, hoje, somarDias, type DataISO } from '../dominio/datas';
import { formatar, type Centavos } from '../dominio/dinheiro';
import type { Indexador } from '../dominio/rendimento';
import {
  arquivarInvestimento,
  resgatarInvestimento,
  atualizarSaldoManual,
  calcularTodos,
  conferirInvestimento,
  aportarEmInvestimento,
  listarMovimentosDe,
  atualizarInvestimento,
  excluirInvestimento,
  previaDaExclusao,
  criarInvestimento,
  criarInvestimentoPorCotacao,
  registrarRecebimento,
  atualizarCotacao,
  venderUnidades,
  type Investimento,
  desarquivarInvestimento,
  listarInvestimentos,
  ROTULO_TIPO,
  TIPOS_ISENTOS,
  TIPOS_SEM_CALCULO,
  type InvestimentoCalculado,
  type TipoDeInvestimento,
} from '../dados/investimentos';
import {
  atualizarFeriados,
  atualizarIndexadores,
  registrarTaxaManual,
  taxasVigentes,
} from '../dados/indicadores';
import { CampoValor } from '../ui/CampoValor';
import { ChipsDeConta } from '../ui/ChipsDeConta';
import { usarInvalidarTransacoes } from '../dados/usarInvalidacao';
import {
  contasDaVenda,
  valorEmReais,
  type PosicaoPorCotacao,
} from '../dominio/cotacao';
import { usarContas } from '../dados/usarContas';
import { podePagarFatura } from '../dominio/saldo';
import {
  organizarCarteira,
  type Agrupamento,
  type Ordenacao,
} from '../dominio/carteira';
import { usarAviso } from '../ui/Aviso';
import { ALVO_DE_TOQUE, Botao, Campo, Cartao, CartaoIndicador, Chip, Dinheiro, ENTRADA, Nota, Pagina, Secao, Vazio } from '../ui/base';
import { CampoInstituicao } from '../ui/CampoInstituicao';
import { usarAcaoDaPagina } from '../ui/AcaoDaPagina';

const TIPOS: TipoDeInvestimento[] = [
  'cdb',
  'rdb',
  'tesouro',
  'lci',
  'lca',
  'poupanca',
  'fundo',
  'acoes',
  'cripto',
  'outro',
];

/**
 * Investimentos (§7).
 *
 * A regra que atravessa a tela: o valor calculado é ESTIMATIVA, não saldo real
 * (§14). O número verdadeiro é o do banco, e a conferência existe porque passar
 * meses acreditando num número inventado é o pior modo de falha desta parte.
 */
export function Investimentos() {
  const [criando, setCriando] = useState(false);

  // O "+" da tela abre esta ficha, não a folha de lançamento (§5.1).
  usarAcaoDaPagina('Nova aplicação', () => setCriando(true));
  const investimentos = useQuery({ queryKey: ['investimentos'], queryFn: () => calcularTodos() });
  const [agrupamento, setAgrupamento] = useState<Agrupamento>('instituicao');
  const [ordenacao, setOrdenacao] = useState<Ordenacao>('valor');

  const arquivados = useQuery({
    queryKey: ['investimentos', 'arquivados'],
    queryFn: () => listarInvestimentos(true).then((tudo) => tudo.filter((i) => !i.ativo)),
  });
  const taxas = useQuery({ queryKey: ['taxas'], queryFn: taxasVigentes });

  const lista = investimentos.data ?? [];
  const totalBruto = lista.reduce((soma, i) => soma + i.saldoExibido, 0);
  const totalLiquido = lista.reduce(
    (soma, i) => soma + (i.resultado?.saldoLiquido ?? i.saldoExibido),
    0,
  );
  // Principal vivo, não `valorAplicado`: com aporte novo e resgate parcial o
  // valor da primeira aplicação deixou de ser o que está aplicado hoje.
  const totalAplicado = lista.reduce((soma, i) => soma + i.aplicado, 0);

  const semTaxa = lista.some(
    (i) => i.investimento.calculoAutomatico && i.resultado?.taxaAnualUsada === null,
  );

  return (
    <Pagina
      titulo="Investimentos"
      subtitulo="Rendimento estimado, não saldo real"
      acao={
        <Botao aoClicar={() => setCriando((v) => !v)} tipo={criando ? 'secundario' : 'primario'}>
          {criando ? 'Cancelar' : 'Nova aplicação'}
        </Botao>
      }
    >
      <Indicadores />

      {semTaxa && (
        <Nota tom="atencao">
          Alguma aplicação depende de um indexador sem taxa registrada, então ela aparece valendo o
          que foi aplicado. Atualize a taxa acima — automaticamente ou na mão — para o cálculo
          começar a valer.
        </Nota>
      )}

      {criando && <FormularioDeInvestimento aoTerminar={() => setCriando(false)} />}

      {investimentos.isPending && <p className="text-slate-400">Calculando…</p>}

      {investimentos.isSuccess && lista.length === 0 && !criando && (
        <Vazio
          titulo="Nenhuma aplicação cadastrada"
          descricao="O app calcula o rendimento dia a dia a partir da taxa e da data. Renda variável não tem fórmula: nesse caso você atualiza o saldo na mão."
          acao={<Botao aoClicar={() => setCriando(true)}>Cadastrar a primeira</Botao>}
        />
      )}

      {lista.length > 0 && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <CartaoIndicador rotulo="Aplicado" sotaque="neutro" tamanho="medio" valor={formatar(totalAplicado)} />
            <CartaoIndicador
              rotulo="Bruto estimado"
              sotaque="azul"
              tamanho="medio"
              valor={formatar(totalBruto)}
              detalhe="O bruto anima."
            />
            <CartaoIndicador
              rotulo="Líquido estimado"
              sotaque="verde"
              tamanho="medio"
              valor={formatar(totalLiquido)}
              detalhe="É o que você recebe se resgatar hoje. Já com IR e IOF descontados."
            />
          </div>

          <Secao titulo="Aplicações">
            <ControlesDaCarteira
              agrupamento={agrupamento}
              ordenacao={ordenacao}
              aoAgrupar={setAgrupamento}
              aoOrdenar={setOrdenacao}
            />

            <div className="space-y-4">
              {organizarCarteira(
                lista.map((item) => ({
                  chave: item.investimento.id,
                  item,
                  nome: item.investimento.nome,
                  instituicao: item.investimento.instituicao,
                  tipo: item.investimento.tipo,
                  vencimento: item.investimento.vencimento,
                  saldo: item.saldoExibido,
                })),
                agrupamento,
                ordenacao,
                (tipo) => ROTULO_TIPO[tipo as TipoDeInvestimento] ?? tipo,
              ).map((grupo) => (
                <div key={grupo.titulo || 'tudo'} className="space-y-2">
                  {grupo.titulo !== '' && (
                    <div className="flex items-baseline justify-between gap-3 px-1">
                      <span className="text-[11px] uppercase tracking-wider text-slate-500">
                        {grupo.titulo}
                      </span>
                      <span className="text-xs text-slate-500">
                        {grupo.itens.length} · <Dinheiro centavos={grupo.total} className="text-slate-400" />
                      </span>
                    </div>
                  )}

                  {grupo.itens.map(({ chave, item }) => (
                    <LinhaDeInvestimento key={chave} item={item} />
                  ))}
                </div>
              ))}
            </div>
          </Secao>
        </>
      )}

      {(arquivados.data ?? []).length > 0 && (
        <Secao titulo="Arquivados">
          <Cartao>
            <ul className="divide-y divide-borda">
              {(arquivados.data ?? []).map((inv) => (
                <LinhaArquivada key={inv.id} id={inv.id} nome={inv.nome} tipo={inv.tipo} />
              ))}
            </ul>
          </Cartao>
          <p className="text-xs leading-relaxed text-slate-600">
            Aplicação arquivada sai do patrimônio e da lista, mas o histórico dela continua inteiro
            — nada foi apagado.
          </p>
        </Secao>
      )}

      <Nota tom="atencao">
        Tudo aqui é estimativa até ser conferido. O número real é o do banco ou da corretora —
        confira de vez em quando, porque meses acreditando num número inventado é o erro mais caro
        desta tela.
      </Nota>

      {taxas.data && taxas.data.size > 0 && (
        <p className="text-xs text-slate-600">
          Taxas em uso:{' '}
          {[...taxas.data.values()]
            .map((t) => `${t.nome} ${t.taxaAnual}% (desde ${formatarBR(t.vigenteDesde)})`)
            .join(' · ')}
          . A taxa nova vale daqui para frente; o passado nunca é recalculado.
        </p>
      )}
    </Pagina>
  );
}

/** Feriados e taxas: o que o §9 chama de acelerador, nunca de dependência. */
function Indicadores() {
  const cliente = useQueryClient();
  const { mostrar } = usarAviso();
  const [taxaManual, setTaxaManual] = useState('');
  const [mostrandoManual, setMostrandoManual] = useState(false);

  const buscarFeriados = useMutation({
    // O ano que vem junto: um parcelamento ou um vencimento de janeiro já
    // precisa do calendário do ano seguinte.
    mutationFn: async () => {
      const ano = new Date().getFullYear();
      const atual = await atualizarFeriados(ano);
      const proximo = await atualizarFeriados(ano + 1);
      return {
        ...atual,
        mensagem: atual.ok && proximo.ok
          ? `Feriados de ${ano} e ${ano + 1} atualizados.`
          : atual.mensagem,
      };
    },
    onSuccess: async (r) => {
      await cliente.invalidateQueries({ queryKey: ['investimentos'] });
      mostrar(r.mensagem);
    },
  });

  const buscarTaxas = useMutation({
    mutationFn: atualizarIndexadores,
    onSuccess: async (r) => {
      await cliente.invalidateQueries({ queryKey: ['taxas'] });
      await cliente.invalidateQueries({ queryKey: ['investimentos'] });
      mostrar(r.mensagem);
    },
  });

  const salvarManual = useMutation({
    mutationFn: () => registrarTaxaManual('CDI', Number(taxaManual.replace(',', '.'))),
    onSuccess: async () => {
      await cliente.invalidateQueries({ queryKey: ['taxas'] });
      await cliente.invalidateQueries({ queryKey: ['investimentos'] });
      setMostrandoManual(false);
      setTaxaManual('');
      mostrar('CDI registrado.');
    },
  });

  return (
    <Cartao className="space-y-3 p-4">
      <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
        Feriados e taxas
      </p>

      <div className="flex flex-wrap gap-2">
        <Botao tipo="secundario" aoClicar={() => buscarFeriados.mutate()} desabilitado={buscarFeriados.isPending}>
          {buscarFeriados.isPending ? 'Buscando…' : 'Atualizar feriados'}
        </Botao>
        <Botao tipo="secundario" aoClicar={() => buscarTaxas.mutate()} desabilitado={buscarTaxas.isPending}>
          {buscarTaxas.isPending ? 'Buscando…' : 'Atualizar CDI e Selic'}
        </Botao>
        <Botao tipo="discreto" aoClicar={() => setMostrandoManual((v) => !v)}>
          Informar na mão
        </Botao>
      </div>

      {mostrandoManual && (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border border-borda-forte bg-superficie-alta p-3">
          <Campo rotulo="CDI ao ano (%)">
            <input
              inputMode="decimal"
              value={taxaManual}
              onChange={(e) => setTaxaManual(e.target.value)}
              placeholder="10,40"
              className={ENTRADA}
            />
          </Campo>
          <Botao
            aoClicar={() => salvarManual.mutate()}
            desabilitado={taxaManual.trim() === '' || salvarManual.isPending}
          >
            Salvar
          </Botao>
        </div>
      )}

      {(buscarFeriados.data?.ok === false || buscarTaxas.data?.ok === false) && (
        <p className="text-xs text-amber-300">
          {buscarFeriados.data?.ok === false ? buscarFeriados.data.mensagem : buscarTaxas.data?.mensagem}
        </p>
      )}

      <p className="text-xs leading-relaxed text-slate-600">
        O calendário é buscado sozinho na abertura do app, para o ano corrente e o seguinte —
        estes botões são o reforço para quando a busca falhar. Sem feriado cadastrado o rendimento
        erra cerca de 10 dias por ano, sempre para mais, e a recorrência marcada em dia útil cai um
        dia adiantada nos meses com feriado. Nenhuma API aqui é caminho crítico: sem ela o app
        segue com o que já está gravado.
      </p>
    </Cartao>
  );
}

function LinhaDeInvestimento({ item }: { item: InvestimentoCalculado }) {
  const cliente = useQueryClient();

  const [resgatando, setResgatando] = useState(false);
  const [editando, setEditando] = useState(false);
  const [aportando, setAportando] = useState(false);
  const [historico, setHistorico] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const [painelDeCotacao, setPainelDeCotacao] = useState<'recebi' | 'cotacao' | 'vender' | null>(
    null,
  );

  const arquivar = useMutation({
    mutationFn: () => arquivarInvestimento(item.investimento.id),
    onSuccess: () => cliente.invalidateQueries({ queryKey: ['investimentos'] }),
  });
  const { mostrar } = usarAviso();
  const [aberto, setAberto] = useState(false);
  const [saldo, setSaldo] = useState<Centavos>(item.saldoExibido);

  const { investimento: inv, resultado } = item;
  const rendimento = item.saldoExibido - item.aplicado;

  const salvarManual = useMutation({
    mutationFn: () => atualizarSaldoManual(inv.id, saldo),
    onSuccess: async () => {
      await cliente.invalidateQueries({ queryKey: ['investimentos'] });
      setAberto(false);
      mostrar('Saldo atualizado.');
    },
  });

  const conferir = useMutation({
    mutationFn: () => conferirInvestimento(inv.id, saldo),
    onSuccess: async () => {
      await cliente.invalidateQueries({ queryKey: ['investimentos'] });
      setAberto(false);
      mostrar('Conferência registrada.');
    },
  });

  return (
    <Cartao className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-slate-100">{inv.nome}</p>
          <p className="truncate text-xs text-slate-500">
            {ROTULO_TIPO[inv.tipo]}
            {inv.indexador && inv.indexador !== 'PREFIXADO'
              ? ` · ${inv.percentualIndexador ?? 100}% do ${inv.indexador}`
              : inv.taxaPrefixada
                ? ` · ${inv.taxaPrefixada}% a.a.`
                : ''}
            {inv.isentoIR && ' · isento de IR'}
            {inv.liquidezDiaria && ' · liquidez diária'}
          </p>
          <p className="mt-0.5 text-xs text-slate-600">
            {inv.instituicao && `${inv.instituicao} · `}
            desde {formatarBR(inv.dataAplicacao)}
            {resultado && ` · ${resultado.diasUteis} dias úteis`}
            {inv.vencimento && ` · vence ${formatarBR(inv.vencimento)}`}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <Dinheiro centavos={item.saldoExibido} className="text-slate-100" />
          {rendimento !== 0 && (
            <p className={`text-xs ${rendimento > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {rendimento > 0 ? '+' : ''}
              {formatar(rendimento)}
            </p>
          )}
        </div>
      </div>

      {item.posicao && (
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
          <span className="text-slate-400">
            {formatarQuantidade(item.posicao.quantidade)}{' '}
            {item.posicao.quantidade === 1 ? 'unidade' : 'unidades'}
          </span>
          {inv.precoUnitario !== null && (
            <span>
              {SIMBOLO[inv.moeda]} {inv.precoUnitario.toFixed(2).replace('.', ',')} cada
            </span>
          )}
          {inv.moeda !== 'BRL' && inv.cotacaoMoeda !== null && (
            <span>câmbio {inv.cotacaoMoeda.toFixed(2).replace('.', ',')}</span>
          )}
          <span title="O que custou, incluindo o que foi recebido sem sair dinheiro">
            custo {formatar(item.posicao.custoTotal)}
          </span>
          {/* A data da cotação é a informação que impede o número de mentir: um
              preço de trinta dias atrás não é errado, errado é não avisar. */}
          {inv.dataCotacao !== null && (
            <span
              className={cotacaoVelha(inv.dataCotacao) ? 'text-amber-400/80' : undefined}
              title="O app não busca cotação: este é o último preço que você informou"
            >
              cotação de {formatarBR(inv.dataCotacao)}
            </span>
          )}
        </div>
      )}

      {item.posicao && inv.precoUnitario === null && (
        <p className="mt-2 text-xs text-amber-400/80">
          Sem preço informado, o app mostra o custo — prefere isso a inventar um valor de hoje.
        </p>
      )}

      {resultado && resultado.taxaAnualUsada !== null && (
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
          <span>bruto {formatar(resultado.saldoBruto)}</span>
          <span title="Imposto incide só sobre o rendimento">
            IR {formatar(resultado.ir)} ({Math.round(resultado.aliquotaIR * 100)}%)
          </span>
          {resultado.iof > 0 && (
            <span title="Resgate antes de 30 dias">IOF {formatar(resultado.iof)}</span>
          )}
          <span className="text-slate-400">líquido {formatar(resultado.saldoLiquido)}</span>
        </div>
      )}

      {resultado?.taxaAnualUsada === null && (
        <p className="mt-2 text-xs text-amber-400/80">
          Sem taxa do {inv.indexador} registrada, o app não tem como calcular — e prefere mostrar o
          aplicado a inventar um rendimento.
        </p>
      )}

      {item.divergencia !== null && item.divergencia !== 0 && (
        <p className="mt-2 text-xs text-amber-400/80">
          Diferença de {formatar(Math.abs(item.divergencia))} em relação ao último saldo conferido
          {inv.dataConferencia && ` em ${formatarBR(inv.dataConferencia)}`}. O número certo é o do
          banco.
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-4">
        {/* Por cotação as ações são outras: não se "aplica" nem se "resgata"
            valor — recebe-se ou vende-se quantidade. */}
        {inv.porCotacao ? (
          <>
            <button
              onClick={() => setPainelDeCotacao(painelDeCotacao === 'recebi' ? null : 'recebi')}
              className={`text-xs text-slate-500 hover:text-slate-300 ${ALVO_DE_TOQUE}`}
            >
              {painelDeCotacao === 'recebi' ? 'Cancelar' : 'Recebi mais'}
            </button>
            <button
              onClick={() => setPainelDeCotacao(painelDeCotacao === 'cotacao' ? null : 'cotacao')}
              className={`text-xs text-slate-500 hover:text-slate-300 ${ALVO_DE_TOQUE}`}
            >
              {painelDeCotacao === 'cotacao' ? 'Cancelar' : 'Atualizar cotação'}
            </button>
            <button
              onClick={() => setPainelDeCotacao(painelDeCotacao === 'vender' ? null : 'vender')}
              className={`text-xs text-slate-500 hover:text-slate-300 ${ALVO_DE_TOQUE}`}
            >
              {painelDeCotacao === 'vender' ? 'Cancelar' : 'Vender'}
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => setAberto((v) => !v)}
              className={`text-xs text-slate-500 hover:text-slate-300 ${ALVO_DE_TOQUE}`}
            >
              {inv.calculoAutomatico ? 'Conferir com o banco' : 'Atualizar saldo'}
            </button>
            <button
              onClick={() => setAportando((v) => !v)}
              className={`text-xs text-slate-500 hover:text-slate-300 ${ALVO_DE_TOQUE}`}
            >
              {aportando ? 'Cancelar' : 'Aplicar mais'}
            </button>
          </>
        )}
        <button
          onClick={() => setEditando((v) => !v)}
          className={`text-xs text-slate-500 hover:text-slate-300 ${ALVO_DE_TOQUE}`}
        >
          {editando ? 'Cancelar' : 'Editar'}
        </button>
        <button
          onClick={() => setHistorico((v) => !v)}
          className={`text-xs text-slate-500 hover:text-slate-300 ${ALVO_DE_TOQUE}`}
        >
          {historico ? 'Fechar histórico' : 'Histórico'}
        </button>
        {!inv.porCotacao && (
          <button
            onClick={() => setResgatando((v) => !v)}
            className={`text-xs text-slate-500 hover:text-slate-300 ${ALVO_DE_TOQUE}`}
          >
            {resgatando ? 'Cancelar' : 'Resgatar'}
          </button>
        )}
        <button
          onClick={() => arquivar.mutate()}
          disabled={arquivar.isPending}
          title="Sai do patrimônio sem mexer em conta nenhuma. Para o dinheiro voltar, use Resgatar."
          className={`text-xs text-slate-600 hover:text-slate-300 ${ALVO_DE_TOQUE}`}
        >
          Arquivar
        </button>
        <button
          onClick={() => setExcluindo((v) => !v)}
          title="Para o que nunca aconteceu: apaga a aplicação e desfaz os lançamentos que ela criou."
          className={`text-xs text-slate-600 hover:text-red-400 ${ALVO_DE_TOQUE}`}
        >
          {excluindo ? 'Cancelar' : 'Excluir'}
        </button>
      </div>

      {painelDeCotacao !== null && item.posicao && (
        <PainelDeCotacao
          item={item}
          posicao={item.posicao}
          aba={painelDeCotacao}
          aoTerminar={() => setPainelDeCotacao(null)}
        />
      )}

      {editando && (
        <EdicaoDoInvestimento investimento={inv} aoTerminar={() => setEditando(false)} />
      )}

      {excluindo && (
        <ExclusaoDoInvestimento
          investimentoId={inv.id}
          nome={inv.nome}
          aoTerminar={() => setExcluindo(false)}
        />
      )}

      {historico && (
        <HistoricoDaAplicacao
          investimentoId={inv.id}
          percentualDaAplicacao={inv.percentualIndexador}
        />
      )}

      {aportando && (
        <AporteNoInvestimento
          investimentoId={inv.id}
          nome={inv.nome}
          contaDaAplicacao={inv.contaId}
          percentualDaAplicacao={inv.percentualIndexador}
          aoTerminar={() => setAportando(false)}
        />
      )}

      {resgatando && (
        <ResgateDoInvestimento
          investimentoId={inv.id}
          nome={inv.nome}
          saldoEstimado={item.saldoExibido}
          aoTerminar={() => setResgatando(false)}
        />
      )}

      {aberto && (
        <div className="mt-3 space-y-3 rounded-lg border border-borda-forte bg-superficie-alta p-3">
          <CampoValor
            valor={saldo}
            aoMudar={setSaldo}
            rotulo={inv.calculoAutomatico ? 'Saldo que o banco mostra' : 'Saldo atual'}
          />
          <div className="flex gap-2">
            <Botao
              aoClicar={() => (inv.calculoAutomatico ? conferir.mutate() : salvarManual.mutate())}
            >
              Salvar
            </Botao>
            <Botao tipo="secundario" aoClicar={() => setAberto(false)}>
              Cancelar
            </Botao>
          </div>
          <p className="text-[11px] leading-relaxed text-slate-500">
            {inv.calculoAutomatico
              ? 'O conferido é guardado só para comparação — o cálculo continua a partir da data e da taxa.'
              : 'Renda variável depende de cotação, então o saldo é sempre o que você informa.'}
          </p>
        </div>
      )}
    </Cartao>
  );
}

/**
 * Instituição e vencimento de uma aplicação que já existe.
 *
 * Só estes dois de propósito: valor, taxa e data alimentam o cálculo do
 * rendimento, e deixá-los editáveis aqui reescreveria o histórico sem deixar
 * rastro. Para mudar o dinheiro existe Resgatar; para conferir, Conferir.
 */
function EdicaoDoInvestimento({
  investimento,
  aoTerminar,
}: {
  investimento: Investimento;
  aoTerminar: () => void;
}) {
  const cliente = useQueryClient();
  const { mostrar } = usarAviso();
  const [instituicao, setInstituicao] = useState(investimento.instituicao ?? '');
  const [vencimento, setVencimento] = useState(investimento.vencimento ?? '');
  const [liquidezDiaria, setLiquidezDiaria] = useState(investimento.liquidezDiaria);
  const [contaId, setContaId] = useState<string | null>(investimento.contaId);
  const contas = usarContas();

  const salvar = useMutation({
    mutationFn: () =>
      atualizarInvestimento(investimento.id, {
        instituicao,
        vencimento: vencimento || null,
        liquidezDiaria,
        contaId,
      }),
    onSuccess: async () => {
      await cliente.invalidateQueries({ queryKey: ['investimentos'] });
      aoTerminar();
      mostrar('Aplicação atualizada.');
    },
  });

  return (
    <div className="mt-3 space-y-3 rounded-lg border border-borda-forte bg-superficie-alta p-3">
      <CampoInstituicao instituicao={instituicao} aoMudar={(nova) => setInstituicao(nova)} />

      <Campo rotulo="Vencimento (opcional)">
        <input
          type="date"
          value={vencimento}
          onChange={(e) => setVencimento(e.target.value)}
          className={ENTRADA}
        />
      </Campo>

      <CampoDeLiquidez liquidezDiaria={liquidezDiaria} aoMudar={setLiquidezDiaria} />

      <Campo rotulo="Onde a aplicação fica">
        <ChipsDeContaDaAplicacao
          contas={contas.data ?? []}
          escolhida={contaId}
          aoEscolher={setContaId}
          apenasInvestimento
        />
      </Campo>

      {salvar.isError && <p className="text-sm text-red-400">{(salvar.error as Error).message}</p>}

      <div className="flex gap-2">
        <Botao aoClicar={() => salvar.mutate()} desabilitado={salvar.isPending}>
          Salvar
        </Botao>
        <Botao tipo="secundario" aoClicar={aoTerminar}>
          Cancelar
        </Botao>
      </div>
    </div>
  );
}

function FormularioDeInvestimento({ aoTerminar }: { aoTerminar: () => void }) {
  const cliente = useQueryClient();
  const contas = usarContas();
  const [contaOrigemId, setContaOrigemId] = useState<string | null>(null);
  const [nome, setNome] = useState('');
  const [instituicao, setInstituicao] = useState('');
  const [vencimento, setVencimento] = useState('');
  const [liquidezDiaria, setLiquidezDiaria] = useState(true);
  const [contaDaAplicacao, setContaDaAplicacao] = useState<string | null>(null);
  const [tipo, setTipo] = useState<TipoDeInvestimento>('cdb');
  const [indexador, setIndexador] = useState<Indexador>('CDI');
  const [percentual, setPercentual] = useState('100');
  const [prefixada, setPrefixada] = useState('');
  const [valor, setValor] = useState<Centavos>(0);
  const [data, setData] = useState<DataISO>(hoje());

  const [porCotacao, setPorCotacao] = useState(false);
  const [moeda, setMoeda] = useState<'BRL' | 'USD'>('BRL');

  const semCalculo = TIPOS_SEM_CALCULO.includes(tipo);
  const ehPrefixado = indexador === 'PREFIXADO';
  // Por cotação a posição nasce VAZIA: o que entra é lote, cada um na sua data
  // e no seu preço, e um "valor aplicado" no cadastro inventaria um lote.
  const acompanhaPorCotacao = semCalculo && porCotacao;

  const criar = useMutation({
    mutationFn: () =>
      acompanhaPorCotacao
        ? criarInvestimentoPorCotacao({
            nome,
            instituicao,
            tipo,
            moeda,
            contaId: contaDaAplicacao,
          }).then(() => undefined)
        : criarInvestimento({
            nome,
            instituicao,
            vencimento: vencimento || null,
            liquidezDiaria,
            contaId: contaDaAplicacao,
            tipo,
            indexador: semCalculo ? null : indexador,
            percentualIndexador: ehPrefixado ? null : Number(percentual.replace(',', '.')),
            taxaPrefixada: ehPrefixado ? Number(prefixada.replace(',', '.')) : null,
            dataAplicacao: data,
            valorAplicado: valor,
            contaOrigemId,
          }),
    onSuccess: async () => {
      await cliente.invalidateQueries({ queryKey: ['investimentos'] });
      aoTerminar();
    },
  });

  return (
    <Cartao className="space-y-4 p-4">
      <Campo rotulo="Nome">
        <input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="CDB Inter 110% CDI"
          autoFocus
          className={ENTRADA}
        />
      </Campo>

      <CampoInstituicao instituicao={instituicao} aoMudar={(nova) => setInstituicao(nova)} />

      <Campo
        rotulo="Onde a aplicação fica (opcional)"
        ajuda="A conta de investimento da corretora. É para lá que o aporte é transferido — antes ele caía sempre na primeira conta de investimento criada, mesmo que o dinheiro tivesse ido para outra."
      >
        <ChipsDeContaDaAplicacao
          contas={contas.data ?? []}
          escolhida={contaDaAplicacao}
          aoEscolher={setContaDaAplicacao}
          apenasInvestimento
        />
      </Campo>

      <Campo
        rotulo="Tipo"
        ajuda={
          TIPOS_ISENTOS.includes(tipo)
            ? 'Isento de IR para pessoa física.'
            : semCalculo
              ? 'Sem fórmula: depende de cotação, então você atualiza o saldo na mão.'
              : undefined
        }
      >
        <div className="flex flex-wrap gap-2">
          {TIPOS.map((t) => (
            <Chip key={t} ativo={tipo === t} aoClicar={() => setTipo(t)}>
              {ROTULO_TIPO[t]}
            </Chip>
          ))}
        </div>
      </Campo>

      {semCalculo && (
        <Campo
          rotulo="Como acompanhar"
          ajuda={
            porCotacao
              ? 'A posição nasce vazia: você registra cada lote recebido ou comprado, com o preço do dia. O valor sai de quantidade × preço.'
              : 'Você digita o saldo e atualiza quando quiser. Simples, mas o app não sabe quantas unidades são nem quanto do valor é ganho.'
          }
        >
          <div className="flex flex-wrap gap-2">
            <Chip ativo={!porCotacao} aoClicar={() => setPorCotacao(false)}>
              Por valor
            </Chip>
            <Chip ativo={porCotacao} aoClicar={() => setPorCotacao(true)}>
              Por quantidade e preço
            </Chip>
          </div>
        </Campo>
      )}

      {acompanhaPorCotacao && (
        <Campo
          rotulo="Moeda do ativo"
          ajuda="O app continua todo em reais: a moeda vale só para a cotação deste ativo, e o câmbio do dia entra junto do preço."
        >
          <div className="flex flex-wrap gap-2">
            <Chip ativo={moeda === 'BRL'} aoClicar={() => setMoeda('BRL')}>
              Real
            </Chip>
            <Chip ativo={moeda === 'USD'} aoClicar={() => setMoeda('USD')}>
              Dólar
            </Chip>
          </div>
        </Campo>
      )}

      {!semCalculo && (
        <>
          <Campo rotulo="Rende conforme">
            <div className="flex flex-wrap gap-2">
              {(['CDI', 'SELIC', 'IPCA', 'PREFIXADO'] as const).map((i) => (
                <Chip key={i} ativo={indexador === i} aoClicar={() => setIndexador(i)}>
                  {i === 'PREFIXADO' ? 'Prefixado' : i}
                </Chip>
              ))}
            </div>
          </Campo>

          {ehPrefixado ? (
            <Campo rotulo="Taxa contratada (% ao ano)">
              <input
                inputMode="decimal"
                value={prefixada}
                onChange={(e) => setPrefixada(e.target.value)}
                placeholder="12,5"
                className={ENTRADA}
              />
            </Campo>
          ) : (
            <Campo rotulo={`Percentual do ${indexador} (%)`}>
              <input
                inputMode="decimal"
                value={percentual}
                onChange={(e) => setPercentual(e.target.value)}
                placeholder="110"
                className={ENTRADA}
              />
            </Campo>
          )}
        </>
      )}

      {acompanhaPorCotacao ? (
        <p className="rounded-md border border-borda-forte px-3 py-2 text-xs leading-relaxed text-slate-400">
          A posição começa vazia. Depois de salvar, use <strong>Recebi mais</strong> para cada lote
          que chegar da empresa — cada um com a sua data e o seu preço. Receber não tira dinheiro
          de conta nenhuma, e só vira renda quando você vender.
        </p>
      ) : (
        <>
          <CampoValor valor={valor} aoMudar={setValor} rotulo="Valor aplicado" />

          <Campo rotulo="Data da aplicação">
            <input
              type="date"
              value={data}
              onChange={(e) => e.target.value && setData(e.target.value)}
              className={ENTRADA}
            />
          </Campo>
        </>
      )}

      <Campo
        rotulo="Vencimento (opcional)"
        ajuda="Data do resgate no papel. Em CDB e Tesouro é o que ordena a carteira por quem vence primeiro; poupança, RDB com liquidez e fundo aberto não têm."
      >
        <input
          type="date"
          value={vencimento}
          onChange={(e) => setVencimento(e.target.value)}
          className={ENTRADA}
        />
      </Campo>

      <CampoDeLiquidez liquidezDiaria={liquidezDiaria} aoMudar={setLiquidezDiaria} />

      {!acompanhaPorCotacao && (
      <Campo
        rotulo="De qual conta saiu (opcional)"
        ajuda="Informando, o app tira o valor dessa conta como transferência — aplicar não é gastar, o dinheiro continua seu. Sem informar, a aplicação só é registrada e nenhuma conta se mexe: é o caso de quem está cadastrando algo que já existia."
      >
        <div className="flex flex-wrap gap-2">
          {(contas.data ?? []).filter(podePagarFatura).map((conta) => (
            <Chip
              key={conta.id}
              ativo={contaOrigemId === conta.id}
              aoClicar={() => setContaOrigemId(contaOrigemId === conta.id ? null : conta.id)}
            >
              <span className="flex items-center gap-1.5">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: conta.cor ?? 'var(--color-borda-forte)' }}
                />
                {conta.nome}
              </span>
            </Chip>
          ))}
        </div>
      </Campo>
      )}

      {criar.isError && <p className="text-sm text-red-400">{(criar.error as Error).message}</p>}

      <div className="flex gap-2">
        <Botao
          aoClicar={() => criar.mutate()}
          desabilitado={
            nome.trim() === '' || (!acompanhaPorCotacao && valor <= 0) || criar.isPending
          }
        >
          Salvar
        </Botao>
        <Botao tipo="secundario" aoClicar={aoTerminar}>
          Cancelar
        </Botao>
      </div>

      <p className="text-xs leading-relaxed text-slate-500">
        Aporte é transferência da conta corrente para o investimento, não despesa. Cadastrar aqui
        registra a aplicação; o movimento de dinheiro é lançado normalmente pela folha.
      </p>
    </Cartao>
  );
}

function LinhaArquivada({
  id,
  nome,
  tipo,
}: {
  id: string;
  nome: string;
  tipo: TipoDeInvestimento;
}) {
  const cliente = useQueryClient();

  const reativar = useMutation({
    mutationFn: () => desarquivarInvestimento(id),
    onSuccess: () => cliente.invalidateQueries({ queryKey: ['investimentos'] }),
  });

  return (
    <li className="flex items-center justify-between gap-3 px-4 py-2.5">
      <span className="min-w-0 truncate text-sm text-slate-500">
        {nome} · {ROTULO_TIPO[tipo]}
      </span>
      <button
        onClick={() => reativar.mutate()}
        disabled={reativar.isPending}
        className={`shrink-0 text-xs text-slate-500 transition hover:text-slate-300 ${ALVO_DE_TOQUE}`}
      >
        Reativar
      </button>
    </li>
  );
}

/**
 * Resgate: o dinheiro volta para a conta (§7.4).
 *
 * O valor vem preenchido com a estimativa do app, mas é editável — e essa é a
 * regra da tela inteira (§7.3, §14): o número calculado é estimativa, o real é
 * o que o banco creditou, já com IR e IOF descontados. Gravar o estimado no
 * caixa seria pôr um número inventado no saldo.
 */
function ResgateDoInvestimento({
  investimentoId,
  nome,
  saldoEstimado,
  aoTerminar,
}: {
  investimentoId: string;
  nome: string;
  saldoEstimado: Centavos;
  aoTerminar: () => void;
}) {
  const cliente = useQueryClient();
  const contas = usarContas();
  const [valor, setValor] = useState<Centavos>(saldoEstimado);
  const [data, setData] = useState<DataISO>(hoje());
  const [contaDestinoId, setContaDestinoId] = useState<string | null>(null);
  const [encerrar, setEncerrar] = useState(true);

  const resgatar = useMutation({
    mutationFn: () =>
      resgatarInvestimento({
        investimentoId,
        nome,
        valor,
        data,
        contaDestinoId: contaDestinoId!,
        encerrar,
      }),
    onSuccess: async () => {
      await cliente.invalidateQueries();
      aoTerminar();
    },
  });

  const destinos = (contas.data ?? []).filter(podePagarFatura);

  return (
    <div className="mt-3 space-y-3 rounded-lg border border-borda-forte bg-superficie-alta p-3">
      <CampoValor valor={valor} aoMudar={setValor} rotulo="Quanto o banco creditou" />
      <p className="text-xs leading-relaxed text-slate-500">
        Veio preenchido com a estimativa do app. O número certo é o do extrato, já com IR e IOF
        descontados.
        {valor > 0 && valor < saldoEstimado && (
          <>
            {' '}
            Resgate parcial: sobram cerca de{' '}
            <span className="text-slate-300">{formatar(saldoEstimado - valor)}</span> aplicados,
            rendendo normalmente.
          </>
        )}
      </p>

      <Campo rotulo="Para qual conta">
        <div className="flex flex-wrap gap-2">
          {destinos.map((conta) => (
            <Chip
              key={conta.id}
              ativo={contaDestinoId === conta.id}
              aoClicar={() => setContaDestinoId(conta.id)}
            >
              <span className="flex items-center gap-1.5">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: conta.cor ?? 'var(--color-borda-forte)' }}
                />
                {conta.nome}
              </span>
            </Chip>
          ))}
        </div>
      </Campo>

      <Campo rotulo="Data">
        <input
          type="date"
          value={data}
          onChange={(e) => e.target.value && setData(e.target.value)}
          className={ENTRADA}
        />
      </Campo>

      <label className="flex items-center gap-2 text-xs text-slate-400">
        <input
          type="checkbox"
          checked={encerrar}
          onChange={(e) => setEncerrar(e.target.checked)}
          className="h-4 w-4"
        />
        Resgatei tudo: arquivar a aplicação
      </label>

      {resgatar.isError && (
        <p className="text-sm text-red-400">{(resgatar.error as Error).message}</p>
      )}

      <div className="flex gap-2">
        <Botao
          aoClicar={() => resgatar.mutate()}
          desabilitado={valor <= 0 || contaDestinoId === null || resgatar.isPending}
        >
          {resgatar.isPending ? 'Resgatando…' : 'Registrar resgate'}
        </Botao>
        <Botao tipo="secundario" aoClicar={aoTerminar}>
          Cancelar
        </Botao>
      </div>
    </div>
  );
}

const AGRUPAMENTOS: { valor: Agrupamento; rotulo: string }[] = [
  { valor: 'instituicao', rotulo: 'Instituição' },
  { valor: 'tipo', rotulo: 'Tipo' },
  { valor: 'nenhum', rotulo: 'Nenhum' },
];

const ORDENACOES: { valor: Ordenacao; rotulo: string }[] = [
  { valor: 'valor', rotulo: 'Valor' },
  { valor: 'vencimento', rotulo: 'Vencimento' },
  { valor: 'nome', rotulo: 'Nome' },
];

/**
 * Como a carteira é organizada.
 *
 * Agrupada por instituição de saída, porque com cinco aplicações de nome
 * parecido a primeira pergunta deixa de ser "o que eu tenho" e passa a ser
 * "quanto tem em cada lugar" — e o subtotal do grupo responde isso sem contas.
 */
function ControlesDaCarteira({
  agrupamento,
  ordenacao,
  aoAgrupar,
  aoOrdenar,
}: {
  agrupamento: Agrupamento;
  ordenacao: Ordenacao;
  aoAgrupar: (valor: Agrupamento) => void;
  aoOrdenar: (valor: Ordenacao) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] uppercase tracking-wider text-slate-600">agrupar por</span>
        {AGRUPAMENTOS.map((opcao) => (
          <BotaoDeControle
            key={opcao.valor}
            ativo={agrupamento === opcao.valor}
            aoClicar={() => aoAgrupar(opcao.valor)}
          >
            {opcao.rotulo}
          </BotaoDeControle>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] uppercase tracking-wider text-slate-600">ordenar por</span>
        {ORDENACOES.map((opcao) => (
          <BotaoDeControle
            key={opcao.valor}
            ativo={ordenacao === opcao.valor}
            aoClicar={() => aoOrdenar(opcao.valor)}
          >
            {opcao.rotulo}
          </BotaoDeControle>
        ))}
      </div>
    </div>
  );
}

function BotaoDeControle({
  ativo,
  aoClicar,
  children,
}: {
  ativo: boolean;
  aoClicar: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={aoClicar}
      aria-pressed={ativo}
      className={`rounded-full px-2.5 py-1 text-xs transition ${
        ativo
          ? 'bg-slate-700 text-slate-100'
          : 'border border-borda text-slate-500 hover:border-borda-forte'
      }`}
    >
      {children}
    </button>
  );
}

/**
 * Liquidez diária (§8.8).
 *
 * Não é enfeite de cadastro: é o que decide se o dinheiro conta como reserva de
 * emergência. RDB e poupança costumam ser resgatáveis a qualquer momento, e
 * esse dinheiro cobre uma emergência de verdade; um CDB travado até 2029 não
 * cobre, por maior que seja. Contar os dois juntos daria uma reserva no papel
 * que não existe na hora em que ela precisa existir.
 */
function CampoDeLiquidez({
  liquidezDiaria,
  aoMudar,
}: {
  liquidezDiaria: boolean;
  aoMudar: (valor: boolean) => void;
}) {
  return (
    <Campo
      rotulo="Liquidez"
      ajuda="Só o que tem liquidez diária conta na reserva de emergência, em Metas."
    >
      <div className="flex flex-wrap gap-2">
        <Chip ativo={liquidezDiaria} aoClicar={() => aoMudar(true)}>
          Resgato quando quiser
        </Chip>
        <Chip ativo={!liquidezDiaria} aoClicar={() => aoMudar(false)}>
          Preso até o vencimento
        </Chip>
      </div>
    </Campo>
  );
}

/**
 * Aporte novo numa aplicação que já existe (§7.4).
 *
 * Antes isto não existia: para aplicar mais R$ 100 no mesmo RDB era preciso
 * criar um segundo investimento com o mesmo nome, e a carteira enchia de linhas
 * repetidas que são a mesma aplicação.
 *
 * Cada aporte rende a partir da SUA data — não de uma média —, porque é o que
 * acontece no banco: dinheiro que entrou em março não rendeu em janeiro, e a
 * alíquota de IR dele conta a partir de março.
 */
function AporteNoInvestimento({
  investimentoId,
  nome,
  contaDaAplicacao,
  percentualDaAplicacao,
  aoTerminar,
}: {
  investimentoId: string;
  nome: string;
  contaDaAplicacao: string | null;
  percentualDaAplicacao: number | null;
  aoTerminar: () => void;
}) {
  const cliente = useQueryClient();
  const { mostrar } = usarAviso();
  const contas = usarContas();
  const [valor, setValor] = useState<Centavos>(0);
  const [data, setData] = useState<DataISO>(hoje());
  const [contaOrigemId, setContaOrigemId] = useState<string | null>(null);
  const [outrasCondicoes, setOutrasCondicoes] = useState(false);
  const [percentual, setPercentual] = useState('');
  const [vencimento, setVencimento] = useState('');

  const aportar = useMutation({
    mutationFn: () =>
      aportarEmInvestimento({
        investimentoId,
        nome,
        valor,
        data,
        contaOrigemId: contaOrigemId!,
        contaDaAplicacao,
        // Só grava o percentual quando ele DIFERE do da aplicação: repetir o
        // mesmo número marcaria o aporte como especial sem ele ser.
        percentual:
          outrasCondicoes && percentual.trim() !== ''
            ? Number(percentual.replace(',', '.'))
            : null,
        vencimento: outrasCondicoes && vencimento !== '' ? vencimento : null,
      }),
    onSuccess: async () => {
      await cliente.invalidateQueries();
      aoTerminar();
      mostrar('Aporte registrado.');
    },
  });

  return (
    <div className="mt-3 space-y-3 rounded-lg border border-borda-forte bg-superficie-alta p-3">
      <CampoValor valor={valor} aoMudar={setValor} rotulo="Quanto aplicar" autoFocus />

      <Campo rotulo="De qual conta">
        <div className="flex flex-wrap gap-2">
          {(contas.data ?? []).filter(podePagarFatura).map((conta) => (
            <Chip
              key={conta.id}
              ativo={contaOrigemId === conta.id}
              aoClicar={() => setContaOrigemId(conta.id)}
            >
              <span className="flex items-center gap-1.5">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: conta.cor ?? 'var(--color-borda-forte)' }}
                />
                {conta.nome}
              </span>
            </Chip>
          ))}
        </div>
      </Campo>

      <Campo rotulo="Data">
        <input
          type="date"
          value={data}
          onChange={(e) => e.target.value && setData(e.target.value)}
          className={ENTRADA}
        />
      </Campo>

      <div>
        <button
          onClick={() => setOutrasCondicoes((v) => !v)}
          className={`text-xs text-slate-500 hover:text-slate-300 ${ALVO_DE_TOQUE}`}
        >
          {outrasCondicoes ? 'Mesmas condições da aplicação' : 'Este aporte tem outra taxa ou vencimento'}
        </button>

        {outrasCondicoes && (
          <div className="mt-2 space-y-3 rounded-lg border border-sky-900/50 bg-sky-950/20 p-3">
            <Campo rotulo={`Percentual do indexador (a aplicação é ${percentualDaAplicacao ?? 100}%)`}>
              <input
                inputMode="decimal"
                value={percentual}
                onChange={(e) => setPercentual(e.target.value)}
                placeholder={String(percentualDaAplicacao ?? 100)}
                className={ENTRADA}
              />
            </Campo>

            <Campo rotulo="Vencimento deste aporte (opcional)">
              <input
                type="date"
                value={vencimento}
                onChange={(e) => setVencimento(e.target.value)}
                className={ENTRADA}
              />
            </Campo>

            <p className="text-[11px] leading-relaxed text-slate-500">
              Raro, mas acontece: aportar num mês em que o banco oferece outra taxa. Sem isto o app
              renderia o dinheiro novo à taxa velha — um número inventado que não avisa que é
              inventado.
            </p>
          </div>
        )}
      </div>

      {aportar.isError && <p className="text-sm text-red-400">{(aportar.error as Error).message}</p>}

      <div className="flex gap-2">
        <Botao
          aoClicar={() => aportar.mutate()}
          desabilitado={valor <= 0 || contaOrigemId === null || aportar.isPending}
        >
          {aportar.isPending ? 'Aplicando…' : 'Registrar aporte'}
        </Botao>
        <Botao tipo="secundario" aoClicar={aoTerminar}>
          Cancelar
        </Botao>
      </div>

      <p className="text-[11px] leading-relaxed text-slate-500">
        O dinheiro sai da conta como transferência, não como despesa: aplicar não é gastar.
      </p>
    </div>
  );
}

/**
 * Excluir uma aplicação que nunca existiu (§7.4).
 *
 * A diferença entre isto e Arquivar não é força, é natureza: arquivar é para o
 * que ACABOU e preserva o histórico; excluir é para o que NUNCA ACONTECEU e
 * desfaz o que o app registrou. Arquivar uma aplicação cadastrada em duplicidade
 * esconde a linha e deixa a transferência do aporte no extrato — a conta fica
 * mais pobre para sempre por um dinheiro que nunca saiu.
 *
 * A trava não é tempo, é consequência. O que torna isto seguro é a frase antes
 * do clique: quantos lançamentos somem e quanto volta para cada conta. Uma
 * aplicação recém-cadastrada por engano tem um lançamento para desfazer; uma de
 * três anos tem trinta, e a própria contagem avisa que não é isso que se quer.
 */
function ExclusaoDoInvestimento({
  investimentoId,
  nome,
  aoTerminar,
}: {
  investimentoId: string;
  nome: string;
  aoTerminar: () => void;
}) {
  const cliente = useQueryClient();
  const { mostrar } = usarAviso();

  const previa = useQuery({
    queryKey: ['investimento-previa-exclusao', investimentoId],
    queryFn: () => previaDaExclusao(investimentoId),
  });

  const excluir = useMutation({
    mutationFn: () => excluirInvestimento(investimentoId),
    onSuccess: async () => {
      await cliente.invalidateQueries();
      mostrar(`${nome} foi excluída, e os lançamentos dela desfeitos.`);
    },
  });

  return (
    <div className="mt-3 space-y-3 rounded-lg border border-red-900/60 bg-red-950/20 p-3">
      {previa.isPending ? (
        <p className="text-sm text-slate-400">Vendo o que isso desfaz…</p>
      ) : previa.isError ? (
        <p className="text-sm text-red-400">{(previa.error as Error).message}</p>
      ) : (
        <>
          <p className="text-sm text-slate-200">
            {previa.data!.lancamentos === 0
              ? 'Nada foi lançado por esta aplicação: excluir não mexe em conta nenhuma.'
              : previa.data!.lancamentos === 1
                ? 'Excluir vai apagar 1 lançamento e mudar o saldo do mês em que ele cai.'
                : `Excluir vai apagar ${previa.data!.lancamentos} lançamentos e mudar o saldo dos meses em que eles caem.`}
          </p>

          {previa.data!.efeitos.length > 0 && (
            <ul className="space-y-1">
              {previa.data!.efeitos.map((efeito) => (
                <li key={efeito.contaId} className="flex justify-between gap-3 text-sm">
                  <span className="truncate text-slate-300">{efeito.nome}</span>
                  <span className={efeito.delta > 0 ? 'text-emerald-400' : 'text-red-400'}>
                    {efeito.delta > 0 ? 'volta ' : 'sai '}
                    <Dinheiro centavos={Math.abs(efeito.delta)} className="text-inherit" />
                  </span>
                </li>
              ))}
            </ul>
          )}

          <p className="text-xs leading-relaxed text-slate-500">
            Só faça isso se o dinheiro <strong>não se moveu de verdade</strong> — cadastro
            duplicado, valor digitado errado. Se a aplicação existiu e acabou, o certo é Arquivar,
            que preserva o histórico; se ela existe e você tirou o dinheiro, é Resgatar.
          </p>
        </>
      )}

      {excluir.isError && <p className="text-sm text-red-400">{(excluir.error as Error).message}</p>}

      <div className="flex gap-2">
        <Botao
          aoClicar={() => excluir.mutate()}
          desabilitado={previa.isPending || excluir.isPending}
          tipo="perigo"
        >
          {excluir.isPending ? 'Excluindo…' : 'Excluir mesmo assim'}
        </Botao>
        <Botao tipo="secundario" aoClicar={aoTerminar}>
          Cancelar
        </Botao>
      </div>
    </div>
  );
}

/** Chips de conta. `apenasInvestimento` troca o caixa pela corretora. */
function ChipsDeContaDaAplicacao({
  contas,
  escolhida,
  aoEscolher,
  apenasInvestimento = false,
}: {
  contas: { id: string; nome: string; cor: string | null; tipo: string }[];
  escolhida: string | null;
  aoEscolher: (id: string | null) => void;
  apenasInvestimento?: boolean;
}) {
  const elegiveis = contas.filter((c) =>
    apenasInvestimento ? c.tipo === 'investimento' : podePagarFatura({ tipo: c.tipo as never }),
  );

  if (elegiveis.length === 0) {
    return (
      <p className="text-xs text-slate-500">
        {apenasInvestimento
          ? 'Nenhuma conta de investimento cadastrada. Crie uma em Contas para separar por corretora.'
          : 'Nenhuma conta disponível.'}
      </p>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {elegiveis.map((conta) => (
        <Chip
          key={conta.id}
          ativo={escolhida === conta.id}
          aoClicar={() => aoEscolher(escolhida === conta.id ? null : conta.id)}
        >
          <span className="flex items-center gap-1.5">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: conta.cor ?? 'var(--color-borda-forte)' }}
            />
            {conta.nome}
          </span>
        </Chip>
      ))}
    </div>
  );
}

/**
 * O histórico da aplicação (§7.3).
 *
 * Sem ele o saldo era um número só, e conferir com o extrato exigia lembrar de
 * cabeça o que entrou quando — que é justamente o que a conferência existe para
 * não depender.
 *
 * O aporte com taxa própria aparece marcado: é raro, e o que é raro precisa
 * saltar aos olhos, senão passa por engano de digitação.
 */
function HistoricoDaAplicacao({
  investimentoId,
  percentualDaAplicacao,
}: {
  investimentoId: string;
  percentualDaAplicacao: number | null;
}) {
  const movimentos = useQuery({
    queryKey: ['movimentos-investimento', investimentoId],
    queryFn: () => listarMovimentosDe(investimentoId),
  });

  if (movimentos.isPending) {
    return <p className="mt-3 text-xs text-slate-500">Carregando histórico…</p>;
  }

  const lista = movimentos.data ?? [];
  if (lista.length === 0) {
    return <p className="mt-3 text-xs text-slate-500">Nenhum movimento registrado.</p>;
  }

  return (
    <ul className="mt-3 space-y-1.5 rounded-lg border border-borda-forte bg-superficie-alta p-3">
      {lista.map((movimento) => {
        const proprio =
          movimento.percentual !== null && movimento.percentual !== percentualDaAplicacao;

        return (
          <li key={movimento.id} className="flex items-baseline justify-between gap-3 text-xs">
            <span className="flex min-w-0 items-baseline gap-2">
              <span className="text-slate-500">{formatarBR(movimento.data)}</span>
              <span className={movimento.tipo === 'aporte' ? 'text-slate-300' : 'text-amber-400/80'}>
                {movimento.tipo === 'aporte' ? 'aporte' : 'resgate'}
              </span>
              {proprio && (
                <span className="rounded border border-sky-800 px-1 text-[10px] text-sky-300">
                  {movimento.percentual}% do CDI
                </span>
              )}
              {movimento.vencimento && (
                <span className="text-slate-600">vence {formatarBR(movimento.vencimento)}</span>
              )}
            </span>
            <Dinheiro
              centavos={movimento.valor}
              className={movimento.tipo === 'aporte' ? 'text-slate-300' : 'text-amber-400/80'}
            />
          </li>
        );
      })}
    </ul>
  );
}

const SIMBOLO: Record<'BRL' | 'USD', string> = { BRL: 'R$', USD: 'US$' };

/** Quantidade fracionária aparece com casas; inteira, sem. */
function formatarQuantidade(quantidade: number): string {
  return Number.isInteger(quantidade)
    ? String(quantidade)
    : quantidade.toFixed(6).replace(/0+$/, '').replace(/\.$/, '').replace('.', ',');
}

/** Um mês sem atualizar já merece aviso: o preço envelhece rápido. */
function cotacaoVelha(data: DataISO): boolean {
  return data < somarDias(hoje(), -35);
}

function CampoNumero({
  rotulo,
  valor,
  aoMudar,
  ajuda,
  prefixo,
}: {
  rotulo: string;
  valor: string;
  aoMudar: (v: string) => void;
  ajuda?: string;
  prefixo?: string;
}) {
  return (
    <Campo rotulo={rotulo} ajuda={ajuda}>
      <div className="flex items-center gap-2">
        {prefixo && <span className="shrink-0 text-sm text-slate-500">{prefixo}</span>}
        <input
          inputMode="decimal"
          value={valor}
          onChange={(e) => aoMudar(e.target.value.replace(/[^0-9.,]/g, ''))}
          className={ENTRADA}
        />
      </div>
    </Campo>
  );
}

const numero = (texto: string) => Number(texto.replace(/\./g, '').replace(',', '.')) || 0;

/**
 * Receber, reavaliar e vender — as três coisas que se faz com uma posição
 * cotada (§7.1, §7.4).
 *
 * As três estão juntas porque pedem os mesmos números, e separá-las em telas
 * faria repetir três vezes a explicação de por que RECEBER não é aplicar.
 */
function PainelDeCotacao({
  item,
  posicao,
  aba,
  aoTerminar,
}: {
  item: InvestimentoCalculado;
  posicao: PosicaoPorCotacao;
  aba: 'recebi' | 'cotacao' | 'vender';
  aoTerminar: () => void;
}) {
  const cliente = useQueryClient();
  const invalidarTransacoes = usarInvalidarTransacoes();
  const { mostrar } = usarAviso();
  const contas = usarContas();

  const inv = item.investimento;
  const emReal = inv.moeda === 'BRL';

  const [quantidade, setQuantidade] = useState('');
  const [preco, setPreco] = useState(
    inv.precoUnitario === null ? '' : String(inv.precoUnitario).replace('.', ','),
  );
  const [cambio, setCambio] = useState(
    emReal ? '1' : inv.cotacaoMoeda === null ? '' : String(inv.cotacaoMoeda).replace('.', ','),
  );
  const [data, setData] = useState<DataISO>(hoje());
  const [contaDestino, setContaDestino] = useState<string | null>(null);

  const q = numero(quantidade);
  const p = numero(preco);
  const c = emReal ? 1 : numero(cambio);

  const invalidar = async () => {
    await cliente.invalidateQueries({ queryKey: ['investimentos'] });
    await invalidarTransacoes();
  };

  const receber = useMutation({
    mutationFn: () =>
      registrarRecebimento({ investimentoId: inv.id, quantidade: q, preco: p, cambio: c, data }),
    onSuccess: async () => {
      await invalidar();
      aoTerminar();
      mostrar('Recebimento registrado. Nenhuma conta foi tocada: ainda não é dinheiro.');
    },
  });

  const cotar = useMutation({
    mutationFn: () => atualizarCotacao({ investimentoId: inv.id, preco: p, cambio: c, data }),
    onSuccess: async () => {
      await invalidar();
      aoTerminar();
      mostrar('Cotação atualizada.');
    },
  });

  const vender = useMutation({
    mutationFn: () =>
      venderUnidades({
        investimentoId: inv.id,
        nome: inv.nome,
        quantidade: q,
        preco: p,
        cambio: c,
        data,
        contaDestinoId: contaDestino!,
        contaDaAplicacao: inv.contaId,
      }),
    onSuccess: async () => {
      await invalidar();
      aoTerminar();
      mostrar('Venda registrada.');
    },
  });

  const bruto = valorEmReais(q, p, c);
  const contasDaOperacao = aba === 'vender' && q > 0 ? contasDaVenda(posicao, q, p, c) : null;

  const correntes = (contas.data ?? []).filter(
    (conta) => conta.tipo !== 'investimento' && conta.tipo !== 'cartao_credito' && conta.ativo,
  );

  return (
    <div className="mt-3 space-y-3 rounded-lg border border-borda-forte bg-superficie-alta p-3">
      {aba === 'recebi' && (
        <p className="text-xs leading-relaxed text-slate-400">
          Ação recebida da empresa não é aplicação: nenhum dinheiro sai de conta nenhuma, e o app
          não vai tirar de lugar nenhum. Também não é renda ainda — você não pode gastar o que não
          vendeu. Vira renda na venda.
        </p>
      )}

      {aba === 'cotacao' && (
        <p className="text-xs leading-relaxed text-slate-400">
          O app não busca cotação: uma ação americana precisaria de duas fontes, o preço e o
          câmbio, e nenhuma API pode virar caminho crítico daqui. Você informa quando quiser — a
          tela mostra a data para ninguém confundir o número com o de hoje.
        </p>
      )}

      {aba !== 'cotacao' && (
        <CampoNumero
          rotulo={aba === 'recebi' ? 'Quantas você recebeu' : 'Quantas está vendendo'}
          valor={quantidade}
          aoMudar={setQuantidade}
          ajuda={
            aba === 'vender'
              ? `Você tem ${formatarQuantidade(posicao.quantidade)}.`
              : undefined
          }
        />
      )}

      <CampoNumero
        rotulo={aba === 'cotacao' ? 'Preço por unidade hoje' : 'Preço por unidade no dia'}
        valor={preco}
        aoMudar={setPreco}
        prefixo={SIMBOLO[inv.moeda]}
        ajuda={
          aba === 'recebi'
            ? 'É o custo de aquisição. Sem ele o app não sabe dizer quanto do valor é ganho — nem te dar o número que o contador pede.'
            : undefined
        }
      />

      {!emReal && (
        <CampoNumero
          rotulo="Câmbio do dia"
          valor={cambio}
          aoMudar={setCambio}
          prefixo="R$"
          ajuda="Quantos reais vale um dólar. O razão do app é todo em reais; o dólar existe só aqui."
        />
      )}

      {aba === 'vender' && (
        <Campo rotulo="Onde o dinheiro cai">
          <ChipsDeConta
            contas={correntes}
            escolhida={contaDestino}
            aoEscolher={(id) => setContaDestino(id)}
          />
        </Campo>
      )}

      <Campo rotulo="Quando">
        <input
          type="date"
          value={data}
          onChange={(e) => e.target.value && setData(e.target.value)}
          className={ENTRADA}
        />
      </Campo>

      {aba === 'recebi' && q > 0 && p > 0 && (
        <p className="rounded-md border border-borda-forte px-3 py-2 text-sm text-slate-300">
          Entra {formatarQuantidade(q)} {q === 1 ? 'unidade' : 'unidades'}, valendo{' '}
          <strong>{formatar(bruto)}</strong>. Nenhuma conta se mexe.
        </p>
      )}

      {contasDaOperacao && (
        <div className="space-y-1 rounded-md border border-emerald-900/50 bg-emerald-950/20 px-3 py-2 text-sm">
          <p className="text-slate-200">
            Entram <strong>{formatar(contasDaOperacao.bruto)}</strong> na conta
          </p>
          {/* Três naturezas, e somá-las apagaria a informação que decide o que
              fazer com o dinheiro. */}
          <ul className="space-y-0.5 text-xs text-slate-400">
            {contasDaOperacao.devolucaoDeCaixa > 0 && (
              <li>
                {formatar(contasDaOperacao.devolucaoDeCaixa)} são o que você pagou voltando —
                transferência, não renda
              </li>
            )}
            {contasDaOperacao.remuneracao !== 0 && (
              <li>
                {formatar(contasDaOperacao.remuneracao)} são as ações recebidas virando dinheiro —
                renda agora, porque antes não dava para gastar
              </li>
            )}
            {contasDaOperacao.ganho !== 0 && (
              <li>
                {formatar(Math.abs(contasDaOperacao.ganho))} de{' '}
                {contasDaOperacao.ganho > 0 ? 'ganho' : 'prejuízo'} sobre o custo
              </li>
            )}
          </ul>
        </div>
      )}

      {(receber.isError || cotar.isError || vender.isError) && (
        <p className="text-sm text-red-400">
          {((receber.error ?? cotar.error ?? vender.error) as Error).message}
        </p>
      )}

      <div className="flex gap-2">
        {aba === 'recebi' && (
          <Botao
            aoClicar={() => receber.mutate()}
            desabilitado={q <= 0 || p <= 0 || c <= 0 || receber.isPending}
          >
            {receber.isPending ? 'Registrando…' : 'Registrar recebimento'}
          </Botao>
        )}
        {aba === 'cotacao' && (
          <Botao aoClicar={() => cotar.mutate()} desabilitado={p <= 0 || c <= 0 || cotar.isPending}>
            {cotar.isPending ? 'Salvando…' : 'Salvar cotação'}
          </Botao>
        )}
        {aba === 'vender' && (
          <Botao
            aoClicar={() => vender.mutate()}
            desabilitado={
              q <= 0 || p <= 0 || c <= 0 || contaDestino === null || vender.isPending
            }
          >
            {vender.isPending ? 'Vendendo…' : 'Registrar venda'}
          </Botao>
        )}
        <Botao tipo="secundario" aoClicar={aoTerminar}>
          Cancelar
        </Botao>
      </div>
    </div>
  );
}
