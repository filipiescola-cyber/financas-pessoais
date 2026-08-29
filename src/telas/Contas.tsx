import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatar, type Centavos } from '../dominio/dinheiro';
import { formatarBR, hoje, type DataISO } from '../dominio/datas';
import { conferirEncerramento, type Aviso, type Bloqueio } from '../dominio/encerramento';
import { ListaDePendencias } from '../ui/ListaDePendencias';
import { CampoInstituicao } from '../ui/CampoInstituicao';
import { agruparEmArvore, principaisPossiveis } from '../dominio/arvoreDeContas';
import { situacaoDaConta } from '../dados/contas';
import { dividasDosCartoes } from '../dados/faturas';
import { usarCartoes } from '../dados/usarCartoes';
import { criarTransferencia } from '../dados/transacoes';
import { arquivarRecorrenciasDaConta } from '../dados/recorrencias';
import { empresaComSaldoSuspeito, entraNoConsolidado, rotuloDaContaEmpresa } from '../dominio/saldo';
import { CampoValor } from '../ui/CampoValor';
import { ALVO_DE_TOQUE, Botao, Campo, Cartao, CartaoIndicador, Chip, Dinheiro, ENTRADA, Nota, Pagina, Secao, Vazio } from '../ui/base';
import {
  usarAtualizarConta,
  usarContas,
  usarContasComSaldo,
  usarCriarConta,
  usarDesarquivarConta,
  usarEncerrarConta,
  usarExcluirConta,
} from '../dados/usarContas';
import {
  ROTULO_TIPO_CONTA,
  TIPOS_DE_CONTA_CADASTRAVEIS,
  type ContaComSaldo,
  type TipoDeConta,
} from '../dados/tipos';

export function Contas() {
  const contas = usarContasComSaldo();
  const todas = usarContas(true);
  const [mostrandoFormulario, setMostrandoFormulario] = useState(false);

  if (contas.isPending) {
    return (
      <Pagina titulo="Contas">
        <p className="text-slate-400">Carregando…</p>
      </Pagina>
    );
  }

  if (contas.isError) {
    return (
      <Pagina titulo="Contas">
        <p className="text-red-400">Erro ao carregar: {(contas.error as Error).message}</p>
      </Pagina>
    );
  }

  const lista = contas.data;
  const disponiveis = lista.filter(entraNoConsolidado);
  const empresa = lista.find((c) => c.tipo === 'empresa');
  const consolidado = disponiveis.reduce((total, c) => total + c.saldoAtual, 0);
  const inativas = (todas.data ?? []).filter((c) => !c.ativo);
  const dividasDeConta = lista.filter((c) => c.tipo === 'divida');

  return (
    <Pagina
      titulo="Contas"
      subtitulo="Onde o dinheiro está"
      acao={
        <Botao
          aoClicar={() => setMostrandoFormulario((v) => !v)}
          tipo={mostrandoFormulario ? 'secundario' : 'primario'}
        >
          {mostrandoFormulario ? 'Cancelar' : 'Nova conta'}
        </Botao>
      }
    >
      {mostrandoFormulario && <FormularioConta aoTerminar={() => setMostrandoFormulario(false)} />}

      {lista.length === 0 && !mostrandoFormulario ? (
        <Vazio
          titulo="Nenhuma conta cadastrada"
          descricao="Comece pela conta onde o salário cai. A carteira e a conta Empresa vêm depois, se fizerem sentido para você."
          acao={<Botao aoClicar={() => setMostrandoFormulario(true)}>Cadastrar a primeira</Botao>}
        />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <CartaoIndicador
              rotulo="Saldo"
              sotaque="verde"
              valor={formatar(consolidado)}
              detalhe="Soma de conta corrente, poupança, carteira e investimento. Não inclui Empresa, dívidas nem faturas."
            />
            {empresa && (
              <CartaoIndicador
                rotulo={rotuloDaContaEmpresa(empresa.saldoAtual)}
                sotaque="neutro"
                valor={formatar(Math.abs(empresa.saldoAtual))}
                detalhe="Dinheiro seu parado dentro do negócio. É recebível, não caixa — por isso fica fora do disponível."
              />
            )}
          </div>

          {empresa && empresaComSaldoSuspeito(empresa.saldoAtual) && (
            <Nota tom="atencao">
              Saldo negativo na conta Empresa quase sempre é erro de lançamento: pró-labore marcado
              como devolução de aporte. Pró-labore é receita e não reduz esta conta.
            </Nota>
          )}

          <Secao titulo="Suas contas">
            <Cartao>
              <ul className="divide-y divide-borda">
                {agruparEmArvore(disponiveis).map(({ conta, subcontas }) => (
                  <LinhaDeConta
                    key={conta.id}
                    id={conta.id}
                    nome={conta.nome}
                    detalhe={
                      conta.instituicao
                        ? `${ROTULO_TIPO_CONTA[conta.tipo]} · ${conta.instituicao}`
                        : ROTULO_TIPO_CONTA[conta.tipo]
                    }
                    cor={conta.cor}
                    instituicao={conta.instituicao}
                    contaPaiId={conta.contaPaiId}
                    valor={conta.saldoAtual}
                    subcontas={subcontas}
                  />
                ))}
                {empresa && (
                  <LinhaDeConta
                    id={empresa.id}
                    nome={empresa.nome}
                    detalhe="Fronteira com o negócio"
                    cor={empresa.cor}
                    instituicao={empresa.instituicao}
                    valor={empresa.saldoAtual}
                    neutra
                  />
                )}
              </ul>
            </Cartao>
          </Secao>
        </>
      )}

      <BlocoDoQueDeve contas={dividasDeConta} />

      {inativas.length > 0 && <BlocoArquivadas contas={inativas} />}
    </Pagina>
  );
}

function LinhaDeConta({
  id,
  nome,
  detalhe,
  cor,
  instituicao,
  contaPaiId,
  valor,
  subcontas = [],
  neutra = false,
}: {
  id: string;
  nome: string;
  detalhe: string;
  cor?: string | null;
  instituicao?: string | null;
  contaPaiId?: string | null;
  valor: Centavos;
  subcontas?: ContaComSaldo[];
  neutra?: boolean;
}) {
  const [encerrando, setEncerrando] = useState(false);
  const [editando, setEditando] = useState(false);

  return (
    <li className="px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className="h-7 w-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: cor ?? 'var(--color-borda-forte)' }}
          />
          <div className="min-w-0">
            <p className="truncate text-slate-100">{nome}</p>
            <p className="truncate text-xs text-slate-500">{detalhe}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-4">
          <Dinheiro
            centavos={neutra ? Math.abs(valor) : valor}
            className={neutra ? 'text-slate-300' : valor < 0 ? 'text-red-400' : 'text-slate-100'}
          />
          <button
            onClick={() => {
              setEditando((v) => !v);
              setEncerrando(false);
            }}
            className={`text-xs text-slate-600 transition hover:text-slate-300 ${ALVO_DE_TOQUE}`}
          >
            {editando ? 'Fechar' : 'Editar'}
          </button>
          <button
            onClick={() => {
              setEncerrando((v) => !v);
              setEditando(false);
            }}
            title="Encerrar — o histórico é preservado"
            className={`text-xs text-slate-600 transition hover:text-slate-300 ${ALVO_DE_TOQUE}`}
          >
            {encerrando ? 'Cancelar' : 'Encerrar'}
          </button>
        </div>
      </div>

      {editando && (
        <PainelDeEdicao
          id={id}
          nome={nome}
          instituicao={instituicao ?? ''}
          cor={cor ?? null}
          contaPaiId={contaPaiId ?? null}
          aoTerminar={() => setEditando(false)}
        />
      )}

      {encerrando && (
        <PainelDeEncerramento id={id} nome={nome} aoTerminar={() => setEncerrando(false)} />
      )}

      {/* As subcontas ficam dentro da linha da principal, em corpo menor. Não
          somam nada nela: cada uma tem o próprio saldo, e o consolidado lá em
          cima já contou as duas (§13.2). */}
      {subcontas.length > 0 && (
        <ul className="mt-2 space-y-1 border-l border-borda pl-3">
          {subcontas.map((sub) => (
            <LinhaDeSubconta key={sub.id} conta={sub} />
          ))}
        </ul>
      )}
    </li>
  );
}

function LinhaDeSubconta({ conta }: { conta: ContaComSaldo }) {
  const [editando, setEditando] = useState(false);

  return (
    <li>
      <div className="flex items-center justify-between gap-3 py-1">
        <span className="flex min-w-0 items-center gap-2">
          <span
            className="h-4 w-1 shrink-0 rounded-full"
            style={{ backgroundColor: conta.cor ?? 'var(--color-borda-forte)' }}
          />
          <span className="min-w-0">
            <span className="block truncate text-sm text-slate-300">{conta.nome}</span>
            <span className="block truncate text-[11px] text-slate-600">
              {ROTULO_TIPO_CONTA[conta.tipo]}
            </span>
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-3">
          <Dinheiro centavos={conta.saldoAtual} className="text-sm text-slate-300" />
          <button
            onClick={() => setEditando((v) => !v)}
            className={`text-xs text-slate-600 transition hover:text-slate-300 ${ALVO_DE_TOQUE}`}
          >
            {editando ? 'Fechar' : 'Editar'}
          </button>
        </span>
      </div>

      {editando && (
        <PainelDeEdicao
          id={conta.id}
          nome={conta.nome}
          instituicao={conta.instituicao ?? ''}
          cor={conta.cor}
          contaPaiId={conta.contaPaiId}
          aoTerminar={() => setEditando(false)}
        />
      )}
    </li>
  );
}

function textoDoBloqueio(bloqueio: Bloqueio): string {
  if (bloqueio.motivo === 'saldo') {
    return `Ainda tem ${formatar(Math.abs(bloqueio.valor))} nesta conta. Dinheiro não some porque a conta fechou — ele foi para algum lugar, e esse lugar precisa estar lançado.`;
  }
  return 'Estas recorrências ainda apontam para cá. Se continuarem, geram lançamento todo mês numa conta que não existe mais — sozinhas, sem ninguém ver.';
}

function textoDoAviso(aviso: Aviso): string {
  switch (aviso.motivo) {
    case 'lancamentos_futuros':
      return 'Estes lançamentos com data à frente continuam aqui. Está certo: parcela lançada é dívida que existe, e ela não deixa de existir porque a conta fechou.';
    case 'metas':
      return 'Estas metas usam o saldo desta conta como "quanto já tem". Depois de encerrada elas vão ler zero — vale reapontar para a conta nova.';
    case 'cartoes':
      return 'Estes cartões têm esta conta como pagadora. A tela de pagamento deixa de sugeri-la e volta a pedir a conta na hora.';
    case 'modelos':
      return 'Estes atalhos de lançamento preenchem esta conta. Eles continuam existindo e vão apontar para uma conta fora de circulação — vale reapontar ou apagar em Mais → Atalhos.';
  }
}

/**
 * O que precisa ser resolvido antes de encerrar (§4.8).
 *
 * A conta não é apagada em momento nenhum: encerrar é gravar a data e tirar de
 * circulação. O histórico continua inteiro, e é justamente por isso que o
 * painel pode ser exigente antes — depois de encerrada, uma pendência
 * esquecida vira um número errado que ninguém mais vai procurar.
 */
function PainelDeEncerramento({
  id,
  nome,
  aoTerminar,
}: {
  id: string;
  nome: string;
  aoTerminar: () => void;
}) {
  const cliente = useQueryClient();
  const contas = usarContasComSaldo();
  const encerrar = usarEncerrarConta();
  const excluir = usarExcluirConta();
  const [data, setData] = useState<DataISO>(hoje());
  const [destinoId, setDestinoId] = useState<string | null>(null);

  const situacao = useQuery({
    queryKey: ['situacao-conta', id],
    queryFn: () => situacaoDaConta(id),
  });

  const transferir = useMutation({
    mutationFn: (saldo: Centavos) =>
      criarTransferencia({
        valor: Math.abs(saldo),
        // Saldo negativo é dívida: aí o dinheiro entra aqui, não sai.
        contaOrigemId: saldo > 0 ? id : destinoId!,
        contaDestinoId: saldo > 0 ? destinoId! : id,
        data,
        descricao: `Encerramento da conta ${nome}`,
      }),
    onSuccess: () => cliente.invalidateQueries(),
  });

  const desativar = useMutation({
    mutationFn: () => arquivarRecorrenciasDaConta(id),
    onSuccess: () => cliente.invalidateQueries(),
  });

  if (situacao.isPending) {
    return <p className="mt-3 text-xs text-slate-500">Conferindo pendências…</p>;
  }
  if (situacao.isError) {
    return <p className="mt-3 text-xs text-red-400">{(situacao.error as Error).message}</p>;
  }

  const conferencia = conferirEncerramento(situacao.data);
  const saldo = situacao.data.saldo;
  const destinos = (contas.data ?? []).filter((c) => c.id !== id && entraNoConsolidado(c));

  return (
    <div className="mt-3 space-y-3 rounded-lg border border-borda-forte bg-superficie-alta p-3">
      {conferencia.bloqueios.map((bloqueio) => (
        <div key={bloqueio.motivo} className="space-y-2">
          <p className="text-xs leading-relaxed text-amber-300">{textoDoBloqueio(bloqueio)}</p>

          {bloqueio.motivo === 'saldo' &&
            (destinos.length === 0 ? (
              <p className="text-xs leading-relaxed text-slate-500">
                Não há outra conta para receber esse dinheiro. Cadastre a conta para onde ele foi —
                nem que seja a carteira — e o saldo tem para onde ir.
              </p>
            ) : (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] uppercase tracking-wider text-slate-600">
                    {saldo > 0 ? 'transferir para' : 'cobrir com'}
                  </span>
                  {destinos.map((conta) => (
                    <button
                      key={conta.id}
                      onClick={() => setDestinoId(conta.id)}
                      className={`rounded-full px-2.5 py-1 text-xs transition ${
                        destinoId === conta.id
                          ? 'bg-sky-900/60 text-sky-200'
                          : 'border border-borda text-slate-500 hover:border-borda-forte'
                      }`}
                    >
                      {conta.nome}
                    </button>
                  ))}
                </div>
                <Botao
                  tipo="secundario"
                  aoClicar={() => transferir.mutate(saldo)}
                  desabilitado={destinoId === null || transferir.isPending}
                >
                  Transferir {formatar(Math.abs(saldo))}
                </Botao>
                {transferir.isError && (
                  <p className="text-xs text-red-400">{(transferir.error as Error).message}</p>
                )}
              </div>
            ))}

          {bloqueio.motivo === 'recorrencias' && (
            <>
              <ListaDePendencias itens={bloqueio.itens} />
              <Botao
                tipo="secundario"
                aoClicar={() => desativar.mutate()}
                desabilitado={desativar.isPending}
              >
                Desativar
              </Botao>
            </>
          )}
        </div>
      ))}

      {conferencia.avisos.map((aviso) => (
        <div key={aviso.motivo} className="space-y-1.5">
          <p className="text-xs leading-relaxed text-slate-500">{textoDoAviso(aviso)}</p>
          <ListaDePendencias itens={aviso.itens} />
        </div>
      ))}

      <div className="space-y-2 border-t border-borda pt-3">
        <label className="block text-xs text-slate-400">Encerrada em</label>
        <input
          type="date"
          value={data}
          onChange={(e) => e.target.value && setData(e.target.value)}
          className={ENTRADA}
        />
        <p className="text-xs leading-relaxed text-slate-600">
          A data em que a conta fechou de verdade. Sem ela, um saldo antigo fica sem explicação —
          parece dinheiro que sumiu.
        </p>

        <div className="flex flex-wrap gap-2">
          <Botao
            aoClicar={() => encerrar.mutate({ id, data }, { onSuccess: aoTerminar })}
            desabilitado={!conferencia.pode || encerrar.isPending}
          >
            Encerrar conta
          </Botao>
          {conferencia.podeExcluir && (
            <Botao
              tipo="secundario"
              aoClicar={() => excluir.mutate(id, { onSuccess: aoTerminar })}
              desabilitado={excluir.isPending}
            >
              Excluir de vez
            </Botao>
          )}
        </div>

        {conferencia.podeExcluir && (
          <p className="text-xs leading-relaxed text-slate-600">
            Esta conta não tem lançamento nenhum, então dá para apagar sem quebrar relatório de mês
            fechado. É o caso de conta criada por engano.
          </p>
        )}

        {encerrar.isError && (
          <p className="text-xs text-red-400">{(encerrar.error as Error).message}</p>
        )}
        {excluir.isError && (
          <p className="text-xs text-red-400">{(excluir.error as Error).message}</p>
        )}
      </div>
    </div>
  );
}


function BlocoArquivadas({
  contas,
}: {
  contas: { id: string; nome: string; tipo: TipoDeConta; encerradaEm: DataISO | null }[];
}) {
  const desarquivar = usarDesarquivarConta();

  return (
    <Secao titulo="Fora de circulação">
      <Cartao>
        <ul className="divide-y divide-borda">
          {contas.map((conta) => (
            <li key={conta.id} className="flex items-center justify-between px-4 py-2.5">
              <span className="min-w-0 text-sm text-slate-500">
                <span className="truncate">
                  {conta.nome} · {ROTULO_TIPO_CONTA[conta.tipo]}
                </span>
                {conta.encerradaEm !== null && (
                  <span className="block text-xs text-slate-600">
                    encerrada em {formatarBR(conta.encerradaEm)}
                  </span>
                )}
              </span>
              <button
                onClick={() => desarquivar.mutate(conta.id)}
                className={`shrink-0 text-xs text-slate-600 transition hover:text-slate-300 ${ALVO_DE_TOQUE}`}
              >
                {conta.encerradaEm === null ? 'Reativar' : 'Reabrir'}
              </button>
            </li>
          ))}
        </ul>
      </Cartao>
      <p className="text-xs text-slate-600">
        Conta encerrada ou arquivada some dos seletores e do saldo, mas continua inteira nos
        relatórios dos meses fechados — nada foi apagado. Reabrir volta a colocá-la em circulação e
        limpa a data de encerramento.
      </p>
    </Secao>
  );
}

function FormularioConta({ aoTerminar }: { aoTerminar: () => void }) {
  const criar = usarCriarConta();
  const [nome, setNome] = useState('');
  const [tipo, setTipo] = useState<TipoDeConta>('corrente');
  const [instituicao, setInstituicao] = useState('');
  const [cor, setCor] = useState<string | null>(null);
  const [contaPaiId, setContaPaiId] = useState<string | null>(null);
  const [saldoInicial, setSaldoInicial] = useState<Centavos>(0);
  const contas = usarContas();

  async function aoEnviar(evento: FormEvent) {
    evento.preventDefault();
    if (nome.trim() === '') return;
    await criar.mutateAsync({ nome, tipo, instituicao, cor, contaPaiId, saldoInicial });
    aoTerminar();
  }

  return (
    <form onSubmit={aoEnviar}>
      <Cartao className="space-y-4 p-4">
        <Campo rotulo="Nome">
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Conta corrente, Carteira, Empresa…"
            autoFocus
            className={ENTRADA}
          />
        </Campo>

        <Campo
          rotulo="Tipo"
          ajuda={
            tipo === 'empresa'
              ? 'Conta de fronteira com o negócio. Aporte é transferência, não despesa. Só pode existir uma.'
              : tipo === 'carteira'
                ? 'Dinheiro físico. Não vale caçar cada R$ 5 — o acerto é a contagem mensal.'
                : undefined
          }
        >
          <div className="flex flex-wrap gap-2">
            {TIPOS_DE_CONTA_CADASTRAVEIS.map((t) => (
              <Chip key={t} ativo={tipo === t} aoClicar={() => setTipo(t)}>
                {ROTULO_TIPO_CONTA[t]}
              </Chip>
            ))}
          </div>
        </Campo>

        <CampoInstituicao
          instituicao={instituicao}
          cor={cor}
          aoMudar={(nova, novaCor) => {
            setInstituicao(nova);
            setCor(novaCor);
          }}
        />

        <CampoContaPrincipal
          contas={(contas.data ?? []).filter(entraNoConsolidado)}
          contaEditadaId={null}
          escolhida={contaPaiId}
          aoEscolher={setContaPaiId}
        />

        <CampoValor valor={saldoInicial} aoMudar={setSaldoInicial} rotulo="Saldo inicial" />
        <p className="-mt-2 text-xs leading-relaxed text-slate-500">
          O saldo do dia 1º deste mês, não o de hoje. Começar no dia 1º entrega um mês fechado de
          verdade já na primeira virada.
        </p>

        {criar.isError && <p className="text-sm text-red-400">{(criar.error as Error).message}</p>}

        <div className="flex gap-2 pt-1">
          <Botao submit desabilitado={criar.isPending || nome.trim() === ''}>
            {criar.isPending ? 'Salvando…' : 'Salvar'}
          </Botao>
          <Botao tipo="secundario" aoClicar={aoTerminar}>
            Cancelar
          </Botao>
        </div>
      </Cartao>
    </form>
  );
}

/**
 * Nome, instituição e cor de uma conta já criada (§4).
 *
 * Faltava a coisa mais simples: uma conta cadastrada errada não tinha como
 * ser corrigida. Encerrar e criar outra funcionaria, e levaria o histórico
 * junto para um lugar que ninguém mais olha — arrumar um erro de digitação
 * não pode custar isso.
 *
 * O tipo fica de fora: mudar uma conta corrente para cartão, ou para Empresa,
 * muda o que os lançamentos dela significam (§2.6, §2.1). Isso não é edição,
 * é outra conta.
 */
function PainelDeEdicao({
  id,
  nome,
  instituicao,
  cor,
  contaPaiId,
  aoTerminar,
}: {
  id: string;
  nome: string;
  instituicao: string;
  cor: string | null;
  contaPaiId: string | null;
  aoTerminar: () => void;
}) {
  const atualizar = usarAtualizarConta();
  const contas = usarContas();
  const [novoNome, setNovoNome] = useState(nome);
  const [novaInstituicao, setNovaInstituicao] = useState(instituicao);
  const [novaCor, setNovaCor] = useState(cor);
  const [novaPrincipal, setNovaPrincipal] = useState(contaPaiId);

  return (
    <div className="mt-3 space-y-4 rounded-lg border border-borda-forte bg-superficie-alta p-3">
      <Campo rotulo="Nome">
        <input
          value={novoNome}
          onChange={(e) => setNovoNome(e.target.value)}
          autoFocus
          className={ENTRADA}
        />
      </Campo>

      <CampoInstituicao
        instituicao={novaInstituicao}
        cor={novaCor}
        aoMudar={(nova, corNova) => {
          setNovaInstituicao(nova);
          setNovaCor(corNova);
        }}
      />

      <CampoContaPrincipal
        contas={(contas.data ?? []).filter(entraNoConsolidado)}
        contaEditadaId={id}
        escolhida={novaPrincipal}
        aoEscolher={setNovaPrincipal}
      />

      {atualizar.isError && (
        <p className="text-sm text-red-400">{(atualizar.error as Error).message}</p>
      )}

      <div className="flex gap-2">
        <Botao
          aoClicar={() =>
            atualizar.mutate(
              {
                id,
                campos: {
                  nome: novoNome,
                  instituicao: novaInstituicao,
                  cor: novaCor,
                  contaPaiId: novaPrincipal,
                },
              },
              { onSuccess: aoTerminar },
            )
          }
          desabilitado={novoNome.trim() === '' || atualizar.isPending}
        >
          Salvar
        </Botao>
        <Botao tipo="secundario" aoClicar={aoTerminar}>
          Cancelar
        </Botao>
      </div>
    </div>
  );
}

/**
 * O que você deve (§2.1, §4.7).
 *
 * Fica em bloco separado de propósito. Cartão e dívida não são lugar onde o
 * dinheiro está — são compromisso, e listá-los junto com corrente e carteira
 * faz o cartão parecer uma subconta sua. São a outra metade da pergunta: uma
 * lista diz onde o dinheiro está, esta diz para onde ele já está prometido.
 *
 * O valor vem positivo. Dívida com sinal de menos é a armadilha do §2.6 — o
 * número lido ao contrário do que significa.
 */
function BlocoDoQueDeve({ contas }: { contas: ContaComSaldo[] }) {
  const dividas = useQuery({ queryKey: ['dividas-cartoes'], queryFn: dividasDosCartoes });
  const cartoes = usarCartoes();

  const doCartao = [...(dividas.data ?? []).entries()].map(([contaId, divida]) => ({
    id: contaId,
    nome: cartoes.data?.find((c) => c.contaId === contaId)?.conta.nome ?? 'Cartão',
    cor: cartoes.data?.find((c) => c.contaId === contaId)?.conta.cor ?? null,
    detalhe: divida.proximoVencimento
      ? `Cartão de crédito · próxima vence ${formatarBR(divida.proximoVencimento)}`
      : 'Cartão de crédito',
    valor: divida.total,
  }));

  const deEmprestimo = contas.map((conta) => ({
    id: conta.id,
    nome: conta.nome,
    cor: conta.cor,
    detalhe: 'Dívida',
    valor: Math.abs(conta.saldoAtual),
  }));

  const linhas = [...doCartao, ...deEmprestimo];
  if (linhas.length === 0) return null;

  const total = linhas.reduce((soma, l) => soma + l.valor, 0);

  return (
    <Secao titulo="O que você deve">
      <Cartao>
        <ul className="divide-y divide-borda">
          {linhas.map((linha) => (
            <li key={linha.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="flex min-w-0 items-center gap-2.5">
                <span
                  className="h-7 w-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: linha.cor ?? 'var(--color-borda-forte)' }}
                />
                <span className="min-w-0">
                  <span className="block truncate text-slate-100">{linha.nome}</span>
                  <span className="block truncate text-xs text-slate-500">{linha.detalhe}</span>
                </span>
              </span>
              <Dinheiro centavos={linha.valor} className="shrink-0 text-slate-200" />
            </li>
          ))}
          {linhas.length > 1 && (
            <li className="flex items-center justify-between gap-3 px-4 py-2.5">
              <span className="text-xs uppercase tracking-wider text-slate-500">Total</span>
              <Dinheiro centavos={total} className="text-sm text-slate-300" />
            </li>
          )}
        </ul>
      </Cartao>
      <p className="text-xs leading-relaxed text-slate-600">
        Isto não é saldo negativo: é o que já foi gasto e ainda vai sair. Pagar a fatura quita esta
        dívida e não conta como despesa nova — o gasto já foi contado em cada compra.
      </p>
    </Secao>
  );
}

/**
 * Subconta de quem (§4).
 *
 * Caixinha do Nubank, cofrinho do Mercado Pago: conta de verdade, com saldo
 * próprio, que mora dentro de outra. O campo mexe só em onde ela aparece na
 * lista — o saldo continua sendo dela e o consolidado soma as duas.
 *
 * A lista de escolhas já vem podada pelas mesmas três regras que o banco impõe,
 * para a tela não oferecer o que o banco vai recusar.
 */
function CampoContaPrincipal({
  contas,
  contaEditadaId,
  escolhida,
  aoEscolher,
}: {
  // Só o que o campo usa: pedir ContaComSaldo aqui obrigaria quem chama a
  // buscar um saldo que este campo nem mostra.
  contas: { id: string; nome: string; cor: string | null; contaPaiId: string | null }[];
  contaEditadaId: string | null;
  escolhida: string | null;
  aoEscolher: (id: string | null) => void;
}) {
  const possiveis = principaisPossiveis(contas, contaEditadaId);
  if (possiveis.length === 0) return null;

  return (
    <Campo
      rotulo="Subconta de (opcional)"
      ajuda="Para caixinha, cofrinho, reserva — o que mora dentro de outra conta. Ela aparece recuada embaixo da principal, e o saldo continua sendo dela: o consolidado soma as duas."
    >
      <div className="flex flex-wrap gap-2">
        {possiveis.map((conta) => (
          <button
            key={conta.id}
            type="button"
            onClick={() => aoEscolher(escolhida === conta.id ? null : conta.id)}
            className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs transition ${
              escolhida === conta.id
                ? 'bg-sky-900/60 text-sky-200'
                : 'border border-borda text-slate-500 hover:border-borda-forte'
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
    </Campo>
  );
}
