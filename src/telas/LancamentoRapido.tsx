import { useEffect, useMemo, useState } from 'react';
import { formatarBR, hoje, ontem, type DataISO } from '../dominio/datas';
import { formatar, type Centavos } from '../dominio/dinheiro';
import { CampoValor } from '../ui/CampoValor';
import { BottomSheet } from '../ui/BottomSheet';
import { usarAviso } from '../ui/Aviso';
import { usarContas } from '../dados/usarContas';
import { usarCartoes } from '../dados/usarCartoes';
import {
  usarCategoriasSugeridas,
  usarCriarLancamento,
  usarCriarTransferencia,
  usarDesfazer,
} from '../dados/usarTransacoes';
import type { MotivoEmpresa, TipoDeLancamento } from '../dados/transacoes';

type Modo = TipoDeLancamento | 'transferencia';

const MOTIVOS: { valor: MotivoEmpresa; rotulo: string; ajuda: string }[] = [
  { valor: 'investimento', rotulo: 'Investimento', ajuda: 'Equipamento, ferramenta. Normal e esperado.' },
  { valor: 'giro', rotulo: 'Giro', ajuda: 'Insumo, embalagem. Deveria voltar em semanas.' },
  { valor: 'subsidio', rotulo: 'Subsídio', ajuda: 'Conta operacional que a empresa não cobre. Se repetir, o negócio não se paga.' },
  { valor: 'devolucao', rotulo: 'Devolução', ajuda: 'A empresa devolvendo o que você emprestou.' },
];

/**
 * Folha de lançamento rápido (§5.1). A tela mais importante do app.
 *
 * Meta dura: lançamento comum em 3 toques e menos de 10 segundos. Por isso:
 * o valor recebe foco sozinho, o tipo já vem em despesa, a conta é a última
 * usada, a data é hoje, e a descrição é opcional. Salvar não pergunta nada —
 * salva e oferece desfazer (§5.4).
 */
export function LancamentoRapido({ aberto, aoFechar }: { aberto: boolean; aoFechar: () => void }) {
  const contas = usarContas();
  const cartoes = usarCartoes();
  const criar = usarCriarLancamento();
  const transferir = usarCriarTransferencia();
  const desfazer = usarDesfazer();
  const { mostrar } = usarAviso();

  const [modo, setModo] = useState<Modo>('despesa');
  const [valor, setValor] = useState<Centavos>(0);
  const [categoriaId, setCategoriaId] = useState<string | null>(null);
  const [contaId, setContaId] = useState<string | null>(null);
  const [contaDestinoId, setContaDestinoId] = useState<string | null>(null);
  const [data, setData] = useState<DataISO>(hoje());
  const [descricao, setDescricao] = useState('');
  const [parcelas, setParcelas] = useState(1);
  const [motivoEmpresa, setMotivoEmpresa] = useState<MotivoEmpresa | null>(null);
  const [verTodasCategorias, setVerTodasCategorias] = useState(false);

  const tipoParaCategorias: TipoDeLancamento = modo === 'receita' ? 'receita' : 'despesa';
  const { sugeridas, todas } = usarCategoriasSugeridas(tipoParaCategorias);

  const disponiveis = useMemo(
    () => (contas.data ?? []).filter((c) => c.tipo !== 'divida'),
    [contas.data],
  );

  // Última conta usada fica pré-selecionada (§5.1). Persistida entre sessões:
  // é sempre a mesma conta na esmagadora maioria dos lançamentos.
  useEffect(() => {
    if (contaId !== null || disponiveis.length === 0) return;
    const guardada = localStorage.getItem('ultima-conta');
    const existe = disponiveis.find((c) => c.id === guardada);
    setContaId(existe?.id ?? disponiveis[0]?.id ?? null);
  }, [disponiveis, contaId]);

  const conta = disponiveis.find((c) => c.id === contaId) ?? null;
  const cartao = cartoes.data?.find((c) => c.contaId === contaId) ?? null;
  const ehCartao = conta?.tipo === 'cartao_credito';
  const envolveEmpresa =
    conta?.tipo === 'empresa' ||
    disponiveis.find((c) => c.id === contaDestinoId)?.tipo === 'empresa';

  const podeSalvar =
    valor > 0 &&
    contaId !== null &&
    (modo !== 'transferencia' || (contaDestinoId !== null && contaDestinoId !== contaId));

  function limpar(manterContaEData: boolean) {
    setValor(0);
    setCategoriaId(null);
    setDescricao('');
    setParcelas(1);
    setMotivoEmpresa(null);
    setVerTodasCategorias(false);
    if (!manterContaEData) {
      setData(hoje());
    }
  }

  async function salvar(continuar: boolean) {
    if (!podeSalvar || contaId === null) return;

    let ids: string[];
    let resumo: string;

    if (modo === 'transferencia' && contaDestinoId) {
      ids = await transferir.mutateAsync({
        valor,
        contaOrigemId: contaId,
        contaDestinoId,
        data,
        descricao,
        motivoEmpresa: envolveEmpresa ? motivoEmpresa : null,
      });
      resumo = `Transferência de ${formatar(valor)} registrada.`;
    } else {
      ids = await criar.mutateAsync({
        tipo: modo === 'receita' ? 'receita' : 'despesa',
        valor,
        contaId,
        categoriaId,
        data,
        descricao,
        parcelas,
        cartao: ehCartao && cartao ? cartao : null,
      });
      resumo =
        parcelas > 1
          ? `${formatar(valor)} em ${parcelas}x lançado.`
          : `${formatar(valor)} lançado.`;
    }

    localStorage.setItem('ultima-conta', contaId);
    // Salva direto, sem confirmação, e oferece desfazer (§5.4).
    mostrar(resumo, { rotulo: 'Desfazer', executar: () => desfazer.mutate(ids) });

    limpar(continuar);
    if (!continuar) aoFechar();
  }

  const salvando = criar.isPending || transferir.isPending;
  const erro = (criar.error ?? transferir.error) as Error | null;

  return (
    <BottomSheet aberto={aberto} aoFechar={aoFechar}>
      <div className="space-y-4">
        <SeletorDeModo modo={modo} aoMudar={setModo} />

        <CampoValor valor={valor} aoMudar={setValor} autoFocus />

        {modo !== 'transferencia' && (
          <div>
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-slate-400">Categoria</span>
              <button
                type="button"
                onClick={() => setVerTodasCategorias((v) => !v)}
                className="text-xs text-emerald-400"
              >
                {verTodasCategorias ? 'ver menos' : 'ver todas'}
              </button>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {(verTodasCategorias ? todas : sugeridas).map((categoria) => (
                <Chip
                  key={categoria.id}
                  ativo={categoriaId === categoria.id}
                  aoClicar={() =>
                    setCategoriaId(categoriaId === categoria.id ? null : categoria.id)
                  }
                >
                  {categoria.nome}
                </Chip>
              ))}
            </div>
          </div>
        )}

        <div>
          <span className="text-sm text-slate-400">
            {modo === 'transferencia' ? 'De' : 'Conta'}
          </span>
          <div className="mt-2 flex flex-wrap gap-2">
            {disponiveis.map((c) => (
              <Chip key={c.id} ativo={contaId === c.id} aoClicar={() => setContaId(c.id)}>
                {c.nome}
              </Chip>
            ))}
          </div>
        </div>

        {modo === 'transferencia' && (
          <div>
            <span className="text-sm text-slate-400">Para</span>
            <div className="mt-2 flex flex-wrap gap-2">
              {disponiveis
                .filter((c) => c.id !== contaId)
                .map((c) => (
                  <Chip
                    key={c.id}
                    ativo={contaDestinoId === c.id}
                    aoClicar={() => setContaDestinoId(c.id)}
                  >
                    {c.nome}
                  </Chip>
                ))}
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Transferência move saldo e não conta como receita nem despesa (§2.3).
            </p>
          </div>
        )}

        {modo === 'transferencia' && envolveEmpresa && (
          <div>
            <span className="text-sm text-slate-400">Motivo</span>
            <div className="mt-2 flex flex-wrap gap-2">
              {MOTIVOS.map((m) => (
                <Chip
                  key={m.valor}
                  ativo={motivoEmpresa === m.valor}
                  aoClicar={() => setMotivoEmpresa(m.valor)}
                >
                  {m.rotulo}
                </Chip>
              ))}
            </div>
            {motivoEmpresa && (
              <p className="mt-2 text-xs text-slate-500">
                {MOTIVOS.find((m) => m.valor === motivoEmpresa)?.ajuda}
              </p>
            )}
          </div>
        )}

        <div>
          <span className="text-sm text-slate-400">Data</span>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Chip ativo={data === hoje()} aoClicar={() => setData(hoje())}>
              Hoje
            </Chip>
            <Chip ativo={data === ontem()} aoClicar={() => setData(ontem())}>
              Ontem
            </Chip>
            <input
              type="date"
              value={data}
              onChange={(e) => e.target.value && setData(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-slate-200 outline-none focus:border-slate-500"
            />
            {data !== hoje() && data !== ontem() && (
              <span className="text-xs text-slate-500">{formatarBR(data)}</span>
            )}
          </div>
        </div>

        {ehCartao && modo === 'despesa' && (
          <div>
            <span className="text-sm text-slate-400">Parcelas</span>
            <div className="mt-2 flex flex-wrap gap-2">
              {[1, 2, 3, 4, 6, 10, 12].map((n) => (
                <Chip key={n} ativo={parcelas === n} aoClicar={() => setParcelas(n)}>
                  {n === 1 ? 'À vista' : `${n}x`}
                </Chip>
              ))}
            </div>
            {parcelas > 1 && valor > 0 && (
              <p className="mt-2 text-xs text-slate-500">
                {parcelas} parcelas a partir de {formatarBR(data)}. A soma bate com{' '}
                {formatar(valor)} — a diferença do arredondamento vai na última.
              </p>
            )}
          </div>
        )}

        <div>
          <label className="mb-1 block text-sm text-slate-400">Descrição (opcional)</label>
          <input
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100 outline-none focus:border-slate-500"
          />
        </div>

        {erro && <p className="text-sm text-red-400">{erro.message}</p>}

        <div className="flex gap-2 pt-1">
          <button
            onClick={() => void salvar(false)}
            disabled={!podeSalvar || salvando}
            className="flex-1 rounded-lg bg-emerald-600 px-4 py-3 font-medium text-white disabled:opacity-40"
          >
            {salvando ? 'Salvando…' : 'Salvar'}
          </button>
          <button
            onClick={() => void salvar(true)}
            disabled={!podeSalvar || salvando}
            title="Salva e reabre a folha limpa, mantendo conta e data"
            className="rounded-lg border border-slate-700 px-4 py-3 text-sm text-slate-200 disabled:opacity-40"
          >
            Salvar e novo
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}

function SeletorDeModo({ modo, aoMudar }: { modo: Modo; aoMudar: (m: Modo) => void }) {
  // Default despesa: mais de 90% dos lançamentos são despesa, então escolher o
  // tipo não pode ser um toque obrigatório (§5.1).
  const opcoes: { valor: Modo; rotulo: string }[] = [
    { valor: 'despesa', rotulo: 'Despesa' },
    { valor: 'receita', rotulo: 'Receita' },
    { valor: 'transferencia', rotulo: 'Transferência' },
  ];

  return (
    <div className="flex gap-1 rounded-lg bg-slate-800 p-1">
      {opcoes.map((opcao) => (
        <button
          key={opcao.valor}
          onClick={() => aoMudar(opcao.valor)}
          className={`flex-1 rounded-md px-2 py-1.5 text-sm ${
            modo === opcao.valor ? 'bg-slate-700 text-slate-100' : 'text-slate-400'
          }`}
        >
          {opcao.rotulo}
        </button>
      ))}
    </div>
  );
}

function Chip({
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
      type="button"
      onClick={aoClicar}
      className={`rounded-full px-3 py-1.5 text-sm ${
        ativo
          ? 'bg-emerald-600 text-white'
          : 'border border-slate-700 text-slate-300 hover:border-slate-500'
      }`}
    >
      {children}
    </button>
  );
}
