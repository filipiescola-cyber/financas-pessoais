import { useEffect, useMemo, useState } from 'react';
import { formatarBR, hoje, ontem, type DataISO } from '../dominio/datas';
import { faturaEscolhida } from '../dominio/fatura';
import { formatar, type Centavos } from '../dominio/dinheiro';
import { CampoValor } from '../ui/CampoValor';
import { BottomSheet } from '../ui/BottomSheet';
import { usarAviso } from '../ui/Aviso';
import { IconeDeCategoria } from '../ui/iconesDeCategoria';
import { usarContas } from '../dados/usarContas';
import { usarCartoes } from '../dados/usarCartoes';
import {
  usarCategoriasSugeridas,
  usarCriarLancamento,
  usarCriarTransferencia,
  usarDesfazer,
} from '../dados/usarTransacoes';
import { usarModelos, usarSugestoesDeDescricao } from '../dados/usarModelos';
import type { MotivoEmpresa, TipoDeLancamento } from '../dados/transacoes';
import { ALVO_DE_TOQUE } from '../ui/base';

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
  const modelos = usarModelos();
  const { mostrar } = usarAviso();

  const [modo, setModo] = useState<Modo>('despesa');
  // Volta ao sugerido a cada folha nova: o ajuste vale para aquela compra, não
  // vira preferência.
  const [deslocamentoDeFatura, setDeslocamentoDeFatura] = useState(0);
  const [valor, setValor] = useState<Centavos>(0);
  const [categoriaId, setCategoriaId] = useState<string | null>(null);
  const [contaId, setContaId] = useState<string | null>(null);
  const [contaDestinoId, setContaDestinoId] = useState<string | null>(null);
  const [data, setData] = useState<DataISO>(hoje());
  const [descricao, setDescricao] = useState('');
  const [parcelas, setParcelas] = useState(1);
  const [motivoEmpresa, setMotivoEmpresa] = useState<MotivoEmpresa | null>(null);
  const [verTodasCategorias, setVerTodasCategorias] = useState(false);
  const [descricaoEmFoco, setDescricaoEmFoco] = useState(false);

  const sugestoes = usarSugestoesDeDescricao(descricao);

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
    setDeslocamentoDeFatura(0);
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
        deslocamentoDeFatura,
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

        {modo !== 'transferencia' && (modelos.data ?? []).length > 0 && (
          <div className="flex flex-wrap gap-2">
            {(modelos.data ?? [])
              .filter((m) => m.tipo === modo)
              .map((modelo) => (
                <button
                  key={modelo.id}
                  type="button"
                  onClick={() => {
                    // Um toque preenche categoria, conta e tipo. Só falta o valor.
                    if (modelo.categoriaId) setCategoriaId(modelo.categoriaId);
                    if (modelo.contaId) setContaId(modelo.contaId);
                    if (modelo.valorPadrao !== null) setValor(modelo.valorPadrao);
                    if (!descricao) setDescricao(modelo.nome);
                  }}
                  className="rounded-full border border-emerald-800/60 bg-emerald-950/30 px-3 py-1.5 text-sm text-emerald-200 transition hover:border-emerald-700"
                >
                  {modelo.nome}
                </button>
              ))}
          </div>
        )}

        <CampoValor valor={valor} aoMudar={setValor} autoFocus />

        {modo !== 'transferencia' && (
          <div>
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-slate-400">Categoria</span>
              <button
                type="button"
                onClick={() => setVerTodasCategorias((v) => !v)}
                className={`text-xs text-emerald-400 ${ALVO_DE_TOQUE}`}
              >
                {verTodasCategorias ? 'Ver menos' : 'Ver todas'}
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
                  {/* O ícone aqui é o que paga o cadastro: chip é escolha
                      rápida, e forma se reconhece antes de palavra (§5.1). */}
                  <span className="flex items-center gap-1.5">
                    <IconeDeCategoria chave={categoria.icone} className="h-4 w-4" />
                    {categoria.nome}
                  </span>
                </Chip>
              ))}
            </div>
          </div>
        )}

        <div>
          <span className="text-sm text-slate-400">
            {modo === 'transferencia' ? 'De' : 'Conta'}
          </span>
          <ChipsDeConta
            contas={disponiveis}
            escolhida={contaId}
            aoEscolher={(id) => setContaId(id)}
          />
        </div>

        {modo === 'transferencia' && (
          <div>
            <span className="text-sm text-slate-400">Para</span>
            <ChipsDeConta
              contas={disponiveis.filter((c) => c.id !== contaId)}
              escolhida={contaDestinoId}
              aoEscolher={(id) => setContaDestinoId(id)}
            />
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
              className="rounded-lg border border-borda-forte bg-superficie-alta px-3 py-1.5 text-sm text-slate-200 outline-none focus:border-slate-500"
            />
            {data !== hoje() && data !== ontem() && (
              <span className="text-xs text-slate-500">{formatarBR(data)}</span>
            )}
          </div>
        </div>

        {ehCartao && modo === 'despesa' && cartao && (
          <div>
            <span className="text-sm text-slate-400">Fatura</span>
            <div className="mt-2 flex flex-wrap gap-2">
              {[-1, 0, 1].map((d) => {
                const opcao = faturaEscolhida(data, cartao, d);
                return (
                  <Chip
                    key={d}
                    ativo={deslocamentoDeFatura === d}
                    aoClicar={() => setDeslocamentoDeFatura(d)}
                  >
                    <span className="flex items-baseline gap-1.5">
                      Vence {formatarBR(opcao.dataVencimento)}
                      {d === 0 && <span className="text-[10px] opacity-70">sugerida</span>}
                    </span>
                  </Chip>
                );
              })}
            </div>
            <p className="mt-2 text-xs leading-relaxed text-slate-500">
              Compra depois do dia {cartao.diaFechamento} entra na fatura seguinte — o app já
              escolheu por essa regra. Mude só se o banco tiver jogado para outra.
            </p>
          </div>
        )}

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

        <div className="relative">
          <label className="mb-1 block text-sm text-slate-400">Descrição (opcional)</label>
          <input
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            onFocus={() => setDescricaoEmFoco(true)}
            // O clique numa sugestão precisa acontecer antes do blur fechar a lista.
            onBlur={() => window.setTimeout(() => setDescricaoEmFoco(false), 150)}
            autoComplete="off"
            className="w-full rounded-lg border border-borda-forte bg-superficie-alta px-3 py-2 text-slate-100 outline-none focus:border-slate-500"
          />

          {descricaoEmFoco && (sugestoes.data ?? []).length > 0 && (
            <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-borda-forte bg-superficie-alta shadow-xl">
              {(sugestoes.data ?? []).map((sugestao) => (
                <li key={sugestao.descricao}>
                  <button
                    type="button"
                    onClick={() => {
                      // Traz junto a categoria e a conta da última vez (§5.2).
                      setDescricao(sugestao.descricao);
                      if (sugestao.categoriaId) setCategoriaId(sugestao.categoriaId);
                      if (sugestao.contaId && modo !== 'transferencia') {
                        setContaId(sugestao.contaId);
                      }
                      setDescricaoEmFoco(false);
                    }}
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-slate-200 transition hover:bg-superficie"
                  >
                    <span className="truncate">{sugestao.descricao}</span>
                    <span className="ml-3 shrink-0 text-xs text-slate-500">
                      {sugestao.vezesUsada}x
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
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
            className="rounded-lg border border-borda-forte px-4 py-3 text-sm text-slate-200 disabled:opacity-40"
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
    <div className="flex gap-1 rounded-lg bg-superficie-alta p-1">
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
          : 'border border-borda-forte text-slate-300 hover:border-slate-500'
      }`}
    >
      {children}
    </button>
  );
}

/**
 * Conta e cartão em blocos separados (§5.1).
 *
 * O mesmo banco vira duas contas aqui — a corrente e o cartão — e elas costumam
 * ter o mesmo apelido. Lado a lado numa fila só, eram dois chips escritos
 * "Nubank", e escolher o errado troca uma compra parcelada por uma saída de
 * caixa de hoje: o erro mais caro que esta folha permite cometer.
 *
 * O ponto colorido vem da instituição (§4). É ele que faz reconhecer o banco
 * antes de ler o nome — e é justamente onde o nome não resolve.
 */
function ChipsDeConta({
  contas,
  escolhida,
  aoEscolher,
}: {
  contas: readonly { id: string; nome: string; tipo: string; cor: string | null }[];
  escolhida: string | null;
  aoEscolher: (id: string) => void;
}) {
  const correntes = contas.filter((c) => c.tipo !== 'cartao_credito');
  const cartoes = contas.filter((c) => c.tipo === 'cartao_credito');

  const chip = (c: (typeof contas)[number]) => (
    <Chip key={c.id} ativo={escolhida === c.id} aoClicar={() => aoEscolher(c.id)}>
      <span className="flex items-center gap-1.5">
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: c.cor ?? 'var(--color-borda-forte)' }}
        />
        {c.nome}
      </span>
    </Chip>
  );

  return (
    <>
      <div className="mt-2 flex flex-wrap gap-2">{correntes.map(chip)}</div>

      {cartoes.length > 0 && (
        <>
          <span className="mt-3 block text-[11px] uppercase tracking-wider text-slate-500">
            cartão
          </span>
          <div className="mt-1.5 flex flex-wrap gap-2">{cartoes.map(chip)}</div>
        </>
      )}
    </>
  );
}
