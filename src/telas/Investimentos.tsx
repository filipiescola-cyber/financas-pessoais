import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatarBR, hoje, type DataISO } from '../dominio/datas';
import { formatar, type Centavos } from '../dominio/dinheiro';
import type { Indexador } from '../dominio/rendimento';
import {
  arquivarInvestimento,
  resgatarInvestimento,
  atualizarSaldoManual,
  calcularTodos,
  conferirInvestimento,
  aportarEmInvestimento,
  atualizarInvestimento,
  excluirInvestimento,
  previaDaExclusao,
  criarInvestimento,
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
  const [excluindo, setExcluindo] = useState(false);

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
        <button
          onClick={() => setAberto((v) => !v)}
          className={`text-xs text-slate-500 hover:text-slate-300 ${ALVO_DE_TOQUE}`}
        >
          {inv.calculoAutomatico ? 'Conferir com o banco' : 'Atualizar saldo'}
        </button>
        <button
          onClick={() => setEditando((v) => !v)}
          className={`text-xs text-slate-500 hover:text-slate-300 ${ALVO_DE_TOQUE}`}
        >
          {editando ? 'Cancelar' : 'Editar'}
        </button>
        <button
          onClick={() => setAportando((v) => !v)}
          className={`text-xs text-slate-500 hover:text-slate-300 ${ALVO_DE_TOQUE}`}
        >
          {aportando ? 'Cancelar' : 'Aplicar mais'}
        </button>
        <button
          onClick={() => setResgatando((v) => !v)}
          className={`text-xs text-slate-500 hover:text-slate-300 ${ALVO_DE_TOQUE}`}
        >
          {resgatando ? 'Cancelar' : 'Resgatar'}
        </button>
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

      {aportando && (
        <AporteNoInvestimento
          investimentoId={inv.id}
          nome={inv.nome}
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

  const salvar = useMutation({
    mutationFn: () =>
      atualizarInvestimento(investimento.id, {
        instituicao,
        vencimento: vencimento || null,
        liquidezDiaria,
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
  const [tipo, setTipo] = useState<TipoDeInvestimento>('cdb');
  const [indexador, setIndexador] = useState<Indexador>('CDI');
  const [percentual, setPercentual] = useState('100');
  const [prefixada, setPrefixada] = useState('');
  const [valor, setValor] = useState<Centavos>(0);
  const [data, setData] = useState<DataISO>(hoje());

  const semCalculo = TIPOS_SEM_CALCULO.includes(tipo);
  const ehPrefixado = indexador === 'PREFIXADO';

  const criar = useMutation({
    mutationFn: () =>
      criarInvestimento({
        nome,
        instituicao,
        vencimento: vencimento || null,
        liquidezDiaria,
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

      <CampoValor valor={valor} aoMudar={setValor} rotulo="Valor aplicado" />

      <Campo rotulo="Data da aplicação">
        <input
          type="date"
          value={data}
          onChange={(e) => e.target.value && setData(e.target.value)}
          className={ENTRADA}
        />
      </Campo>

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

      {criar.isError && <p className="text-sm text-red-400">{(criar.error as Error).message}</p>}

      <div className="flex gap-2">
        <Botao
          aoClicar={() => criar.mutate()}
          desabilitado={nome.trim() === '' || valor <= 0 || criar.isPending}
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
  aoTerminar,
}: {
  investimentoId: string;
  nome: string;
  aoTerminar: () => void;
}) {
  const cliente = useQueryClient();
  const { mostrar } = usarAviso();
  const contas = usarContas();
  const [valor, setValor] = useState<Centavos>(0);
  const [data, setData] = useState<DataISO>(hoje());
  const [contaOrigemId, setContaOrigemId] = useState<string | null>(null);

  const aportar = useMutation({
    mutationFn: () =>
      aportarEmInvestimento({
        investimentoId,
        nome,
        valor,
        data,
        contaOrigemId: contaOrigemId!,
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
              : `Excluir vai apagar ${previa.data!.lancamentos} lançamento(s) e mudar o saldo dos meses em que eles caem.`}
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
