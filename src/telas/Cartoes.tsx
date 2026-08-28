import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatarBR, hoje, type DataISO } from '../dominio/datas';
import {
  conferirEncerramentoDeCartao,
  type AvisoDoCartao,
  type BloqueioDoCartao,
} from '../dominio/encerramento';
import { situacaoDoCartao } from '../dados/cartoes';
import { dividasDosCartoes } from '../dados/faturas';
import { ListaDePendencias } from '../ui/ListaDePendencias';
import { arquivarRecorrenciasDaConta } from '../dados/recorrencias';
import { formatar, type Centavos } from '../dominio/dinheiro';
import { descreverFatura, ehDiaValido, faturaDeReferencia } from '../dominio/fatura';
import { CampoValor } from '../ui/CampoValor';
import { ALVO_DE_TOQUE, Botao, Campo, Dinheiro, ENTRADA, Pagina } from '../ui/base';
import {
  usarAtualizarCartao,
  usarCartoes,
  usarCriarCartao,
  usarDesarquivarCartao,
  usarEncerrarCartao,
  usarExcluirCartao,
} from '../dados/usarCartoes';
import { usarContas } from '../dados/usarContas';
import { podePagarFatura } from '../dominio/saldo';
import type { CartaoComConta } from '../dados/tipos';
import { CampoInstituicao } from '../ui/CampoInstituicao';

export function Cartoes() {
  const cartoes = usarCartoes(true);
  const dividas = useQuery({ queryKey: ['dividas-cartoes'], queryFn: dividasDosCartoes });
  const contas = usarContas();
  const atualizar = usarAtualizarCartao();
  const [mostrandoFormulario, setMostrandoFormulario] = useState(false);

  const pagadoras = (contas.data ?? []).filter(podePagarFatura);

  if (cartoes.isPending) return <p className="p-6 text-slate-400">Carregando cartões…</p>;
  if (cartoes.isError) {
    return <p className="p-6 text-red-400">Erro ao carregar: {(cartoes.error as Error).message}</p>;
  }

  const ativos = cartoes.data.filter((c) => c.conta.ativo);
  const arquivados = cartoes.data.filter((c) => !c.conta.ativo);

  return (
    <Pagina
      titulo="Cartões"
      subtitulo="Fechamento, vencimento e limite"
      acao={
        <Botao
          aoClicar={() => setMostrandoFormulario((v) => !v)}
          tipo={mostrandoFormulario ? 'secundario' : 'primario'}
        >
          {mostrandoFormulario ? 'Cancelar' : 'Novo cartão'}
        </Botao>
      }
    >

      {mostrandoFormulario && <FormularioCartao aoTerminar={() => setMostrandoFormulario(false)} />}

      {ativos.length === 0 && !mostrandoFormulario && (
        <div className="rounded-xl border border-dashed border-borda-forte p-8 text-center">
          <p className="text-slate-300">Nenhum cartão cadastrado.</p>
          <p className="mt-2 text-sm text-slate-500">
            Cartão adicional ou virtual do mesmo cartão não entra aqui de novo — é o mesmo cartão.
          </p>
        </div>
      )}

      <section className="space-y-3">
        {ativos.map((cartao) => {
          const fatura = faturaDeReferencia(hoje(), cartao);
          return (
            <article
              key={cartao.contaId}
              className="rounded-xl border border-borda bg-superficie p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <span
                  className="mt-0.5 h-8 w-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: cartao.conta.cor ?? 'var(--color-borda-forte)' }}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-slate-100">{cartao.conta.nome}</p>
                  <p className="text-xs text-slate-500">
                    Fecha dia {cartao.diaFechamento} · vence dia {cartao.diaVencimento}
                    {cartao.limite !== null && ` · limite ${formatar(cartao.limite)}`}
                  </p>
                </div>
                <div className="flex shrink-0 gap-3">
                  <EditarCartao cartao={cartao} />
                  <EncerrarCartao contaId={cartao.contaId} />
                </div>
              </div>
              {/* Cartão não tem saldo, tem dívida — e ela é mostrada positiva,
                  do jeito que a fatura do banco mostra. Um número negativo
                  chamado de saldo seria lido ao contrário (§2.6). */}
              <div className="mt-3 flex items-baseline justify-between gap-3 rounded-md bg-superficie-alta px-3 py-2">
                <span className="text-[11px] uppercase tracking-wider text-slate-500">
                  Você deve
                </span>
                <span className="text-right">
                  <Dinheiro
                    centavos={dividas.data?.get(cartao.contaId)?.total ?? 0}
                    className="text-slate-100"
                  />
                  {dividas.data?.get(cartao.contaId)?.proximoVencimento && (
                    <span className="block text-[11px] text-slate-500">
                      próxima vence {formatarBR(dividas.data.get(cartao.contaId)!.proximoVencimento!)}
                    </span>
                  )}
                </span>
              </div>

              <p className="mt-2 text-xs leading-relaxed text-slate-500">
                {descreverFatura(fatura)}
              </p>
              <div className="mt-3">
                <ContaQuePaga
                  contas={pagadoras}
                  selecionada={cartao.contaPagamentoId}
                  aoEscolher={(contaPagamentoId) =>
                    atualizar.mutate({ contaId: cartao.contaId, campos: { contaPagamentoId } })
                  }
                />
              </div>
            </article>
          );
        })}
      </section>

      <p className="rounded-lg border border-borda px-4 py-3 text-xs text-slate-500">
        A conta que paga é só o padrão da tela de pagamento — na hora de registrar dá para pagar de
        outra. O que sai no relatório é sempre a conta que ficou gravada na transferência daquele
        mês, não esta.
      </p>

      {arquivados.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm text-slate-500">Fora de circulação</h2>
          {arquivados.map((cartao) => (
            <DesarquivarCartao
              key={cartao.contaId}
              contaId={cartao.contaId}
              nome={cartao.conta.nome}
              encerradoEm={cartao.conta.encerradaEm}
            />
          ))}
          <p className="text-xs leading-relaxed text-slate-600">
            Cartão encerrado some do seletor de lançamento, mas as faturas antigas continuam
            inteiras. Enquanto sobrar fatura por pagar, ele continua aparecendo em Faturas — dívida
            que sai da vista não é dívida resolvida.
          </p>
        </section>
      )}
    </Pagina>
  );
}

function EncerrarCartao({ contaId }: { contaId: string }) {
  const [aberto, setAberto] = useState(false);
  return (
    <div className="shrink-0">
      <button
        onClick={() => setAberto((v) => !v)}
        title="Encerrar — as faturas antigas são preservadas"
        className={`text-xs text-slate-500 hover:text-slate-300 ${ALVO_DE_TOQUE}`}
      >
        {aberto ? 'Cancelar' : 'Encerrar'}
      </button>
      {aberto && (
        <PainelDeEncerramentoDoCartao contaId={contaId} aoTerminar={() => setAberto(false)} />
      )}
    </div>
  );
}

function textoDoBloqueio(bloqueio: BloqueioDoCartao): string {
  if (bloqueio.motivo === 'fatura_cobravel') {
    return `Ainda há ${formatar(Math.abs(bloqueio.valor))} em fatura vencida e não paga. Encerrado, o cartão sai do seletor de faturas e essa dívida some da tela — mas não some da cobrança do banco.`;
  }
  return 'Estas assinaturas são cobradas neste cartão. Se continuarem, vão gerar lançamento todo mês num cartão que não existe mais.';
}

function textoDoAviso(aviso: AvisoDoCartao): string {
  if (aviso.motivo === 'faturas_futuras') {
    return `${formatar(Math.abs(aviso.valor))} em faturas que ainda vão vencer — em geral parcelamento em curso. Não impede: enquanto sobrar fatura por pagar, o cartão continua aparecendo na tela de Faturas mesmo encerrado.`;
  }
  return 'Estes atalhos de lançamento apontam para este cartão. Eles continuam existindo e vão preencher um cartão que saiu de circulação — vale reapontar ou apagar em Mais → Atalhos.';
}

/**
 * O que precisa ser resolvido antes de encerrar o cartão (§4.8).
 *
 * O risco aqui não é o mesmo das contas. Cartão não tem saldo, tem fatura — e
 * um cartão fora de circulação some do seletor, levando junto o que ainda se
 * deve. Por isso o que já venceu impede, e o que ainda vai vencer só avisa: a
 * tela de Faturas continua mostrando cartão encerrado enquanto houver dívida.
 */
function PainelDeEncerramentoDoCartao({
  contaId,
  aoTerminar,
}: {
  contaId: string;
  aoTerminar: () => void;
}) {
  const cliente = useQueryClient();
  const encerrar = usarEncerrarCartao();
  const excluir = usarExcluirCartao();
  const [data, setData] = useState<DataISO>(hoje());

  const situacao = useQuery({
    queryKey: ['situacao-conta', contaId],
    queryFn: () => situacaoDoCartao(contaId),
  });

  const desativar = useMutation({
    mutationFn: () => arquivarRecorrenciasDaConta(contaId),
    onSuccess: () => cliente.invalidateQueries(),
  });

  if (situacao.isPending) {
    return <p className="mt-3 text-xs text-slate-500">Conferindo pendências…</p>;
  }
  if (situacao.isError) {
    return <p className="mt-3 text-xs text-red-400">{(situacao.error as Error).message}</p>;
  }

  const conferencia = conferirEncerramentoDeCartao(situacao.data);

  return (
    <div className="mt-3 space-y-3 rounded-lg border border-borda-forte bg-superficie-alta p-3">
      {conferencia.bloqueios.map((bloqueio) => (
        <div key={bloqueio.motivo} className="space-y-2">
          <p className="text-xs leading-relaxed text-amber-300">{textoDoBloqueio(bloqueio)}</p>
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
          {aviso.motivo === 'modelos' && <ListaDePendencias itens={aviso.itens} />}
        </div>
      ))}

      <div className="space-y-2 border-t border-borda pt-3">
        <label className="block text-xs text-slate-400">Encerrado em</label>
        <input
          type="date"
          value={data}
          onChange={(e) => e.target.value && setData(e.target.value)}
          className="w-full rounded-lg border border-borda-forte bg-superficie px-3 py-2 text-slate-100 outline-none focus:border-slate-500"
        />

        <div className="flex flex-wrap gap-2">
          <Botao
            aoClicar={() => encerrar.mutate({ contaId, data }, { onSuccess: aoTerminar })}
            desabilitado={!conferencia.pode || encerrar.isPending}
          >
            Encerrar cartão
          </Botao>
          {conferencia.podeExcluir && (
            <Botao
              tipo="secundario"
              aoClicar={() => excluir.mutate(contaId, { onSuccess: aoTerminar })}
              desabilitado={excluir.isPending}
            >
              Excluir de vez
            </Botao>
          )}
        </div>

        {conferencia.podeExcluir && (
          <p className="text-xs leading-relaxed text-slate-600">
            Este cartão nunca teve lançamento, então dá para apagar sem quebrar fatura de mês
            fechado. As faturas vazias já geradas saem junto.
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


function DesarquivarCartao({
  contaId,
  nome,
  encerradoEm,
}: {
  contaId: string;
  nome: string;
  encerradoEm: DataISO | null;
}) {
  const desarquivar = usarDesarquivarCartao();
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-borda px-4 py-2">
      <span className="min-w-0 text-sm text-slate-500">
        <span className="truncate">{nome}</span>
        {encerradoEm !== null && (
          <span className="block text-xs text-slate-600">
            encerrado em {formatarBR(encerradoEm)}
          </span>
        )}
      </span>
      <button
        onClick={() => desarquivar.mutate(contaId)}
        className={`shrink-0 text-xs text-slate-500 hover:text-slate-300 ${ALVO_DE_TOQUE}`}
      >
        {encerradoEm === null ? 'Reativar' : 'Reabrir'}
      </button>
    </div>
  );
}

function FormularioCartao({ aoTerminar }: { aoTerminar: () => void }) {
  const criar = usarCriarCartao();
  const [nome, setNome] = useState('');
  const [instituicao, setInstituicao] = useState('');
  const [cor, setCor] = useState<string | null>(null);
  const [limite, setLimite] = useState<Centavos>(0);
  const [diaFechamento, setDiaFechamento] = useState('');
  const [diaVencimento, setDiaVencimento] = useState('');
  const [contaPagamentoId, setContaPagamentoId] = useState<string | null>(null);
  const contas = usarContas();

  const fechamento = Number(diaFechamento);
  const vencimento = Number(diaVencimento);
  const diasOk = ehDiaValido(fechamento) && ehDiaValido(vencimento);

  // A prévia legível do §4.2, calculada em tempo real enquanto o usuário digita.
  // "Corta erro de cadastro pela metade."
  const previa = diasOk
    ? descreverFatura(
        faturaDeReferencia(hoje(), { diaFechamento: fechamento, diaVencimento: vencimento }),
      )
    : null;

  async function aoEnviar(evento: FormEvent) {
    evento.preventDefault();
    if (nome.trim() === '' || !diasOk) return;
    await criar.mutateAsync({
      nome,
      instituicao,
      cor,
      limite: limite === 0 ? null : limite,
      diaFechamento: fechamento,
      diaVencimento: vencimento,
      contaPagamentoId,
    });
    aoTerminar();
  }

  return (
    <form
      onSubmit={aoEnviar}
      className="space-y-4 rounded-xl border border-borda bg-superficie p-4"
    >
      <div>
        <label className="mb-1 block text-sm text-slate-400">Nome</label>
        <input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Apelido do cartão"
          autoFocus
          className="w-full rounded-lg border border-borda-forte bg-superficie-alta px-3 py-2 text-slate-100 outline-none focus:border-slate-500"
        />
        <p className="mt-1 text-xs text-slate-500">
          Apelido basta. O app não guarda número de cartão (§10.1).
        </p>
      </div>

      <CampoInstituicao
        instituicao={instituicao}
        cor={cor}
        aoMudar={(nova, novaCor) => {
          setInstituicao(nova);
          setCor(novaCor);
        }}
      />

      <div className="grid grid-cols-2 gap-3">
        <CampoDia rotulo="Dia do fechamento" valor={diaFechamento} aoMudar={setDiaFechamento} />
        <CampoDia rotulo="Dia do vencimento" valor={diaVencimento} aoMudar={setDiaVencimento} />
      </div>

      {previa ? (
        <p className="rounded-md border border-emerald-800/50 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-200">
          {previa}
        </p>
      ) : (
        <p className="rounded-md border border-borda-forte px-3 py-2 text-sm text-slate-500">
          Informe os dois dias para ver como as faturas vão cair. Eles são obrigatórios: sem eles a
          fatura não fecha.
        </p>
      )}

      <CampoValor valor={limite} aoMudar={setLimite} rotulo="Limite (opcional)" />

      <div>
        <label className="mb-1 block text-sm text-slate-400">Conta que paga (opcional)</label>
        <ContaQuePaga
          contas={(contas.data ?? []).filter(podePagarFatura)}
          selecionada={contaPagamentoId}
          aoEscolher={setContaPagamentoId}
        />
      </div>

      {criar.isError && <p className="text-sm text-red-400">{(criar.error as Error).message}</p>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={criar.isPending || nome.trim() === '' || !diasOk}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {criar.isPending ? 'Salvando…' : 'Salvar'}
        </button>
        <button
          type="button"
          onClick={aoTerminar}
          className="rounded-lg border border-borda-forte px-4 py-2 text-sm text-slate-300"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}

function CampoDia({
  rotulo,
  valor,
  aoMudar,
}: {
  rotulo: string;
  valor: string;
  aoMudar: (v: string) => void;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm text-slate-400">{rotulo}</label>
      <input
        inputMode="numeric"
        value={valor}
        onChange={(e) => aoMudar(e.target.value.replace(/\D/g, '').slice(0, 2))}
        placeholder="1 a 31"
        className="w-full rounded-lg border border-borda-forte bg-superficie-alta px-3 py-2 text-slate-100 outline-none focus:border-slate-500"
      />
    </div>
  );
}

/**
 * De qual conta a fatura deste cartão costuma sair (§2.1).
 *
 * Opcional de propósito. Quem paga de um lugar diferente a cada mês continua
 * escolhendo na hora, e o que ficar gravado na transferência é que vale. O
 * campo existe só para a tela de pagamento parar de marcar a primeira conta da
 * lista — que não é escolha nenhuma, é ordem alfabética.
 *
 * Só aparecem contas de onde dá para pagar de fato: cartão não paga cartão, e
 * Empresa e dívida não são caixa disponível (§2.6, §4.7).
 */
function ContaQuePaga({
  contas,
  selecionada,
  aoEscolher,
}: {
  contas: readonly { id: string; nome: string }[];
  selecionada: string | null;
  aoEscolher: (contaId: string | null) => void;
}) {
  if (contas.length === 0) {
    return (
      <p className="text-xs text-slate-600">
        Nenhuma conta corrente, poupança ou carteira cadastrada ainda.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[11px] uppercase tracking-wider text-slate-600">paga de</span>
      {contas.map((conta) => (
        <button
          key={conta.id}
          type="button"
          onClick={() => aoEscolher(selecionada === conta.id ? null : conta.id)}
          className={`rounded-full px-2.5 py-1 text-xs transition ${
            selecionada === conta.id
              ? 'bg-sky-900/60 text-sky-200'
              : 'border border-borda text-slate-500 hover:border-borda-forte'
          }`}
        >
          {conta.nome}
        </button>
      ))}
    </div>
  );
}

/**
 * Corrigir o cadastro do cartão (§4.2).
 *
 * O dia de fechamento é o que decide em qual fatura cada compra cai. Cadastrado
 * errado, ele erra todas as faturas — e não havia por onde arrumar sem apagar o
 * cartão e perder o histórico junto.
 *
 * A ressalva é honesta e fica na tela: mudar os dias vale para as faturas que
 * ainda vão ser criadas. As que já existem mantêm as datas, porque mover
 * compras entre faturas fechadas reescreveria meses já conferidos.
 */
function EditarCartao({ cartao }: { cartao: CartaoComConta }) {
  const atualizar = usarAtualizarCartao();
  const [aberto, setAberto] = useState(false);
  const [nome, setNome] = useState(cartao.conta.nome);
  const [instituicao, setInstituicao] = useState(cartao.conta.instituicao ?? '');
  const [cor, setCor] = useState(cartao.conta.cor);
  const [limite, setLimite] = useState<Centavos>(cartao.limite ?? 0);
  const [diaFechamento, setDiaFechamento] = useState(String(cartao.diaFechamento));
  const [diaVencimento, setDiaVencimento] = useState(String(cartao.diaVencimento));

  const fechamento = Number(diaFechamento);
  const vencimento = Number(diaVencimento);
  const diasOk = ehDiaValido(fechamento) && ehDiaValido(vencimento);
  const mudouOsDias =
    fechamento !== cartao.diaFechamento || vencimento !== cartao.diaVencimento;

  if (!aberto) {
    return (
      <button
        onClick={() => setAberto(true)}
        className={`text-xs text-slate-500 hover:text-slate-300 ${ALVO_DE_TOQUE}`}
      >
        Editar
      </button>
    );
  }

  return (
    <div className="mt-3 w-full space-y-4 rounded-lg border border-borda-forte bg-superficie-alta p-3">
      <Campo rotulo="Nome">
        <input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          autoFocus
          className={ENTRADA}
        />
      </Campo>

      <CampoInstituicao
        instituicao={instituicao}
        cor={cor}
        aoMudar={(nova, corNova) => {
          setInstituicao(nova);
          setCor(corNova);
        }}
      />

      <div className="grid grid-cols-2 gap-3">
        <CampoDia rotulo="Dia do fechamento" valor={diaFechamento} aoMudar={setDiaFechamento} />
        <CampoDia rotulo="Dia do vencimento" valor={diaVencimento} aoMudar={setDiaVencimento} />
      </div>

      {diasOk && (
        <p className="rounded-md border border-borda px-3 py-2 text-xs leading-relaxed text-slate-400">
          {descreverFatura(
            faturaDeReferencia(hoje(), { diaFechamento: fechamento, diaVencimento: vencimento }),
          )}
        </p>
      )}

      {mudouOsDias && (
        <p className="text-xs leading-relaxed text-amber-400/80">
          Os dias novos valem para as faturas que ainda vão ser criadas. As que já existem mantêm
          as datas — mover compras entre faturas fechadas reescreveria meses já conferidos.
        </p>
      )}

      <CampoValor valor={limite} aoMudar={setLimite} rotulo="Limite (opcional)" />

      {atualizar.isError && (
        <p className="text-sm text-red-400">{(atualizar.error as Error).message}</p>
      )}

      <div className="flex gap-2">
        <Botao
          aoClicar={() =>
            atualizar.mutate(
              {
                contaId: cartao.contaId,
                campos: {
                  nome,
                  instituicao,
                  cor,
                  limite: limite === 0 ? null : limite,
                  diaFechamento: fechamento,
                  diaVencimento: vencimento,
                },
              },
              { onSuccess: () => setAberto(false) },
            )
          }
          desabilitado={nome.trim() === '' || !diasOk || atualizar.isPending}
        >
          Salvar
        </Botao>
        <Botao tipo="secundario" aoClicar={() => setAberto(false)}>
          Cancelar
        </Botao>
      </div>
    </div>
  );
}
