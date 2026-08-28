import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatar, type Centavos } from '../dominio/dinheiro';
import { formatarBR, hoje, type DataISO } from '../dominio/datas';
import { conferirEncerramento, type Aviso, type Bloqueio } from '../dominio/encerramento';
import { situacaoDaConta } from '../dados/contas';
import { criarTransferencia } from '../dados/transacoes';
import { arquivarRecorrenciasDaConta } from '../dados/recorrencias';
import { empresaComSaldoSuspeito, entraNoConsolidado, rotuloDaContaEmpresa } from '../dominio/saldo';
import { CampoValor } from '../ui/CampoValor';
import {
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
import {
  usarContas,
  usarContasComSaldo,
  usarCriarConta,
  usarDesarquivarConta,
  usarEncerrarConta,
  usarExcluirConta,
} from '../dados/usarContas';
import { ROTULO_TIPO_CONTA, TIPOS_DE_CONTA_CADASTRAVEIS, type TipoDeConta } from '../dados/tipos';

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
                {disponiveis.map((conta) => (
                  <LinhaDeConta
                    key={conta.id}
                    id={conta.id}
                    nome={conta.nome}
                    detalhe={
                      conta.instituicao
                        ? `${ROTULO_TIPO_CONTA[conta.tipo]} · ${conta.instituicao}`
                        : ROTULO_TIPO_CONTA[conta.tipo]
                    }
                    valor={conta.saldoAtual}
                  />
                ))}
                {empresa && (
                  <LinhaDeConta
                    id={empresa.id}
                    nome={empresa.nome}
                    detalhe="Fronteira com o negócio"
                    valor={empresa.saldoAtual}
                    neutra
                  />
                )}
              </ul>
            </Cartao>
          </Secao>
        </>
      )}

      {inativas.length > 0 && <BlocoArquivadas contas={inativas} />}
    </Pagina>
  );
}

function LinhaDeConta({
  id,
  nome,
  detalhe,
  valor,
  neutra = false,
}: {
  id: string;
  nome: string;
  detalhe: string;
  valor: Centavos;
  neutra?: boolean;
}) {
  const [encerrando, setEncerrando] = useState(false);

  return (
    <li className="px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-slate-100">{nome}</p>
          <p className="truncate text-xs text-slate-500">{detalhe}</p>
        </div>
        <div className="flex shrink-0 items-center gap-4">
          <Dinheiro
            centavos={neutra ? Math.abs(valor) : valor}
            className={neutra ? 'text-slate-300' : valor < 0 ? 'text-red-400' : 'text-slate-100'}
          />
          <button
            onClick={() => setEncerrando((v) => !v)}
            title="Encerrar — o histórico é preservado"
            className="text-xs text-slate-600 transition hover:text-slate-300"
          >
            {encerrando ? 'cancelar' : 'encerrar'}
          </button>
        </div>
      </div>

      {encerrando && (
        <PainelDeEncerramento id={id} nome={nome} aoTerminar={() => setEncerrando(false)} />
      )}
    </li>
  );
}

const TEXTO_DO_BLOQUEIO: Record<Bloqueio['motivo'], (q: number) => string> = {
  saldo: (q) =>
    `Ainda tem ${formatar(Math.abs(q))} nesta conta. Dinheiro não some porque a conta fechou — ele foi para algum lugar, e esse lugar precisa estar lançado.`,
  recorrencias: (q) =>
    `${q} recorrência(s) ativa(s) apontam para cá. Se continuarem, geram lançamento todo mês numa conta que não existe mais — sozinhas, sem ninguém ver.`,
};

const TEXTO_DO_AVISO: Record<Aviso['motivo'], (q: number) => string> = {
  lancamentos_futuros: (q) =>
    `${q} lançamento(s) com data à frente continuam aqui. Está certo: parcela lançada é dívida que existe, e ela não deixa de existir porque a conta fechou.`,
  metas: (q) =>
    `${q} meta(s) usam o saldo desta conta como "quanto já tem". Depois de encerrada elas vão ler zero — vale reapontar para a conta nova.`,
  cartoes: (q) =>
    `${q} cartão(ões) têm esta conta como pagadora. A tela de pagamento deixa de sugeri-la e volta a pedir a conta na hora.`,
  modelos: (q) =>
    `${q} atalho(s) de lançamento preenchem esta conta. Eles continuam existindo e vão apontar para uma conta fora de circulação — vale reapontar ou apagar em Mais → Atalhos.`,
};

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
          <p className="text-xs leading-relaxed text-amber-300">
            {TEXTO_DO_BLOQUEIO[bloqueio.motivo](bloqueio.quantidade)}
          </p>

          {bloqueio.motivo === 'saldo' && (
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
          )}

          {bloqueio.motivo === 'recorrencias' && (
            <Botao
              tipo="secundario"
              aoClicar={() => desativar.mutate()}
              desabilitado={desativar.isPending}
            >
              Desativar as {bloqueio.quantidade}
            </Botao>
          )}
        </div>
      ))}

      {conferencia.avisos.map((aviso) => (
        <p key={aviso.motivo} className="text-xs leading-relaxed text-slate-500">
          {TEXTO_DO_AVISO[aviso.motivo](aviso.quantidade)}
        </p>
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
                className="shrink-0 text-xs text-slate-600 transition hover:text-slate-300"
              >
                {conta.encerradaEm === null ? 'reativar' : 'reabrir'}
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
  const [saldoInicial, setSaldoInicial] = useState<Centavos>(0);

  async function aoEnviar(evento: FormEvent) {
    evento.preventDefault();
    if (nome.trim() === '') return;
    await criar.mutateAsync({ nome, tipo, instituicao, saldoInicial });
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

        <Campo rotulo="Instituição (opcional)">
          <input
            value={instituicao}
            onChange={(e) => setInstituicao(e.target.value)}
            className={ENTRADA}
          />
        </Campo>

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
