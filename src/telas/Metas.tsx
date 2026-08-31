import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatarBR, hoje, somarMeses, type DataISO } from '../dominio/datas';
import { formatar, type Centavos } from '../dominio/dinheiro';
import { calcularReserva, progressoDaMeta } from '../dominio/orcamento';
import {
  HORIZONTE_MAXIMO_MESES,
  mesesParaAlcancar,
  projetarMeta,
} from '../dominio/metas';
import { entraNoConsolidado } from '../dominio/saldo';
import {
  aportarNaMeta,
  atualizarMeta,
  criarMeta,
  excluirAporte,
  excluirMeta,
  listarAportes,
  listarMetas,
  vincularInvestimentos,
  type FonteDaMeta,
  type Meta,
} from '../dados/orcamentos';
import { montarDadosDaProjecao } from '../dados/projecao';
import { usarContasComSaldo } from '../dados/usarContas';
import { calcularTodos } from '../dados/investimentos';
import { CampoValor } from '../ui/CampoValor';
import {
  ALVO_DE_TOQUE,
  Botao,
  Campo,
  Cartao,
  CartaoIndicador,
  Chip,
  Dinheiro,
  ENTRADA,
  Nota,
  Pagina,
  Secao,
  Vazio,
} from '../ui/base';
import { usarAcaoDaPagina } from '../ui/AcaoDaPagina';

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

  // O "+" da tela abre esta ficha, não a folha de lançamento (§5.1).
  usarAcaoDaPagina('Nova meta', () => setCriando(true));
  const contas = usarContasComSaldo();
  const projecao = useQuery({ queryKey: ['projecao'], queryFn: () => montarDadosDaProjecao() });
  const metas = useQuery({ queryKey: ['metas'], queryFn: listarMetas });


  // Investimento com liquidez diária É reserva (§8.8): dinheiro num RDB que se
  // resgata hoje cobre uma emergência exatamente como o da conta corrente.
  // Preso até o vencimento não cobre, por maior que seja — e somar os dois daria
  // uma reserva no papel que não existe na hora em que ela precisa existir.
  const investimentos = useQuery({ queryKey: ['investimentos', 'calculados'], queryFn: () => calcularTodos() });

  // As aplicações que uma meta pode marcar como sua.
  const aplicacoes = (investimentos.data ?? []).map((item) => ({
    id: item.investimento.id,
    nome: item.investimento.nome,
    saldo: item.saldoExibido,
  }));

  const emConta = (contas.data ?? [])
    .filter(entraNoConsolidado)
    .reduce((total, c) => total + c.saldoAtual, 0);

  const liquidos = (investimentos.data ?? [])
    .filter((item) => item.investimento.liquidezDiaria)
    .reduce((total, item) => total + item.saldoExibido, 0);

  const saldo = emConta + liquidos;

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
            número inventado seria pior que nenhum. Cadastre suas fixas em Atalhos.
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
              {liquidos > 0 && (
                <>
                  {' '}
                  No numerador entram as contas ({formatar(emConta)}) mais os investimentos com
                  liquidez diária ({formatar(liquidos)}) — o que está preso até o vencimento fica
                  de fora, porque não cobre emergência.
                </>
              )}
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
            descricao="Viagem, equipamento, troca de carro. Com prazo, a meta responde quanto guardar por mês. O progresso vem do que você separou — ou do saldo de uma aplicação reservada."
            acao={<Botao aoClicar={() => setCriando(true)}>Criar a primeira</Botao>}
          />
        ) : (
          <div className="space-y-2">
            {(metas.data ?? []).map((meta) => (
              <LinhaDaMeta key={meta.id} meta={meta} investimentos={aplicacoes} />
            ))}
          </div>
        )}
      </Secao>
    </Pagina>
  );
}

function LinhaDaMeta({
  meta,
  investimentos,
}: {
  meta: Meta;
  investimentos: { id: string; nome: string; saldo: Centavos }[];
}) {
  const cliente = useQueryClient();
  const [editando, setEditando] = useState(false);
  const [aportando, setAportando] = useState(false);
  const [alvo, setAlvo] = useState<Centavos>(meta.valorAlvo);
  const [prazo, setPrazo] = useState(meta.prazo ?? '');

  const valorAtual = meta.valorAtual;
  const progresso = progressoDaMeta(meta.valorAlvo, valorAtual);
  const projecao = projetarMeta(meta.valorAlvo, valorAtual, meta.prazo, hoje());

  const vincular = useMutation({
    mutationFn: (ids: string[]) => vincularInvestimentos(meta.id, ids),
    onSuccess: () => cliente.invalidateQueries({ queryKey: ['metas'] }),
  });

  const definirPrazo = useMutation({
    mutationFn: (prazo: DataISO | null) => atualizarMeta(meta.id, { prazo }),
    onSuccess: () => cliente.invalidateQueries({ queryKey: ['metas'] }),
  });

  const salvar = useMutation({
    mutationFn: () =>
      atualizarMeta(meta.id, { valorAlvo: alvo, prazo: prazo === '' ? null : prazo }),
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

      {meta.fonte === 'aporte' ? (
        <div className="mt-2">
          <button
            onClick={() => setAportando((v) => !v)}
            className={`text-xs text-slate-500 hover:text-slate-300 ${ALVO_DE_TOQUE}`}
          >
            {aportando ? 'Fechar' : 'Guardei mais'}
          </button>

          {aportando && (
            <AporteNaMeta metaId={meta.id} aoTerminar={() => setAportando(false)} />
          )}
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-[11px] uppercase tracking-wider text-slate-600">aplicações</span>
          {investimentos.map((investimento) => {
            const marcado = meta.investimentoIds.includes(investimento.id);
            return (
              <button
                key={investimento.id}
                onClick={() =>
                  vincular.mutate(
                    marcado
                      ? meta.investimentoIds.filter((id) => id !== investimento.id)
                      : [...meta.investimentoIds, investimento.id],
                  )
                }
                className={`rounded-full px-2.5 py-1 text-xs transition ${
                  marcado
                    ? 'bg-sky-900/60 text-sky-200'
                    : 'border border-borda text-slate-500 hover:border-borda-forte'
                }`}
              >
                {investimento.nome}
              </button>
            );
          })}
          {investimentos.length === 0 && (
            <span className="text-xs text-slate-600">
              Nenhuma aplicação cadastrada ainda.
            </span>
          )}
        </div>
      )}

      <p className="mt-2 text-xs leading-relaxed text-slate-600">
        {meta.fonte === 'aporte'
          ? 'O progresso é a soma do que você registrou ter separado — não o saldo de nenhuma conta.'
          : 'O progresso é o saldo das aplicações marcadas. Elas contam inteiras, então marque só o que estiver reservado para esta meta.'}
      </p>

      {editando && (
        <div className="mt-3 space-y-3 rounded-lg border border-borda-forte bg-superficie-alta p-3">
          <CampoValor valor={alvo} aoMudar={setAlvo} rotulo="Quanto quer juntar" />


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

/**
 * Cadastro de meta (§8.8).
 *
 * A pergunta que define tudo é ONDE o dinheiro está — e antes ela era
 * respondida com uma conta, o que fazia o saldo inteiro dela virar progresso.
 * Conta corrente nunca é dedicada a uma meta: o app dizia que a viagem estava
 * quase paga porque o salário tinha acabado de cair.
 *
 * As duas respostas honestas:
 *
 *   APORTE — você separa por decisão e registra. O progresso é a soma do que
 *   você disse ter guardado, e o app é explícito em que isso é declaração.
 *
 *   APLICAÇÕES — o dinheiro está numa aplicação reservada. Aqui o saldo inteiro
 *   conta, e conta certo, porque a aplicação É dedicada.
 */
function FormularioDeMeta({ aoTerminar }: { aoTerminar: () => void }) {
  const cliente = useQueryClient();
  const [nome, setNome] = useState('');
  const [valorAlvo, setValorAlvo] = useState<Centavos>(0);
  const [valorInicial, setValorInicial] = useState<Centavos>(0);
  const [prazo, setPrazo] = useState('');
  const [fonte, setFonte] = useState<FonteDaMeta>('aporte');
  const [escolhidos, setEscolhidos] = useState<string[]>([]);

  const investimentos = useQuery({
    queryKey: ['investimentos', 'calculados'],
    queryFn: () => calcularTodos(),
  });

  const criar = useMutation({
    mutationFn: () =>
      criarMeta({
        nome,
        valorAlvo,
        prazo: prazo === '' ? null : prazo,
        fonte,
        valorInicial,
        investimentoIds: escolhidos,
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
        rotulo="Como você guarda"
        ajuda={
          fonte === 'aporte'
            ? 'O progresso é a soma do que você registrar ter separado. Serve para quem mantém o dinheiro misturado e controla por decisão.'
            : 'O progresso é o saldo das aplicações escolhidas — elas contam inteiras, então escolha só o que estiver reservado para esta meta.'
        }
      >
        <div className="flex flex-wrap gap-2">
          <Chip ativo={fonte === 'aporte'} aoClicar={() => setFonte('aporte')}>
            Vou separando
          </Chip>
          <Chip ativo={fonte === 'investimentos'} aoClicar={() => setFonte('investimentos')}>
            Está numa aplicação
          </Chip>
        </div>
      </Campo>

      {fonte === 'aporte' ? (
        <CampoValor
          valor={valorInicial}
          aoMudar={setValorInicial}
          rotulo="Quanto já separou (opcional)"
        />
      ) : (
        <Campo rotulo="Quais aplicações">
          <div className="flex flex-wrap gap-2">
            {(investimentos.data ?? []).map((item) => {
              const marcado = escolhidos.includes(item.investimento.id);
              return (
                <button
                  key={item.investimento.id}
                  type="button"
                  onClick={() =>
                    setEscolhidos(
                      marcado
                        ? escolhidos.filter((id) => id !== item.investimento.id)
                        : [...escolhidos, item.investimento.id],
                    )
                  }
                  className={`rounded-full px-3 py-1.5 text-sm transition ${
                    marcado
                      ? 'bg-sky-900/60 text-sky-200'
                      : 'border border-borda-forte text-slate-300'
                  }`}
                >
                  {item.investimento.nome} · {formatar(item.saldoExibido)}
                </button>
              );
            })}
            {(investimentos.data ?? []).length === 0 && (
              <p className="text-xs text-slate-500">
                Nenhuma aplicação cadastrada. Cadastre em Investimentos, ou escolha "vou
                separando".
              </p>
            )}
          </div>
        </Campo>
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
 * "Guardei mais R$ X" (§8.8).
 *
 * Não move dinheiro: separar para uma meta é uma decisão, não uma
 * transferência. O app é explícito nisso em vez de fingir que o valor saiu de
 * algum lugar — quem quiser que saia de fato aplica e usa a outra fonte.
 *
 * O histórico fica: sem ele, corrigir um número exigiria adivinhar quanto tinha
 * antes, e o progresso viraria de novo um total digitado.
 */
function AporteNaMeta({ metaId, aoTerminar }: { metaId: string; aoTerminar: () => void }) {
  const cliente = useQueryClient();
  const [valor, setValor] = useState<Centavos>(0);
  const [data, setData] = useState<DataISO>(hoje());

  const aportes = useQuery({
    queryKey: ['aportes-meta', metaId],
    queryFn: () => listarAportes(metaId),
  });

  const invalidar = async () => {
    await cliente.invalidateQueries({ queryKey: ['metas'] });
    await cliente.invalidateQueries({ queryKey: ['aportes-meta', metaId] });
  };

  const guardar = useMutation({
    mutationFn: () => aportarNaMeta(metaId, valor, data),
    onSuccess: async () => {
      await invalidar();
      setValor(0);
    },
  });

  const remover = useMutation({
    mutationFn: (id: string) => excluirAporte(id),
    onSuccess: invalidar,
  });

  return (
    <div className="mt-2 space-y-3 rounded-lg border border-borda-forte bg-superficie-alta p-3">
      <CampoValor valor={valor} aoMudar={setValor} rotulo="Quanto separou agora" autoFocus />

      <Campo rotulo="Quando">
        <input
          type="date"
          value={data}
          onChange={(e) => e.target.value && setData(e.target.value)}
          className={ENTRADA}
        />
      </Campo>

      <div className="flex gap-2">
        <Botao aoClicar={() => guardar.mutate()} desabilitado={valor <= 0 || guardar.isPending}>
          Registrar
        </Botao>
        <Botao tipo="secundario" aoClicar={aoTerminar}>
          Fechar
        </Botao>
      </div>

      {(aportes.data ?? []).length > 0 && (
        <ul className="space-y-1 border-t border-borda pt-2">
          {aportes.data?.map((aporte) => (
            <li key={aporte.id} className="flex items-baseline justify-between gap-3 text-xs">
              <span className="text-slate-500">{formatarBR(aporte.data)}</span>
              <span className="flex items-baseline gap-3">
                <Dinheiro centavos={aporte.valor} className="text-slate-300" />
                <button
                  onClick={() => remover.mutate(aporte.id)}
                  className="text-slate-600 hover:text-red-400"
                >
                  remover
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <p className="text-[11px] leading-relaxed text-slate-500">
        Registrar aqui não move dinheiro de conta nenhuma — é a sua decisão de ter separado. Para o
        dinheiro sair do caixa de verdade, aplique e ligue a meta à aplicação.
      </p>
    </div>
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
