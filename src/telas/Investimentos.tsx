import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatarBR, hoje, type DataISO } from '../dominio/datas';
import { formatar, type Centavos } from '../dominio/dinheiro';
import type { Indexador } from '../dominio/rendimento';
import {
  atualizarSaldoManual,
  calcularTodos,
  conferirInvestimento,
  criarInvestimento,
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
import { usarAviso } from '../ui/Aviso';
import { Botao, Campo, Cartao, CartaoIndicador, Chip, Dinheiro, ENTRADA, Nota, Pagina, Secao, Vazio } from '../ui/base';

const TIPOS: TipoDeInvestimento[] = ['cdb', 'tesouro', 'lci', 'lca', 'poupanca', 'fundo', 'acoes', 'cripto', 'outro'];

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
  const taxas = useQuery({ queryKey: ['taxas'], queryFn: taxasVigentes });

  const lista = investimentos.data ?? [];
  const totalBruto = lista.reduce((soma, i) => soma + i.saldoExibido, 0);
  const totalLiquido = lista.reduce(
    (soma, i) => soma + (i.resultado?.saldoLiquido ?? i.saldoExibido),
    0,
  );
  const totalAplicado = lista.reduce((soma, i) => soma + i.investimento.valorAplicado, 0);

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
            <div className="space-y-2">
              {lista.map((item) => (
                <LinhaDeInvestimento key={item.investimento.id} item={item} />
              ))}
            </div>
          </Secao>
        </>
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
    mutationFn: () => atualizarFeriados(new Date().getFullYear()),
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
          informar na mão
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
        Sem feriado cadastrado o rendimento erra cerca de 10 dias por ano, sempre para mais. Se a
        busca falhar, o app continua funcionando com o que já está gravado — nenhuma API aqui é
        caminho crítico.
      </p>
    </Cartao>
  );
}

function LinhaDeInvestimento({ item }: { item: InvestimentoCalculado }) {
  const cliente = useQueryClient();
  const { mostrar } = usarAviso();
  const [aberto, setAberto] = useState(false);
  const [saldo, setSaldo] = useState<Centavos>(item.saldoExibido);

  const { investimento: inv, resultado } = item;
  const rendimento = item.saldoExibido - inv.valorAplicado;

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
          </p>
          <p className="mt-0.5 text-xs text-slate-600">
            desde {formatarBR(inv.dataAplicacao)}
            {resultado && ` · ${resultado.diasUteis} dias úteis`}
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

      <button
        onClick={() => setAberto((v) => !v)}
        className="mt-3 text-xs text-slate-500 hover:text-slate-300"
      >
        {inv.calculoAutomatico ? 'conferir com o banco' : 'atualizar saldo'}
      </button>

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

function FormularioDeInvestimento({ aoTerminar }: { aoTerminar: () => void }) {
  const cliente = useQueryClient();
  const [nome, setNome] = useState('');
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
        tipo,
        indexador: semCalculo ? null : indexador,
        percentualIndexador: ehPrefixado ? null : Number(percentual.replace(',', '.')),
        taxaPrefixada: ehPrefixado ? Number(prefixada.replace(',', '.')) : null,
        dataAplicacao: data,
        valorAplicado: valor,
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
