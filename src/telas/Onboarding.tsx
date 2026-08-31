import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatarBR, hoje, primeiroDiaDoMes, somarMeses } from '../dominio/datas';
import { formatar, type Centavos } from '../dominio/dinheiro';
import { descreverFatura, ehDiaValido, faturaDeReferencia } from '../dominio/fatura';
import { podePagarFatura } from '../dominio/saldo';
import { CampoValor } from '../ui/CampoValor';
import { usarAviso } from '../ui/Aviso';
import { CampoInstituicao } from '../ui/CampoInstituicao';
import {
  CampoInicio,
  CampoPrazo,
  CampoQuando,
  diaEhValido,
  inicioEscolhido,
  terminoEscolhido,
  type ModoDePrazo,
} from '../ui/CampoQuando';
import { usarFeriados } from '../dados/usarFeriados';
import { rotuloDoDia, type RegraDoDia } from '../dominio/recorrencias';
import { criarConta } from '../dados/contas';
import { criarCartao } from '../dados/cartoes';
import { criarRecorrencia } from '../dados/recorrencias';
import { criarLancamento, criarParcelamentoEmAndamento } from '../dados/transacoes';
import {
  ADIAVEIS,
  passosDaTrilha,
  trilhaDe,
  type Trilha,
  gravarSementesDeRenda,
  gravarStatusOnboarding,
  lerStatusOnboarding,
  passoDeEntrada,
  type PassoDoOnboarding,
} from '../dados/config';
import { usarContas } from '../dados/usarContas';
import { usarCartoes } from '../dados/usarCartoes';
import { usarCategorias } from '../dados/usarTransacoes';
import { usarInvalidarTransacoes } from '../dados/usarInvalidacao';
import { listarDividas } from '../dados/dividas';
import { FormularioDeDivida } from './Dividas';

/**
 * Onboarding (§4.1). Uma pergunta por tela, caminho MANUAL apenas.
 *
 * A importação de extrato existe (tela Importar), mas continua fora daqui de
 * propósito: quem está começando não tem o CSV em mãos no meio do cadastro, e
 * mandar buscar arquivo é onde se abandona o fluxo.
 *
 * Duas decisões estruturais:
 *
 *   A data de corte é o dia 1º do mês corrente, não hoje. Começar no meio do mês
 *   produz um primeiro relatório pela metade, que parece quebrado justamente
 *   quando o hábito ainda é frágil.
 *
 *   O progresso mora em `config`, no banco, não no navegador: parar no passo 3 e
 *   voltar depois — inclusive de outro aparelho — tem que retomar de onde parou.
 *
 * Meta: menos de 10 minutos.
 */
export function Onboarding() {
  const navegar = useNavigate();
  const cliente = useQueryClient();
  const { mostrar } = usarAviso();

  const status = useQuery({ queryKey: ['onboarding'], queryFn: lerStatusOnboarding });
  const [passo, setPasso] = useState<PassoDoOnboarding | null>(null);
  const [pulados, setPulados] = useState<PassoDoOnboarding[]>([]);
  const [escolhida, setEscolhida] = useState<Trilha | undefined>(undefined);
  // Onde o usuário estava antes de ser perguntado sobre a trilha. Sem guardar
  // isso, quem já tinha progresso seria mandado de volta ao primeiro passo só
  // por ter respondido a uma pergunta nova.
  const [retomarEm, setRetomarEm] = useState<PassoDoOnboarding | null>(null);

  useEffect(() => {
    if (status.data && passo === null) {
      // O passo gravado é onde o usuário parou. Onde o wizard ABRE é outra
      // coisa: depois de concluído, o gravado é o último, e entrar por ele
      // deixava a tela sem nada para fazer.
      setPasso(passoDeEntrada(status.data));
      setPulados(status.data.pulados);
      setEscolhida(status.data.trilha);
      setRetomarEm(status.data.trilha === undefined ? status.data.passoAtual : null);
    }
  }, [status.data, passo]);

  const dataDeCorte = primeiroDiaDoMes(hoje());

  // A lista de passos é função da trilha escolhida (§4.1). Trocar de trilha no
  // primeiro passo muda tudo que vem depois — inclusive a barra de progresso,
  // que precisa contar sobre a trilha em uso e não sobre um total fixo.
  const trilha = trilhaDe({ concluido: false, passoAtual: passo ?? 'trilha', pulados, trilha: escolhida });
  const passos = passosDaTrilha(trilha);
  const indice = passo ? Math.max(0, passos.indexOf(passo)) : 0;

  async function irPara(proximo: PassoDoOnboarding | 'fim', pulandoAtual = false) {
    const novosPulados =
      pulandoAtual && passo ? [...new Set([...pulados, passo])] : pulados;
    setPulados(novosPulados);

    if (proximo === 'fim') {
      await gravarStatusOnboarding({
        concluido: true,
        passoAtual: passos[passos.length - 1]!,
        pulados: novosPulados,
        trilha,
      });
      await cliente.invalidateQueries({ queryKey: ['onboarding'] });
      mostrar('Onboarding concluído.');
      navegar('/');
      return;
    }

    await gravarStatusOnboarding({
      concluido: false,
      passoAtual: proximo,
      pulados: novosPulados,
      trilha,
    });
    await cliente.invalidateQueries({ queryKey: ['onboarding'] });
    setPasso(proximo);
    window.scrollTo(0, 0);
  }

  function avancar(pulandoAtual = false) {
    const proximo = passos[indice + 1];
    return irPara(proximo ?? 'fim', pulandoAtual);
  }

  if (status.isPending || passo === null) {
    return <p className="p-6 text-slate-400">Carregando…</p>;
  }

  return (
    <div className="mx-auto max-w-lg space-y-5 p-4 pb-28">
      <header className="space-y-2">
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>
            Passo {indice + 1} de {passos.length}
          </span>
          <button onClick={() => navegar('/')} className="hover:text-slate-300">
            Continuar depois
          </button>
        </div>
        <div className="h-1 w-full overflow-hidden rounded-full bg-superficie-alta">
          <div
            className="h-full bg-emerald-600 transition-all"
            style={{ width: `${((indice + 1) / passos.length) * 100}%` }}
          />
        </div>
      </header>

      {passo === 'trilha' && (
        <PassoTrilha
          escolhida={trilha}
          aoEscolher={setEscolhida}
          aoAvancar={() => {
            // Volta para onde parou, quando o passo salvo ainda existe na
            // trilha escolhida. Trocar para uma trilha que não o tem cai no
            // começo, que é o único destino honesto.
            const retomar =
              retomarEm && retomarEm !== 'trilha' && passos.includes(retomarEm)
                ? retomarEm
                : null;
            setRetomarEm(null);
            return retomar ? irPara(retomar) : avancar();
          }}
        />
      )}
      {passo === 'carteira' && <PassoCarteira aoAvancar={() => avancar()} />}
      {passo === 'contas' && <PassoContas dataDeCorte={dataDeCorte} aoAvancar={() => avancar()} />}
      {passo === 'cartoes' && <PassoCartoes aoAvancar={() => avancar()} />}
      {passo === 'fatura-aberta' && (
        <PassoFaturaAberta aoAvancar={() => avancar()} aoPular={() => avancar(true)} />
      )}
      {passo === 'parcelamentos' && (
        <PassoParcelamentos aoAvancar={() => avancar()} aoPular={() => avancar(true)} />
      )}
      {passo === 'despesas-fixas' && <PassoDespesasFixas aoAvancar={() => avancar()} />}
      {passo === 'fontes-de-renda' && <PassoFontesDeRenda aoAvancar={() => avancar()} />}
      {passo === 'empresa' && <PassoEmpresa aoAvancar={() => avancar()} />}
      {passo === 'conceito-cartao' && <ConceitoDoCartao aoAvancar={() => avancar()} />}
      {passo === 'conceito-natureza' && <ConceitoDaNatureza aoAvancar={() => avancar()} />}
      {passo === 'dividas' && <PassoDividas aoAvancar={() => avancar()} />}
      {passo === 'categorias' && (
        <PassoCategorias
          aoConcluir={() => (trilha === 'completa' ? avancar() : irPara('fim'))}
          ultimo={trilha !== 'completa'}
        />
      )}
      {passo === 'tour' && <TourFinal aoConcluir={() => irPara('fim')} />}

      {ADIAVEIS.includes(passo) && (
        <p className="text-center text-xs text-slate-600">
          Este passo pode ser adiado, mas a projeção fica incompleta até ele existir.
        </p>
      )}
    </div>
  );
}

function Titulo({ children, ajuda }: { children: React.ReactNode; ajuda?: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <h1 className="text-xl font-semibold text-slate-100">{children}</h1>
      {ajuda && <p className="text-sm text-slate-400">{ajuda}</p>}
    </div>
  );
}

function Avancar({
  aoClicar,
  rotulo = 'Continuar',
  desabilitado,
}: {
  aoClicar: () => void;
  rotulo?: string;
  desabilitado?: boolean;
}) {
  return (
    <button
      onClick={aoClicar}
      disabled={desabilitado}
      className="w-full rounded-lg bg-emerald-600 px-4 py-3 font-medium text-white disabled:opacity-40"
    >
      {rotulo}
    </button>
  );
}

function Pular({ aoClicar }: { aoClicar: () => void }) {
  return (
    <button onClick={aoClicar} className="w-full py-2 text-sm text-slate-500 hover:text-slate-300">
      Pular por enquanto
    </button>
  );
}

// ---------------------------------------------------------------- passo 1 --

function PassoCarteira({ aoAvancar }: { aoAvancar: () => void }) {
  const contas = usarContas();
  const cliente = useQueryClient();
  const [valor, setValor] = useState<Centavos>(0);

  const jaExiste = (contas.data ?? []).some((c) => c.tipo === 'carteira');

  const criar = useMutation({
    mutationFn: () => criarConta({ nome: 'Carteira', tipo: 'carteira', saldoInicial: valor }),
    onSuccess: async () => {
      await cliente.invalidateQueries({ queryKey: ['contas'] });
      aoAvancar();
    },
  });

  return (
    <div className="space-y-4">
      <Titulo ajuda="Quanto você tem em dinheiro físico agora, no bolso ou na gaveta.">
        Carteira
      </Titulo>

      {jaExiste ? (
        <>
          <p className="rounded-lg border border-borda bg-superficie p-4 text-sm text-slate-300">
            Você já tem uma carteira cadastrada.
          </p>
          <Avancar aoClicar={aoAvancar} />
        </>
      ) : (
        <>
          <CampoValor valor={valor} aoMudar={setValor} autoFocus />
          <p className="text-xs text-slate-500">
            Não vale caçar cada R$ 5 de café. A carteira derrapa por natureza, e o acerto é a
            contagem mensal. Se você quase não usa dinheiro, pode deixar zero.
          </p>
          <Avancar aoClicar={() => criar.mutate()} desabilitado={criar.isPending} />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- passo 2 --

function PassoContas({ dataDeCorte, aoAvancar }: { dataDeCorte: string; aoAvancar: () => void }) {
  const contas = usarContas();
  const cliente = useQueryClient();
  const [nome, setNome] = useState('');
  const [instituicao, setInstituicao] = useState('');
  const [cor, setCor] = useState<string | null>(null);
  const [saldo, setSaldo] = useState<Centavos>(0);

  const bancarias = (contas.data ?? []).filter((c) =>
    ['corrente', 'poupanca', 'investimento'].includes(c.tipo),
  );

  const criar = useMutation({
    mutationFn: () =>
      criarConta({ nome, tipo: 'corrente', instituicao, cor, saldoInicial: saldo }),
    onSuccess: async () => {
      await cliente.invalidateQueries({ queryKey: ['contas'] });
      setNome('');
      setInstituicao('');
      setCor(null);
      setSaldo(0);
    },
  });

  return (
    <div className="space-y-4">
      <Titulo
        ajuda={
          <>
            O saldo do dia <strong>{formatarBR(dataDeCorte)}</strong> — o primeiro dia deste mês —
            não o de hoje.
          </>
        }
      >
        Contas bancárias
      </Titulo>

      <p className="rounded-lg border border-borda bg-superficie p-3 text-xs text-slate-400">
        Começar no dia 1º entrega um mês fechado de verdade já na primeira virada. Começar hoje
        produz um primeiro relatório pela metade, que parece quebrado justo quando o hábito ainda é
        frágil.
      </p>

      {bancarias.length > 0 && (
        <ul className="space-y-1">
          {bancarias.map((conta) => (
            <li
              key={conta.id}
              className="flex justify-between rounded-lg border border-borda px-3 py-2 text-sm"
            >
              <span className="flex items-center gap-2 text-slate-200">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: conta.cor ?? 'var(--color-borda-forte)' }}
                />
                {conta.nome}
              </span>
              <span className="text-slate-400">{formatar(conta.saldoInicial)}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-3 rounded-xl border border-borda bg-superficie p-4">
        <input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Nome da conta"
          className="w-full rounded-lg border border-borda-forte bg-superficie-alta px-3 py-2 text-slate-100 outline-none focus:border-slate-500"
        />
        <CampoInstituicao
          instituicao={instituicao}
          cor={cor}
          aoMudar={(nova, novaCor) => {
            setInstituicao(nova);
            setCor(novaCor);
          }}
        />
        <CampoValor valor={saldo} aoMudar={setSaldo} rotulo={`Saldo em ${formatarBR(dataDeCorte)}`} />
        <button
          onClick={() => criar.mutate()}
          disabled={nome.trim() === '' || criar.isPending}
          className="w-full rounded-lg border border-borda-forte px-4 py-2 text-sm text-slate-200 disabled:opacity-40"
        >
          Adicionar conta
        </button>
      </div>

      <Avancar aoClicar={aoAvancar} rotulo={bancarias.length > 0 ? 'Continuar' : 'Pular'} />
    </div>
  );
}

// ---------------------------------------------------------------- passo 3 --

function PassoCartoes({ aoAvancar }: { aoAvancar: () => void }) {
  const cartoes = usarCartoes();
  const cliente = useQueryClient();
  const contas = usarContas();
  const [nome, setNome] = useState('');
  const [instituicao, setInstituicao] = useState('');
  const [cor, setCor] = useState<string | null>(null);
  const [fechamento, setFechamento] = useState('');
  const [vencimento, setVencimento] = useState('');
  const [limite, setLimite] = useState<Centavos>(0);
  const [contaPagamentoId, setContaPagamentoId] = useState<string | null>(null);

  const pagadoras = (contas.data ?? []).filter(podePagarFatura);

  const dias = { diaFechamento: Number(fechamento), diaVencimento: Number(vencimento) };
  const diasOk = ehDiaValido(dias.diaFechamento) && ehDiaValido(dias.diaVencimento);

  const criar = useMutation({
    mutationFn: () =>
      criarCartao({
        nome,
        instituicao,
        cor,
        limite: limite === 0 ? null : limite,
        contaPagamentoId,
        ...dias,
      }),
    onSuccess: async () => {
      await cliente.invalidateQueries({ queryKey: ['cartoes'] });
      await cliente.invalidateQueries({ queryKey: ['contas'] });
      setNome('');
      setInstituicao('');
      setCor(null);
      setFechamento('');
      setVencimento('');
      setLimite(0);
      setContaPagamentoId(null);
    },
  });

  return (
    <div className="space-y-4">
      <Titulo ajuda="Os dias de fechamento e vencimento são obrigatórios: sem eles a fatura não fecha.">
        Cartões
      </Titulo>

      {(cartoes.data ?? []).length > 0 && (
        <ul className="space-y-1">
          {cartoes.data?.map((cartao) => (
            <li key={cartao.contaId} className="rounded-lg border border-borda px-3 py-2 text-sm">
              <span className="text-slate-200">{cartao.conta.nome}</span>
              <span className="text-slate-500">
                {' '}
                · fecha {cartao.diaFechamento}, vence {cartao.diaVencimento}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-3 rounded-xl border border-borda bg-superficie p-4">
        <input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Apelido do cartão"
          className="w-full rounded-lg border border-borda-forte bg-superficie-alta px-3 py-2 text-slate-100 outline-none focus:border-slate-500"
        />
        <CampoInstituicao
          instituicao={instituicao}
          cor={cor}
          aoMudar={(nova, novaCor) => {
            setInstituicao(nova);
            setCor(novaCor);
          }}
        />
        <div className="grid grid-cols-2 gap-3">
          <input
            inputMode="numeric"
            value={fechamento}
            onChange={(e) => setFechamento(e.target.value.replace(/\D/g, '').slice(0, 2))}
            placeholder="Dia do fechamento"
            className="w-full rounded-lg border border-borda-forte bg-superficie-alta px-3 py-2 text-slate-100 outline-none focus:border-slate-500"
          />
          <input
            inputMode="numeric"
            value={vencimento}
            onChange={(e) => setVencimento(e.target.value.replace(/\D/g, '').slice(0, 2))}
            placeholder="Dia do vencimento"
            className="w-full rounded-lg border border-borda-forte bg-superficie-alta px-3 py-2 text-slate-100 outline-none focus:border-slate-500"
          />
        </div>
        {diasOk && (
          <p className="rounded-md border border-emerald-800/50 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-200">
            {descreverFatura(faturaDeReferencia(hoje(), dias))}
          </p>
        )}
        <CampoValor valor={limite} aoMudar={setLimite} rotulo="Limite (opcional)" />

        {pagadoras.length > 0 && (
          <div>
            <p className="mb-1.5 text-sm text-slate-400">Qual conta paga a fatura? (opcional)</p>
            <div className="flex flex-wrap gap-2">
              {pagadoras.map((conta) => (
                <button
                  key={conta.id}
                  onClick={() =>
                    setContaPagamentoId(contaPagamentoId === conta.id ? null : conta.id)
                  }
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm ${
                    contaPagamentoId === conta.id
                      ? 'bg-emerald-600 text-white'
                      : 'border border-borda-forte text-slate-300'
                  }`}
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: conta.cor ?? 'var(--color-borda-forte)' }}
                  />
                  {conta.nome}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-slate-500">
              É de onde o dinheiro sai no vencimento. Informando agora, pagar a fatura depois vira
              um toque — sem escolher a conta toda vez.
            </p>
          </div>
        )}

        <button
          onClick={() => criar.mutate()}
          disabled={nome.trim() === '' || !diasOk || criar.isPending}
          className="w-full rounded-lg border border-borda-forte px-4 py-2 text-sm text-slate-200 disabled:opacity-40"
        >
          Adicionar cartão
        </button>
      </div>

      <Avancar aoClicar={aoAvancar} rotulo={(cartoes.data ?? []).length > 0 ? 'Continuar' : 'Não uso cartão'} />
    </div>
  );
}

// ---------------------------------------------------------------- passo 4 --

function PassoFaturaAberta({
  aoAvancar,
  aoPular,
}: {
  aoAvancar: () => void;
  aoPular: () => void;
}) {
  const cartoes = usarCartoes();
  const invalidar = usarInvalidarTransacoes();
  const [porCartao, setPorCartao] = useState<Record<string, Centavos>>({});
  const lista = cartoes.data ?? [];

  const gravar = useMutation({
    mutationFn: async () => {
      for (const cartao of lista) {
        const valor = porCartao[cartao.contaId] ?? 0;
        if (valor <= 0) continue;
        await criarLancamento({
          tipo: 'despesa',
          valor,
          contaId: cartao.contaId,
          categoriaId: null,
          data: hoje(),
          descricao: 'Fatura já acumulada no início do uso do app',
          cartao,
        });
      }
    },
    onSuccess: async () => {
      await invalidar();
      aoAvancar();
    },
  });

  if (lista.length === 0) {
    return (
      <div className="space-y-4">
        <Titulo ajuda="Sem cartão cadastrado, não há fatura aberta.">Fatura aberta</Titulo>
        <Avancar aoClicar={aoAvancar} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Titulo ajuda="Quanto já está acumulado na fatura atual de cada cartão.">
        Fatura aberta
      </Titulo>

      <p className="rounded-lg border border-borda bg-superficie p-3 text-xs text-slate-400">
        Sem isso o app acha que o mês está barato e o dashboard mente. O valor entra como um único
        lançamento, que você pode detalhar depois.
      </p>

      <div className="space-y-3">
        {lista.map((cartao) => (
          <div key={cartao.contaId} className="rounded-xl border border-borda bg-superficie p-4">
            <CampoValor
              valor={porCartao[cartao.contaId] ?? 0}
              aoMudar={(v) => setPorCartao((atual) => ({ ...atual, [cartao.contaId]: v }))}
              rotulo={cartao.conta.nome}
            />
          </div>
        ))}
      </div>

      <Avancar aoClicar={() => gravar.mutate()} desabilitado={gravar.isPending} />
      <Pular aoClicar={aoPular} />
    </div>
  );
}

// ---------------------------------------------------------------- passo 5 --

function PassoParcelamentos({
  aoAvancar,
  aoPular,
}: {
  aoAvancar: () => void;
  aoPular: () => void;
}) {
  const cartoes = usarCartoes();
  const contas = usarContas();
  const invalidar = usarInvalidarTransacoes();
  const { mostrar } = usarAviso();

  const [descricao, setDescricao] = useState('');
  const [valorParcela, setValorParcela] = useState<Centavos>(0);
  const [jaPagas, setJaPagas] = useState('');
  const [total, setTotal] = useState('');
  const [contaId, setContaId] = useState<string | null>(null);
  const [adicionados, setAdicionados] = useState<string[]>([]);

  const opcoes = useMemo(
    () => (contas.data ?? []).filter((c) => c.tipo === 'cartao_credito' || c.tipo === 'corrente'),
    [contas.data],
  );

  useEffect(() => {
    if (contaId === null && opcoes.length > 0) setContaId(opcoes[0]?.id ?? null);
  }, [opcoes, contaId]);

  const pagas = Number(jaPagas);
  const totalNum = Number(total);
  const valido =
    contaId !== null &&
    valorParcela > 0 &&
    Number.isInteger(pagas) &&
    pagas >= 0 &&
    Number.isInteger(totalNum) &&
    totalNum > pagas;

  const cartao = cartoes.data?.find((c) => c.contaId === contaId) ?? null;
  const restantes = valido ? totalNum - pagas : 0;
  const proximaCompetencia = somarMeses(hoje(), 1);

  const adicionar = useMutation({
    mutationFn: () =>
      criarParcelamentoEmAndamento({
        contaId: contaId!,
        categoriaId: null,
        descricao,
        valorDaParcela: valorParcela,
        jaPagas: pagas,
        totalDeParcelas: totalNum,
        competenciaDaProxima: proximaCompetencia,
        cartao,
      }),
    onSuccess: async (ids) => {
      await invalidar();
      setAdicionados((atual) => [...atual, `${descricao || 'Parcelamento'} · ${ids.length}x`]);
      mostrar(`${ids.length} parcelas futuras geradas.`);
      setDescricao('');
      setValorParcela(0);
      setJaPagas('');
      setTotal('');
    },
  });

  return (
    <div className="space-y-4">
      <Titulo ajuda="Compras parceladas que você já tinha antes de começar a usar o app.">
        Parcelamentos em andamento
      </Titulo>

      <p className="rounded-lg border border-amber-800/40 bg-amber-950/20 p-3 text-xs text-amber-200/90">
        É o passo mais importante do onboarding. Sem ele os próximos meses aparecem artificialmente
        baratos e a projeção não serve para nada — "12x sem juros" é renda futura já gasta.
      </p>

      {adicionados.length > 0 && (
        <ul className="space-y-1 text-sm text-slate-300">
          {adicionados.map((item, i) => (
            <li key={i} className="rounded-lg border border-borda px-3 py-2">
              {item}
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-3 rounded-xl border border-borda bg-superficie p-4">
        <input
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          placeholder="O que foi (ex.: Notebook)"
          className="w-full rounded-lg border border-borda-forte bg-superficie-alta px-3 py-2 text-slate-100 outline-none focus:border-slate-500"
        />
        <CampoValor valor={valorParcela} aoMudar={setValorParcela} rotulo="Valor de cada parcela" />
        <div className="grid grid-cols-2 gap-3">
          <input
            inputMode="numeric"
            value={jaPagas}
            onChange={(e) => setJaPagas(e.target.value.replace(/\D/g, '').slice(0, 2))}
            placeholder="Já paguei"
            className="w-full rounded-lg border border-borda-forte bg-superficie-alta px-3 py-2 text-slate-100 outline-none focus:border-slate-500"
          />
          <input
            inputMode="numeric"
            value={total}
            onChange={(e) => setTotal(e.target.value.replace(/\D/g, '').slice(0, 2))}
            placeholder="De um total de"
            className="w-full rounded-lg border border-borda-forte bg-superficie-alta px-3 py-2 text-slate-100 outline-none focus:border-slate-500"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {opcoes.map((conta) => (
            <button
              key={conta.id}
              onClick={() => setContaId(conta.id)}
              className={`rounded-full px-3 py-1.5 text-sm ${
                contaId === conta.id
                  ? 'bg-emerald-600 text-white'
                  : 'border border-borda-forte text-slate-300'
              }`}
            >
              {conta.nome}
            </button>
          ))}
        </div>

        {valido && (
          <p className="text-xs text-slate-400">
            Vou gerar <strong>{restantes}</strong> parcelas de {formatar(valorParcela)}, da{' '}
            {pagas + 1}ª à {totalNum}ª, a partir de {formatarBR(proximaCompetencia)}. Total ainda
            comprometido: {formatar(restantes * valorParcela)}.
          </p>
        )}

        <button
          onClick={() => adicionar.mutate()}
          disabled={!valido || adicionar.isPending}
          className="w-full rounded-lg border border-borda-forte px-4 py-2 text-sm text-slate-200 disabled:opacity-40"
        >
          Adicionar parcelamento
        </button>
      </div>

      <Avancar aoClicar={aoAvancar} />
      <Pular aoClicar={aoPular} />
    </div>
  );
}

// ---------------------------------------------------------------- passo 6 --

function PassoDespesasFixas({ aoAvancar }: { aoAvancar: () => void }) {
  const contas = usarContas();
  const categorias = usarCategorias();
  const cliente = useQueryClient();

  const [descricao, setDescricao] = useState('');
  const [valor, setValor] = useState<Centavos>(0);
  const [dia, setDia] = useState('');
  const [regra, setRegra] = useState<RegraDoDia>('fixo');
  const [mesInicial, setMesInicial] = useState('');
  const [modoPrazo, setModoPrazo] = useState<ModoDePrazo>('sem');
  const [parcelas, setParcelas] = useState('');
  const [mesFinal, setMesFinal] = useState('');
  const [categoriaId, setCategoriaId] = useState<string | null>(null);
  const [adicionadas, setAdicionadas] = useState<string[]>([]);

  const feriados = usarFeriados();

  const contaPadrao = (contas.data ?? []).find((c) => c.tipo === 'corrente') ?? contas.data?.[0];
  const fixas = (categorias.data ?? []).filter(
    (c) => c.tipo === 'despesa' && c.natureza === 'fixa',
  );

  const diaNum = Number(dia);
  const terminaEm = terminoEscolhido(modoPrazo, parcelas, mesFinal, diaNum, regra, feriados);
  const prazoOk = modoPrazo === 'sem' || terminaEm !== null;
  const valido =
    descricao.trim() !== '' && valor > 0 && diaEhValido(diaNum, regra) && prazoOk && contaPadrao;

  const adicionar = useMutation({
    mutationFn: () =>
      criarRecorrencia({
        descricao,
        valorPrevisto: valor,
        categoriaId,
        contaId: contaPadrao!.id,
        tipo: 'despesa',
        natureza: 'fixa',
        dia: diaNum,
        regra,
        comecaEm: inicioEscolhido(mesInicial),
        terminaEm,
      }),
    onSuccess: async () => {
      await cliente.invalidateQueries({ queryKey: ['recorrencias'] });
      setAdicionadas((atual) => [
        ...atual,
        `${descricao} · ${formatar(valor)} · ${rotuloDoDia(diaNum, regra)}` +
          (terminaEm ? ` · até ${formatarBR(terminaEm)}` : ''),
      ]);
      setDescricao('');
      setValor(0);
      setDia('');
      setRegra('fixo');
      setMesInicial('');
      setModoPrazo('sem');
      setParcelas('');
      setMesFinal('');
      setCategoriaId(null);
    },
  });

  return (
    <div className="space-y-4">
      <Titulo ajuda="Aluguel, internet, assinaturas, plano de saúde — o que vence todo mês.">
        Despesas fixas
      </Titulo>

      <p className="rounded-lg border border-borda bg-superficie p-3 text-xs text-slate-400">
        A soma das fixas é o seu custo de vida mínimo: quanto precisa entrar todo mês para nada
        atrasar. Uma vez cadastradas, elas geram o lançamento sozinhas no dia certo — e de forma
        retroativa, então ficar dias sem abrir o app não perde nenhum.
      </p>

      {adicionadas.length > 0 && (
        <ul className="space-y-1 text-sm text-slate-300">
          {adicionadas.map((item, i) => (
            <li key={i} className="rounded-lg border border-borda px-3 py-2">
              {item}
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-3 rounded-xl border border-borda bg-superficie p-4">
        <input
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          placeholder="Aluguel, Internet, Netflix…"
          className="w-full rounded-lg border border-borda-forte bg-superficie-alta px-3 py-2 text-slate-100 outline-none focus:border-slate-500"
        />
        <CampoValor valor={valor} aoMudar={setValor} rotulo="Valor mensal" />
        <CampoQuando
          rotulo="Dia do vencimento"
          dia={dia}
          regra={regra}
          feriados={feriados}
          aPartirDe={inicioEscolhido(mesInicial)}
          aoMudarDia={setDia}
          aoMudarRegra={setRegra}
        />
        <CampoInicio mes={mesInicial} aoMudar={setMesInicial} />
        <CampoPrazo
          modo={modoPrazo}
          parcelas={parcelas}
          mesFinal={mesFinal}
          terminaEm={terminaEm}
          dia={diaNum}
          regra={regra}
          feriados={feriados}
          aoMudarModo={setModoPrazo}
          aoMudarParcelas={setParcelas}
          aoMudarMesFinal={setMesFinal}
        />
        <div className="flex flex-wrap gap-2">
          {fixas.map((categoria) => (
            <button
              key={categoria.id}
              onClick={() => setCategoriaId(categoria.id === categoriaId ? null : categoria.id)}
              className={`rounded-full px-3 py-1.5 text-sm ${
                categoriaId === categoria.id
                  ? 'bg-emerald-600 text-white'
                  : 'border border-borda-forte text-slate-300'
              }`}
            >
              {categoria.nome}
            </button>
          ))}
        </div>
        <button
          onClick={() => adicionar.mutate()}
          disabled={!valido || adicionar.isPending}
          className="w-full rounded-lg border border-borda-forte px-4 py-2 text-sm text-slate-200 disabled:opacity-40"
        >
          Adicionar despesa fixa
        </button>
      </div>

      <Avancar aoClicar={aoAvancar} />
    </div>
  );
}

// ---------------------------------------------------------------- passo 7 --

function PassoFontesDeRenda({ aoAvancar }: { aoAvancar: () => void }) {
  const contas = usarContas();
  const categorias = usarCategorias();
  const cliente = useQueryClient();

  const [tipoDeFonte, setTipoDeFonte] = useState<'fixa' | 'variavel'>('fixa');
  const [descricao, setDescricao] = useState('');
  const [valor, setValor] = useState<Centavos>(0);
  const [dia, setDia] = useState('');
  const [regra, setRegra] = useState<RegraDoDia>('fixo');
  const [mesTipico, setMesTipico] = useState<Centavos>(0);
  const [mesRuim, setMesRuim] = useState<Centavos>(0);
  const [adicionadas, setAdicionadas] = useState<string[]>([]);

  const feriados = usarFeriados();
  const contaPadrao = (contas.data ?? []).find((c) => c.tipo === 'corrente') ?? contas.data?.[0];
  const salario = (categorias.data ?? []).find((c) => c.tipo === 'receita' && c.nome === 'Salário');

  const adicionarFixa = useMutation({
    mutationFn: () =>
      criarRecorrencia({
        descricao,
        valorPrevisto: valor,
        categoriaId: salario?.id ?? null,
        contaId: contaPadrao!.id,
        tipo: 'receita',
        natureza: 'fixa',
        dia: Number(dia),
        regra,
      }),
    onSuccess: async () => {
      await cliente.invalidateQueries({ queryKey: ['recorrencias'] });
      setAdicionadas((atual) => [
        ...atual,
        `${descricao} · ${formatar(valor)} · ${rotuloDoDia(Number(dia), regra)}`,
      ]);
      setDescricao('');
      setValor(0);
      setDia('');
      setRegra('fixo');
    },
  });

  const salvarSementes = useMutation({
    mutationFn: () => gravarSementesDeRenda({ mesTipico, mesRuim }),
    onSuccess: () => aoAvancar(),
  });

  return (
    <div className="space-y-4">
      <Titulo ajuda="De onde vem o dinheiro. Sempre o valor líquido — o que cai na conta.">
        Fontes de renda
      </Titulo>

      <p className="rounded-lg border border-borda bg-superficie p-3 text-xs text-slate-400">
        Se você tem MEI: sua renda pessoal é o que você <strong>retira</strong> — pró-labore ou
        distribuição de lucro. Venda do negócio é receita da empresa, não sua, e cadastrá-la aqui
        infla a sua renda sem trazer as despesas correspondentes.
      </p>

      <div className="flex gap-1 rounded-lg bg-superficie-alta p-1">
        {(['fixa', 'variavel'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTipoDeFonte(t)}
            className={`flex-1 rounded-md px-2 py-1.5 text-sm ${
              tipoDeFonte === t ? 'bg-slate-700 text-slate-100' : 'text-slate-400'
            }`}
          >
            {t === 'fixa' ? 'Valor fixo todo mês' : 'Valor que oscila'}
          </button>
        ))}
      </div>

      {tipoDeFonte === 'fixa' ? (
        <div className="space-y-3 rounded-xl border border-borda bg-superficie p-4">
          {adicionadas.map((item, i) => (
            <p key={i} className="rounded-lg border border-borda px-3 py-2 text-sm text-slate-300">
              {item}
            </p>
          ))}
          <input
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder="Salário, Pró-labore…"
            className="w-full rounded-lg border border-borda-forte bg-superficie-alta px-3 py-2 text-slate-100 outline-none focus:border-slate-500"
          />
          <CampoValor valor={valor} aoMudar={setValor} rotulo="Valor líquido" />
          <CampoQuando
            rotulo="Dia do recebimento"
            dia={dia}
            regra={regra}
            feriados={feriados}
            aoMudarDia={setDia}
            aoMudarRegra={setRegra}
          />
          <p className="text-xs text-slate-500">
            Salário quase nunca cai num dia fixo: "5º dia útil" é o mais comum, e a data muda todo
            mês. Escolhendo a regra, a previsão acerta sozinha em vez de errar todo mês em que o dia
            cair num sábado.
          </p>
          <button
            onClick={() => adicionarFixa.mutate()}
            disabled={
              descricao.trim() === '' ||
              valor <= 0 ||
              !diaEhValido(Number(dia), regra) ||
              !contaPadrao ||
              adicionarFixa.isPending
            }
            className="w-full rounded-lg border border-borda-forte px-4 py-2 text-sm text-slate-200 disabled:opacity-40"
          >
            Adicionar fonte
          </button>
        </div>
      ) : (
        <div className="space-y-3 rounded-xl border border-borda bg-superficie p-4">
          <p className="text-xs text-slate-400">
            Renda que oscila não tem valor fixo para cadastrar, e no primeiro mês não existe
            histórico. Estas duas estimativas são sementes: a partir de 3 meses o app troca pela
            mediana real e diz na tela qual está usando.
          </p>
          <CampoValor
            valor={mesTipico}
            aoMudar={setMesTipico}
            rotulo="Num mês típico, quanto entra?"
          />
          <CampoValor valor={mesRuim} aoMudar={setMesRuim} rotulo="Num mês ruim, quanto entra?" />
        </div>
      )}

      {tipoDeFonte === 'variavel' ? (
        <Avancar
          aoClicar={() => salvarSementes.mutate()}
          desabilitado={salvarSementes.isPending}
        />
      ) : (
        <Avancar aoClicar={aoAvancar} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------- passo 8 --

function PassoEmpresa({ aoAvancar }: { aoAvancar: () => void }) {
  const contas = usarContas();
  const cliente = useQueryClient();
  const jaExiste = (contas.data ?? []).some((c) => c.tipo === 'empresa');

  const criar = useMutation({
    mutationFn: () => criarConta({ nome: 'Empresa', tipo: 'empresa', saldoInicial: 0 }),
    onSuccess: async () => {
      await cliente.invalidateQueries({ queryKey: ['contas'] });
      aoAvancar();
    },
  });

  return (
    <div className="space-y-4">
      <Titulo ajuda="Opcional. Só faz sentido se você tem MEI ou trabalha por conta própria.">
        Conta Empresa
      </Titulo>

      <p className="rounded-lg border border-borda bg-superficie p-3 text-xs text-slate-400">
        Comprar insumo com o cartão pessoal não é despesa sua: é dinheiro atravessando a fronteira
        entre os bolsos. Vira transferência para esta conta, e o saldo dela responde quanto do seu
        dinheiro está parado dentro do negócio.
      </p>

      {jaExiste ? (
        <>
          <p className="rounded-lg border border-borda bg-superficie p-4 text-sm text-slate-300">
            Você já tem uma conta Empresa.
          </p>
          <Avancar aoClicar={aoAvancar} />
        </>
      ) : (
        <>
          <Avancar
            aoClicar={() => criar.mutate()}
            rotulo="Criar conta Empresa"
            desabilitado={criar.isPending}
          />
          <button
            onClick={aoAvancar}
            className="w-full py-2 text-sm text-slate-500 hover:text-slate-300"
          >
            Não tenho empresa
          </button>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- passo 9 --

function PassoCategorias({
  aoConcluir,
  ultimo = true,
}: {
  aoConcluir: () => void;
  ultimo?: boolean;
}) {
  const categorias = usarCategorias();
  const total = (categorias.data ?? []).length;

  return (
    <div className="space-y-4">
      <Titulo ajuda="Já vêm prontas, com natureza, cor e ícone. Dá para ajustar depois em Categorias.">
        Categorias
      </Titulo>

      <p className="rounded-lg border border-borda bg-superficie p-4 text-sm text-slate-300">
        {total} categorias cadastradas, separadas em fixa, variável e eventual. É essa separação que
        permite ver o custo de vida mínimo e o que dá para cortar — um total único de despesa
        esconderia justamente isso.
      </p>

      <Avancar aoClicar={aoConcluir} rotulo={ultimo ? 'Concluir' : 'Continuar'} />
    </div>
  );
}

// ------------------------------------------------------------- trilha --

/**
 * A escolha que decide o tamanho de tudo (§4.1).
 *
 * Vem primeiro porque escolher no meio seria pedir para reavaliar um caminho já
 * começado. E a rápida aparece antes na tela, não por ser melhor: o §4.1 é
 * explícito em que onboarding longo é onde se abandona, e a opção que protege
 * contra isso merece ser a que se lê primeiro.
 *
 * A diferença NÃO é "cadastrar menos". As duas passam pelo mesmo piso — saldo,
 * cartão, fatura aberta, parcelamentos e renda —, porque sem qualquer um deles
 * o app dá número errado, não número incompleto. O que a completa acrescenta é
 * contexto e explicação.
 */
function PassoTrilha({
  escolhida,
  aoEscolher,
  aoAvancar,
}: {
  escolhida: Trilha;
  aoEscolher: (trilha: Trilha) => void;
  aoAvancar: () => void;
}) {
  const opcoes: { valor: Trilha; titulo: string; tempo: string; descricao: string }[] = [
    {
      valor: 'rapida',
      titulo: 'Rápida',
      tempo: 'uns 8 minutos',
      descricao:
        'Só o que o app precisa para não mentir: onde está o seu dinheiro, os cartões, a fatura aberta, os parcelamentos que já rolam e de onde vem a renda. Dá para usar hoje mesmo.',
    },
    {
      valor: 'completa',
      titulo: 'Completa',
      tempo: 'uns 20 minutos',
      descricao:
        'Tudo da rápida, mais despesas fixas, dívidas e conta Empresa — e três telas que explicam por que os números deste app são diferentes dos de uma planilha. Vale se você quiser entender o que está vendo.',
    },
  ];

  return (
    <div className="space-y-4">
      <Titulo ajuda="Dá para mudar depois: o progresso fica salvo, e nada do que você cadastrar se perde na troca.">
        Como você quer começar?
      </Titulo>

      <div className="space-y-2">
        {opcoes.map((opcao) => (
          <button
            key={opcao.valor}
            onClick={() => aoEscolher(opcao.valor)}
            className={`w-full rounded-xl border p-4 text-left transition ${
              escolhida === opcao.valor
                ? 'border-emerald-600 bg-emerald-950/20'
                : 'border-borda bg-superficie hover:border-borda-forte'
            }`}
          >
            <p className="flex items-baseline justify-between gap-3">
              <span className="text-slate-100">{opcao.titulo}</span>
              <span className="text-xs text-slate-500">{opcao.tempo}</span>
            </p>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">{opcao.descricao}</p>
          </button>
        ))}
      </div>

      <p className="rounded-lg border border-borda bg-superficie p-3 text-xs leading-relaxed text-slate-400">
        As duas cadastram o mesmo essencial. A rápida não é uma versão capada — é a mesma base sem
        as explicações. O que fica de fora dela some da configuração, não do app: despesas fixas e
        dívidas podem ser cadastradas depois, a qualquer momento.
      </p>

      <Avancar aoClicar={aoAvancar} rotulo="Começar" />
    </div>
  );
}

// ------------------------------------------------------------ conceitos --

/** Caixa de conceito: o que se costuma achar, e o que é. */
function Conceito({
  titulo,
  achamQue,
  masE,
}: {
  titulo: string;
  achamQue: string;
  masE: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-borda bg-superficie p-4">
      <p className="text-sm text-slate-100">{titulo}</p>
      <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
        <span className="text-slate-600">Parece que: </span>
        {achamQue}
      </p>
      <p className="mt-1.5 text-xs leading-relaxed text-slate-300">{masE}</p>
    </div>
  );
}

/**
 * O cartão é onde a intuição mais erra (§2.1, §2.4, §14).
 *
 * Três ideias, e as três contrariam o senso comum. Quem não as entende lê os
 * próprios números como se estivessem errados — e a reação natural é concluir
 * que o app está somando duas vezes.
 */
function ConceitoDoCartao({ aoAvancar }: { aoAvancar: () => void }) {
  return (
    <div className="space-y-4">
      <Titulo ajuda="Nada para preencher aqui. São três ideias que fazem o resto do app fazer sentido.">
        Como o cartão funciona aqui
      </Titulo>

      <div className="space-y-2">
        <Conceito
          titulo="Comprar no cartão não tira dinheiro da conta"
          achamQue="a compra de hoje deveria baixar o saldo hoje."
          masE={
            <>
              Ela vira uma despesa <strong>de hoje</strong> — aparece no relatório do mês em que
              você comprou — mas o dinheiro só sai no vencimento da fatura. Por isso a lista de
              lançamentos mostra a compra dentro da fatura, no dia em que ela é paga.
            </>
          }
        />
        <Conceito
          titulo="Pagar a fatura não é uma despesa"
          achamQue="pagar R$ 1.200 de fatura é gastar R$ 1.200."
          masE={
            <>
              O gasto já foi contado em cada compra. Contar de novo <strong>dobraria o mês</strong>{' '}
              e jogaria tudo numa categoria só, em vez de Mercado, Transporte e o resto. Pagar a
              fatura quita uma dívida: é transferência, não gasto.
            </>
          }
        />
        <Conceito
          titulo="Parcelar sem juros é renda futura já gasta"
          achamQue="12x sem juros não custa nada."
          masE={
            <>
              Cada parcela é um pedaço dos seus próximos meses que já tem dono. O app soma isso e
              chama de <strong>compromisso assumido</strong> — e mostra em que mês ele acaba, que é
              a data que ninguém sabe de cabeça.
            </>
          }
        />
      </div>

      <Avancar aoClicar={aoAvancar} />
    </div>
  );
}

/**
 * Por que despesa não tem um total único (§2.5, §14).
 *
 * É a separação que permite responder "quanto preciso ganhar para nada atrasar"
 * e "onde dá para cortar". Um número consolidado esconde as duas respostas.
 */
function ConceitoDaNatureza({ aoAvancar }: { aoAvancar: () => void }) {
  return (
    <div className="space-y-4">
      <Titulo ajuda="Também nada para preencher. Isto explica por que você nunca vai ver um número só de despesa do mês.">
        Fixa, variável e eventual
      </Titulo>

      <div className="space-y-2">
        <Conceito
          titulo="Fixa — o seu custo de vida mínimo"
          achamQue="é só mais uma etiqueta."
          masE={
            <>
              A soma das fixas responde{' '}
              <strong>quanto precisa entrar todo mês para nada atrasar</strong>. É o piso, e é o
              denominador da reserva de emergência.
            </>
          }
        />
        <Conceito
          titulo="Variável — onde dá para cortar"
          achamQue="mercado e lazer são gastos como quaisquer outros."
          masE={
            <>
              São os únicos sobre os quais um corte é possível de verdade. Relatório de corte que
              mistura aluguel com pizza não serve para decidir nada.
            </>
          }
        />
        <Conceito
          titulo="Eventual — o que precisa de provisão"
          achamQue="IPVA e seguro são imprevistos."
          masE={
            <>
              Não são: você sabe que vêm. O app divide o valor anual por 12 e reserva todo mês.{' '}
              <strong>Sem isso, janeiro sempre parece um desastre.</strong>
            </>
          }
        />
      </div>

      <p className="rounded-lg border border-borda bg-superficie p-3 text-xs leading-relaxed text-slate-400">
        É por isso que o Início mostra os três blocos separados e nunca um total único: o número
        consolidado esconde exatamente a informação que decide alguma coisa.
      </p>

      <Avancar aoClicar={aoAvancar} />
    </div>
  );
}

// --------------------------------------------------------------- tour --

/** O que cada tela responde. Fecha a trilha completa (§11). */
function TourFinal({ aoConcluir }: { aoConcluir: () => void }) {
  const telas: { nome: string; responde: string }[] = [
    { nome: 'Início', responde: 'O que exige atenção hoje, e como está o mês.' },
    { nome: 'Lançamentos', responde: 'O que entrou e saiu de cada conta, dia a dia.' },
    { nome: 'Em lote', responde: 'Ficou dias sem lançar? Dez de uma vez, numa tabela.' },
    { nome: 'Faturas', responde: 'A fatura do mês inteira, com as compras que a formam.' },
    { nome: 'Investimentos', responde: 'Quanto rende por dia — bruto e líquido, já com IR.' },
    { nome: 'Dívidas', responde: 'Quanto ainda se deve e em que mês acaba. Com juros de verdade.' },
    {
      nome: 'Fluxo de caixa',
      responde: 'Como fica o saldo nos próximos 12 meses, em três cenários.',
    },
    { nome: 'Simulador', responde: 'O que ESTA compra faz com o seu pior mês. Use dentro da loja.' },
    { nome: 'Metas', responde: 'Quantos meses de custo fixo a sua reserva cobre.' },
    { nome: 'Conferência', responde: 'O saldo do app bate com o do banco? Onde o erro entrou.' },
    { nome: 'Fechamento', responde: 'O ritual de 10 minutos que mantém tudo confiável.' },
  ];

  return (
    <div className="space-y-4">
      <Titulo ajuda="Você não precisa decorar nada disto. É só para saber que existe quando a pergunta aparecer.">
        O que cada tela responde
      </Titulo>

      <ul className="divide-y divide-borda overflow-hidden rounded-xl border border-borda bg-superficie">
        {telas.map((tela) => (
          <li key={tela.nome} className="px-4 py-2.5">
            <p className="text-sm text-slate-200">{tela.nome}</p>
            <p className="text-xs leading-relaxed text-slate-500">{tela.responde}</p>
          </li>
        ))}
      </ul>

      <p className="rounded-lg border border-borda bg-superficie p-3 text-xs leading-relaxed text-slate-400">
        Uma coisa importa mais que todas as outras: <strong>lançar</strong>. O botão verde está em
        toda tela e leva menos de dez segundos. App de finanças manual não morre por falta de
        recurso — morre por preguiça de digitar.
      </p>

      <Avancar aoClicar={aoConcluir} rotulo="Concluir" />
    </div>
  );
}


// ------------------------------------------------------------- dívidas --

/**
 * Financiamento e empréstimo no onboarding (§4.7).
 *
 * Entra só na trilha completa porque é o passo mais opcional de todos: muita
 * gente não tem nenhuma. Mas quem tem, tem a maior despesa fixa da vida — e uma
 * projeção de 12 meses que ignora a parcela do apartamento não serve para nada.
 *
 * O formulário é o MESMO da tela de Dívidas, importado. Duplicá-lo daria duas
 * versões da regra de amortização para manter, e a segunda envelheceria calada.
 */
function PassoDividas({ aoAvancar }: { aoAvancar: () => void }) {
  const [cadastrando, setCadastrando] = useState(false);
  const dividas = useQuery({ queryKey: ['dividas'], queryFn: () => listarDividas() });
  const quantas = dividas.data?.length ?? 0;

  return (
    <div className="space-y-4">
      <Titulo ajuda="Financiamento de imóvel ou carro, empréstimo, crediário fora do cartão.">
        Dívidas
      </Titulo>

      <p className="rounded-lg border border-borda bg-superficie p-3 text-xs leading-relaxed text-slate-400">
        O app calcula o saldo devedor <strong>com juros</strong>, o que quase nenhuma planilha faz.
        A diferença não é detalhe: num financiamento longo, tratar a parcela inteira como
        abatimento diz que você está quase quitando quando ainda falta metade.
      </p>

      {quantas > 0 && (
        <ul className="space-y-1">
          {dividas.data?.map((item) => (
            <li
              key={item.divida.id}
              className="flex justify-between rounded-lg border border-borda px-3 py-2 text-sm"
            >
              <span className="truncate text-slate-200">{item.divida.nome}</span>
              <span className="shrink-0 text-slate-400">{formatar(item.resumo.saldoDevedor)}</span>
            </li>
          ))}
        </ul>
      )}

      {cadastrando ? (
        <FormularioDeDivida aoTerminar={() => setCadastrando(false)} />
      ) : (
        <button
          onClick={() => setCadastrando(true)}
          className="w-full rounded-lg border border-borda-forte px-4 py-2 text-sm text-slate-200"
        >
          {quantas > 0 ? 'Cadastrar outra' : 'Cadastrar uma dívida'}
        </button>
      )}

      <Avancar aoClicar={aoAvancar} rotulo={quantas > 0 ? 'Continuar' : 'Não tenho dívidas'} />
    </div>
  );
}
