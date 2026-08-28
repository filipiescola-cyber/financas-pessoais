import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatarBR, hoje, somarMeses, type DataISO } from '../dominio/datas';
import { formatar, type Centavos } from '../dominio/dinheiro';
import { calcularReserva, progressoDaMeta } from '../dominio/orcamento';
import {
  HORIZONTE_MAXIMO_MESES,
  mesesParaAlcancar,
  origemDoValor,
  projetarMeta,
} from '../dominio/metas';
import { entraNoConsolidado } from '../dominio/saldo';
import {
  atualizarMeta,
  atualizarValorDaMeta,
  criarMeta,
  excluirMeta,
  listarMetas,
  vincularMetaAConta,
} from '../dados/orcamentos';
import { montarDadosDaProjecao } from '../dados/projecao';
import { usarContasComSaldo } from '../dados/usarContas';
import { CampoValor } from '../ui/CampoValor';
import { ALVO_DE_TOQUE, Botao, Campo, Cartao, CartaoIndicador, Dinheiro, ENTRADA, Nota, Pagina, Secao, Vazio } from '../ui/base';

/**
 * Metas e reserva de emergência (§8.8).
 *
 * A reserva é medida em MESES de custo fixo, não em reais: "você tem R$ 8.000"
 * não diz nada; "você tem 3,2 meses cobertos" diz tudo. O denominador é a
 * despesa fixa, porque em emergência real as variáveis são a primeira coisa
 * que se corta.
 */
export function Metas() {
  const [criando, setCriando] = useState(false);
  const contas = usarContasComSaldo();
  const projecao = useQuery({ queryKey: ['projecao'], queryFn: () => montarDadosDaProjecao() });
  const metas = useQuery({ queryKey: ['metas'], queryFn: listarMetas });

  const saldo = (contas.data ?? [])
    .filter(entraNoConsolidado)
    .reduce((total, c) => total + c.saldoAtual, 0);

  // Renda irregular muda a régua da reserva de 3 para 6 meses (§8.8). O sinal
  // aqui é a própria origem da projeção: quem tem salário fixo tem recorrência
  // de receita cadastrada e histórico estável.
  const rendaIrregular = (projecao.data?.renda.origem ?? 'ausente') !== 'historico'
    ? true
    : projecao.data!.renda.pessimista < projecao.data!.renda.otimista;

  const reserva = calcularReserva(saldo, projecao.data?.fixasMensais ?? 0, rendaIrregular);

  return (
    <Pagina
      titulo="Metas"
      subtitulo="Reserva e objetivos"
      acao={
        <Botao aoClicar={() => setCriando((v) => !v)} tipo={criando ? 'secundario' : 'primario'}>
          {criando ? 'Cancelar' : 'Nova meta'}
        </Botao>
      }
    >
      <Secao titulo="Reserva de emergência">
        {reserva.mesesCobertos === null ? (
          <Nota tom="atencao">
            Sem despesas fixas cadastradas, não dá para dizer quantos meses a reserva cobre — e um
            número inventado seria pior que nenhum. Cadastre suas fixas em Mais → Atalhos.
          </Nota>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <CartaoIndicador
                rotulo="Meses de custo fixo cobertos"
                sotaque={reserva.suficiente ? 'verde' : 'ambar'}
                valor={reserva.mesesCobertos.toFixed(1).replace('.', ',')}
                detalhe={`Referência para o seu caso: ${reserva.referencia} meses.`}
              />
              <CartaoIndicador
                rotulo="Custo de vida mínimo"
                sotaque="azul"
                tamanho="medio"
                valor={formatar(reserva.custoFixoMensal)}
                detalhe="Soma das despesas fixas. É o que precisa entrar todo mês para nada atrasar."
              />
            </div>
            <p className="text-xs leading-relaxed text-slate-600">
              O denominador é a despesa fixa, não a total: em emergência real as variáveis são a
              primeira coisa que se corta.
              {rendaIrregular &&
                ' Como sua renda oscila, a referência é 6 meses em vez de 3 — a receita pode sumir por um período inteiro.'}
            </p>
          </>
        )}
      </Secao>

      {criando && <FormularioDeMeta aoTerminar={() => setCriando(false)} />}

      <Secao titulo="Objetivos">
        {(metas.data ?? []).length === 0 ? (
          <Vazio
            titulo="Nenhuma meta cadastrada"
            descricao="Viagem, equipamento, troca de carro. Com prazo, a meta responde quanto guardar por mês. Vinculada a uma conta, ela para de depender de você lembrar quanto já juntou."
            acao={<Botao aoClicar={() => setCriando(true)}>Criar a primeira</Botao>}
          />
        ) : (
          <div className="space-y-2">
            {(metas.data ?? []).map((meta) => (
              <LinhaDaMeta key={meta.id} meta={meta} contas={contas.data ?? []} />
            ))}
          </div>
        )}
      </Secao>
    </Pagina>
  );
}

function LinhaDaMeta({
  meta,
  contas,
}: {
  meta: {
    id: string;
    nome: string;
    valorAlvo: Centavos;
    valorAtual: Centavos;
    prazo: DataISO | null;
    contaId: string | null;
  };
  contas: { id: string; nome: string; saldoAtual: Centavos }[];
}) {
  const cliente = useQueryClient();
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState<Centavos>(meta.valorAtual);
  const [alvo, setAlvo] = useState<Centavos>(meta.valorAlvo);
  const [prazo, setPrazo] = useState(meta.prazo ?? '');

  const contaVinculada = contas.find((c) => c.id === meta.contaId) ?? null;

  // Vinculada, o "quanto já tem" é o saldo real da conta. Sem vínculo, é o
  // número que o usuário informou — e a tela precisa dizer qual dos dois é.
  const valorAtual = contaVinculada ? contaVinculada.saldoAtual : meta.valorAtual;
  const origem = origemDoValor(contaVinculada ? meta.contaId : null);

  const progresso = progressoDaMeta(meta.valorAlvo, valorAtual);
  const projecao = projetarMeta(meta.valorAlvo, valorAtual, meta.prazo, hoje());

  const vincular = useMutation({
    mutationFn: (contaId: string | null) => vincularMetaAConta(meta.id, contaId),
    onSuccess: () => cliente.invalidateQueries({ queryKey: ['metas'] }),
  });

  const definirPrazo = useMutation({
    mutationFn: (prazo: DataISO | null) => atualizarMeta(meta.id, { prazo }),
    onSuccess: () => cliente.invalidateQueries({ queryKey: ['metas'] }),
  });

  const salvar = useMutation({
    mutationFn: async () => {
      await atualizarMeta(meta.id, { valorAlvo: alvo, prazo: prazo === '' ? null : prazo });
      // O valor só é editável quando é declarado: vinculado, ele vem da conta.
      if (origem === 'declarado') await atualizarValorDaMeta(meta.id, valor);
    },
    onSuccess: async () => {
      await cliente.invalidateQueries({ queryKey: ['metas'] });
      setEditando(false);
    },
  });

  const remover = useMutation({
    mutationFn: () => excluirMeta(meta.id),
    onSuccess: () => cliente.invalidateQueries({ queryKey: ['metas'] }),
  });

  return (
    <Cartao className="p-4">
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-slate-100">{meta.nome}</p>
          {meta.prazo && (
            <p className="text-xs text-slate-500">até {formatarBR(meta.prazo)}</p>
          )}
        </div>
        <div className="flex shrink-0 gap-3">
          <button
            onClick={() => {
              // Recarrega dos dados a cada abertura: o prazo pode ter sido
              // definido pelo atalho da projeção desde a última vez.
              if (!editando) {
                setAlvo(meta.valorAlvo);
                setValor(meta.valorAtual);
                setPrazo(meta.prazo ?? '');
              }
              setEditando((v) => !v);
            }}
            className={`text-xs text-slate-500 hover:text-slate-300 ${ALVO_DE_TOQUE}`}
          >
            {editando ? 'Fechar' : 'Editar'}
          </button>
          <button
            onClick={() => remover.mutate()}
            className={`text-xs text-slate-600 hover:text-red-400 ${ALVO_DE_TOQUE}`}
          >
            Excluir
          </button>
        </div>
      </div>

      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-superficie-alta">
        <div
          className={`h-full rounded-full transition-all ${
            progresso.concluida ? 'bg-emerald-500' : 'bg-sky-500'
          }`}
          style={{ width: `${progresso.proporcao * 100}%` }}
        />
      </div>

      <div className="mt-1.5 flex items-baseline justify-between gap-3 text-xs">
        <span className="text-slate-500">
          <Dinheiro centavos={valorAtual} className="text-slate-300" /> de{' '}
          <Dinheiro centavos={meta.valorAlvo} className="text-slate-400" />
        </span>
        <span className={progresso.concluida ? 'text-emerald-400' : 'text-slate-500'}>
          {progresso.concluida
            ? 'concluída'
            : `faltam ${formatar(progresso.falta)}`}
        </span>
      </div>

      {!progresso.concluida && (
        <div className="mt-2 text-xs leading-relaxed text-slate-500">
          {projecao.mensalNecessario === null ? (
            <SemPrazo falta={projecao.falta} aoDefinirPrazo={(data) => definirPrazo.mutate(data)} />
          ) : projecao.prazoVencido ? (
            <span className="text-amber-400/90">
              O prazo já passou e faltam {formatar(projecao.falta)}. Vale rever a data ou o alvo.
            </span>
          ) : (
            <>
              Guardando <strong className="text-slate-300">{formatar(projecao.mensalNecessario)}</strong>{' '}
              por mês você chega no prazo
              {projecao.mesesRestantes !== null && projecao.mesesRestantes > 0
                ? ` — são ${projecao.mesesRestantes} mês(es).`
                : ' — que é neste mês.'}
            </>
          )}
        </div>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="text-[11px] uppercase tracking-wider text-slate-600">onde está</span>
        {contas.map((conta) => (
          <button
            key={conta.id}
            onClick={() => vincular.mutate(meta.contaId === conta.id ? null : conta.id)}
            className={`rounded-full px-2.5 py-1 text-xs transition ${
              meta.contaId === conta.id
                ? 'bg-sky-900/60 text-sky-200'
                : 'border border-borda text-slate-500 hover:border-borda-forte'
            }`}
          >
            {conta.nome}
          </button>
        ))}
      </div>

      {origem === 'declarado' && (
        <p className="mt-2 text-xs leading-relaxed text-amber-400/70">
          Este valor foi digitado por você e o app não tem como confirmar. Vinculando a meta à
          conta onde o dinheiro está de fato, ele passa a vir do saldo real.
        </p>
      )}

      {editando && (
        <div className="mt-3 space-y-3 rounded-lg border border-borda-forte bg-superficie-alta p-3">
          <CampoValor valor={alvo} aoMudar={setAlvo} rotulo="Quanto quer juntar" />

          {origem === 'declarado' && (
            <CampoValor valor={valor} aoMudar={setValor} rotulo="Quanto já foi juntado" />
          )}

          <Campo
            rotulo="Prazo"
            ajuda="Sem data não há por quanto dividir — é o prazo que transforma o alvo em um valor por mês."
          >
            <input
              type="date"
              value={prazo}
              onChange={(e) => setPrazo(e.target.value)}
              className={ENTRADA}
            />
          </Campo>

          <div className="flex gap-2">
            <Botao aoClicar={() => salvar.mutate()} desabilitado={alvo <= 0 || salvar.isPending}>
              Salvar
            </Botao>
            <Botao tipo="secundario" aoClicar={() => setEditando(false)}>
              Cancelar
            </Botao>
          </div>
        </div>
      )}
    </Cartao>
  );
}

function FormularioDeMeta({ aoTerminar }: { aoTerminar: () => void }) {
  const cliente = useQueryClient();
  const [nome, setNome] = useState('');
  const [valorAlvo, setValorAlvo] = useState<Centavos>(0);
  const [valorAtual, setValorAtual] = useState<Centavos>(0);
  const [prazo, setPrazo] = useState('');
  const [contaId, setContaId] = useState<string | null>(null);
  const contas = usarContasComSaldo();

  const criar = useMutation({
    mutationFn: () =>
      criarMeta({
        nome,
        valorAlvo,
        valorAtual,
        prazo: prazo === '' ? null : prazo,
        contaId,
      }),
    onSuccess: async () => {
      await cliente.invalidateQueries({ queryKey: ['metas'] });
      aoTerminar();
    },
  });

  return (
    <Cartao className="space-y-4 p-4">
      <Campo rotulo="Nome">
        <input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Reserva de emergência, viagem, notebook…"
          autoFocus
          className={ENTRADA}
        />
      </Campo>

      <CampoValor valor={valorAlvo} aoMudar={setValorAlvo} rotulo="Quanto quer juntar" />

      <Campo
        rotulo="Onde o dinheiro está (opcional)"
        ajuda="Vinculando a meta a uma conta, o quanto você já tem passa a vir do saldo real em vez de ser digitado. Dizer que guardou sem ter o saldo em lugar nenhum é acreditar, não saber."
      >
        <div className="flex flex-wrap gap-2">
          {(contas.data ?? []).map((conta) => (
            <button
              key={conta.id}
              type="button"
              onClick={() => setContaId(contaId === conta.id ? null : conta.id)}
              className={`rounded-full px-3 py-1.5 text-sm transition ${
                contaId === conta.id
                  ? 'bg-sky-900/60 text-sky-200'
                  : 'border border-borda-forte text-slate-300'
              }`}
            >
              {conta.nome}
            </button>
          ))}
        </div>
      </Campo>

      {contaId === null && (
        <CampoValor valor={valorAtual} aoMudar={setValorAtual} rotulo="Quanto já tem" />
      )}

      <Campo rotulo="Prazo (opcional)">
        <input
          type="date"
          value={prazo}
          onChange={(e) => setPrazo(e.target.value)}
          className={ENTRADA}
        />
      </Campo>

      {criar.isError && <p className="text-sm text-red-400">{(criar.error as Error).message}</p>}

      <div className="flex gap-2">
        <Botao
          aoClicar={() => criar.mutate()}
          desabilitado={nome.trim() === '' || valorAlvo <= 0 || criar.isPending}
        >
          Salvar meta
        </Botao>
        <Botao tipo="secundario" aoClicar={aoTerminar}>
          Cancelar
        </Botao>
      </div>
    </Cartao>
  );
}

/**
 * Meta sem prazo.
 *
 * Sem data não há por quanto dividir. Mas a pergunta continua respondível pelo
 * outro lado: dizendo quanto consegue guardar por mês, o usuário descobre
 * quando chega — e essa data vira o prazo que faltava, fechando o ciclo.
 */
function SemPrazo({
  falta,
  aoDefinirPrazo,
}: {
  falta: Centavos;
  aoDefinirPrazo: (prazo: DataISO) => void;
}) {
  const [aporte, setAporte] = useState<Centavos>(0);

  const meses = mesesParaAlcancar(falta, aporte);
  const chegaEm = meses !== null && meses > 0 ? somarMeses(hoje(), meses) : null;

  return (
    <div className="space-y-2 rounded-lg border border-borda bg-superficie-alta p-3">
      <p className="text-slate-500">
        Sem prazo não dá para dividir o que falta. Diga quanto consegue guardar por mês e eu digo
        quando você chega — ou defina uma data em <span className="text-slate-400">editar</span>.
      </p>

      <CampoValor valor={aporte} aoMudar={setAporte} rotulo="Consigo guardar por mês" />

      {aporte > 0 && meses === null && (
        <p className="text-amber-400/80">
          Nesse ritmo a meta não chega — nem em {HORIZONTE_MAXIMO_MESES / 12} anos. Para valer, o
          valor mensal precisa ser maior.
        </p>
      )}

      {aporte > 0 && meses !== null && (
        <p className="text-slate-400">
          {meses === 0 ? (
            'A meta já está alcançada.'
          ) : (
            <>
              Guardando <strong className="text-slate-200">{formatar(aporte)}</strong> por mês você
              chega lá em {meses} mês(es), por volta de {formatarBR(chegaEm!).slice(3)}.{' '}
              <button
                onClick={() => aoDefinirPrazo(chegaEm!)}
                className="text-sky-400 underline underline-offset-2 hover:text-sky-300"
              >
                Usar essa data como prazo
              </button>
            </>
          )}
        </p>
      )}
    </div>
  );
}
