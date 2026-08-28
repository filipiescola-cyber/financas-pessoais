import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatarBR, hoje, primeiroDiaDoMes, somarMeses } from '../dominio/datas';
import { formatar, type Centavos } from '../dominio/dinheiro';
import { descreverFatura, ehDiaValido, faturaDeReferencia } from '../dominio/fatura';
import { CampoValor } from '../ui/CampoValor';
import { usarAviso } from '../ui/Aviso';
import { criarConta } from '../dados/contas';
import { criarCartao } from '../dados/cartoes';
import { criarRecorrencia } from '../dados/recorrencias';
import { criarLancamento, criarParcelamentoEmAndamento } from '../dados/transacoes';
import {
  ADIAVEIS,
  PASSOS,
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

/**
 * Onboarding (§4.1). Uma pergunta por tela, caminho MANUAL apenas — a
 * ramificação por extrato depende da importação, que é da Fase 4.
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

  useEffect(() => {
    if (status.data && passo === null) {
      // O passo gravado é onde o usuário parou. Onde o wizard ABRE é outra
      // coisa: depois de concluído, o gravado é o último, e entrar por ele
      // deixava a tela sem nada para fazer.
      setPasso(passoDeEntrada(status.data));
      setPulados(status.data.pulados);
    }
  }, [status.data, passo]);

  const dataDeCorte = primeiroDiaDoMes(hoje());
  const indice = passo ? PASSOS.indexOf(passo) : 0;

  async function irPara(proximo: PassoDoOnboarding | 'fim', pulandoAtual = false) {
    const novosPulados =
      pulandoAtual && passo ? [...new Set([...pulados, passo])] : pulados;
    setPulados(novosPulados);

    if (proximo === 'fim') {
      await gravarStatusOnboarding({
        concluido: true,
        passoAtual: 'categorias',
        pulados: novosPulados,
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
    });
    await cliente.invalidateQueries({ queryKey: ['onboarding'] });
    setPasso(proximo);
    window.scrollTo(0, 0);
  }

  function avancar(pulandoAtual = false) {
    const proximo = PASSOS[indice + 1];
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
            Passo {indice + 1} de {PASSOS.length}
          </span>
          <button onClick={() => navegar('/')} className="hover:text-slate-300">
            continuar depois
          </button>
        </div>
        <div className="h-1 w-full overflow-hidden rounded-full bg-superficie-alta">
          <div
            className="h-full bg-emerald-600 transition-all"
            style={{ width: `${((indice + 1) / PASSOS.length) * 100}%` }}
          />
        </div>
      </header>

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
      {passo === 'categorias' && <PassoCategorias aoConcluir={() => irPara('fim')} />}

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
  const [saldo, setSaldo] = useState<Centavos>(0);

  const bancarias = (contas.data ?? []).filter((c) =>
    ['corrente', 'poupanca', 'investimento'].includes(c.tipo),
  );

  const criar = useMutation({
    mutationFn: () => criarConta({ nome, tipo: 'corrente', saldoInicial: saldo }),
    onSuccess: async () => {
      await cliente.invalidateQueries({ queryKey: ['contas'] });
      setNome('');
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
              <span className="text-slate-200">{conta.nome}</span>
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
  const [nome, setNome] = useState('');
  const [fechamento, setFechamento] = useState('');
  const [vencimento, setVencimento] = useState('');
  const [limite, setLimite] = useState<Centavos>(0);

  const dias = { diaFechamento: Number(fechamento), diaVencimento: Number(vencimento) };
  const diasOk = ehDiaValido(dias.diaFechamento) && ehDiaValido(dias.diaVencimento);

  const criar = useMutation({
    mutationFn: () =>
      criarCartao({ nome, limite: limite === 0 ? null : limite, ...dias }),
    onSuccess: async () => {
      await cliente.invalidateQueries({ queryKey: ['cartoes'] });
      await cliente.invalidateQueries({ queryKey: ['contas'] });
      setNome('');
      setFechamento('');
      setVencimento('');
      setLimite(0);
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
  const [categoriaId, setCategoriaId] = useState<string | null>(null);
  const [adicionadas, setAdicionadas] = useState<string[]>([]);

  const contaPadrao = (contas.data ?? []).find((c) => c.tipo === 'corrente') ?? contas.data?.[0];
  const fixas = (categorias.data ?? []).filter(
    (c) => c.tipo === 'despesa' && c.natureza === 'fixa',
  );

  const diaNum = Number(dia);
  const valido = descricao.trim() !== '' && valor > 0 && diaNum >= 1 && diaNum <= 31 && contaPadrao;

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
      }),
    onSuccess: async () => {
      await cliente.invalidateQueries({ queryKey: ['recorrencias'] });
      setAdicionadas((atual) => [...atual, `${descricao} · ${formatar(valor)} · dia ${diaNum}`]);
      setDescricao('');
      setValor(0);
      setDia('');
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
        atrasar. Nesta fase elas ficam cadastradas; a geração automática do lançamento no dia certo
        é da Fase 3.
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
        <input
          inputMode="numeric"
          value={dia}
          onChange={(e) => setDia(e.target.value.replace(/\D/g, '').slice(0, 2))}
          placeholder="Dia do vencimento"
          className="w-full rounded-lg border border-borda-forte bg-superficie-alta px-3 py-2 text-slate-100 outline-none focus:border-slate-500"
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
  const [mesTipico, setMesTipico] = useState<Centavos>(0);
  const [mesRuim, setMesRuim] = useState<Centavos>(0);
  const [adicionadas, setAdicionadas] = useState<string[]>([]);

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
      }),
    onSuccess: async () => {
      await cliente.invalidateQueries({ queryKey: ['recorrencias'] });
      setAdicionadas((atual) => [...atual, `${descricao} · ${formatar(valor)} · dia ${dia}`]);
      setDescricao('');
      setValor(0);
      setDia('');
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
          <input
            inputMode="numeric"
            value={dia}
            onChange={(e) => setDia(e.target.value.replace(/\D/g, '').slice(0, 2))}
            placeholder="Dia do recebimento"
            className="w-full rounded-lg border border-borda-forte bg-superficie-alta px-3 py-2 text-slate-100 outline-none focus:border-slate-500"
          />
          <button
            onClick={() => adicionarFixa.mutate()}
            disabled={
              descricao.trim() === '' || valor <= 0 || !contaPadrao || adicionarFixa.isPending
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

function PassoCategorias({ aoConcluir }: { aoConcluir: () => void }) {
  const categorias = usarCategorias();
  const total = (categorias.data ?? []).length;

  return (
    <div className="space-y-4">
      <Titulo ajuda="Já vêm prontas, com a natureza preenchida. Dá para ajustar depois em Mais → Categorias.">
        Categorias
      </Titulo>

      <p className="rounded-lg border border-borda bg-superficie p-4 text-sm text-slate-300">
        {total} categorias cadastradas, separadas em fixa, variável e eventual. É essa separação que
        permite ver o custo de vida mínimo e o que dá para cortar — um total único de despesa
        esconderia justamente isso.
      </p>

      <Avancar aoClicar={aoConcluir} rotulo="Concluir" />
    </div>
  );
}
