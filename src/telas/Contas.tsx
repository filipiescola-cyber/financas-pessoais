import { useState, type FormEvent } from 'react';
import { formatar } from '../dominio/dinheiro';
import type { Centavos } from '../dominio/dinheiro';
import { entraNoConsolidado, rotuloDaContaEmpresa, empresaComSaldoSuspeito } from '../dominio/saldo';
import { CampoValor } from '../ui/CampoValor';
import {
  usarArquivarConta,
  usarContasComSaldo,
  usarCriarConta,
  usarDesarquivarConta,
  usarContas,
} from '../dados/usarContas';
import { ROTULO_TIPO_CONTA, TIPOS_DE_CONTA_CADASTRAVEIS, type TipoDeConta } from '../dados/tipos';

export function Contas() {
  const contas = usarContasComSaldo();
  const arquivadas = usarContas(true);
  const [mostrandoFormulario, setMostrandoFormulario] = useState(false);

  if (contas.isPending) return <p className="p-6 text-slate-400">Carregando contas…</p>;
  if (contas.isError) {
    return <p className="p-6 text-red-400">Erro ao carregar: {(contas.error as Error).message}</p>;
  }

  const lista = contas.data;
  const disponiveis = lista.filter((c) => entraNoConsolidado(c));
  const empresa = lista.find((c) => c.tipo === 'empresa');
  const consolidado = disponiveis.reduce((total, c) => total + c.saldoAtual, 0);
  const inativas = (arquivadas.data ?? []).filter((c) => !c.ativo);

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 pb-24">
      <header className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold text-slate-100">Contas</h1>
        <button
          onClick={() => setMostrandoFormulario((v) => !v)}
          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white"
        >
          {mostrandoFormulario ? 'Cancelar' : 'Nova conta'}
        </button>
      </header>

      {mostrandoFormulario && <FormularioConta aoTerminar={() => setMostrandoFormulario(false)} />}

      {lista.length === 0 && !mostrandoFormulario ? (
        <EstadoVazio aoCriar={() => setMostrandoFormulario(true)} />
      ) : (
        <>
          <section className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <p className="text-sm text-slate-400">Disponível para gastar</p>
            <p className="dinheiro mt-1 text-3xl font-semibold text-slate-100">{formatar(consolidado)}</p>
            <p className="mt-2 text-xs text-slate-500">
              Soma de conta corrente, poupança, carteira e investimento. Não inclui a conta Empresa,
              dívidas nem faturas de cartão.
            </p>
          </section>

          <section className="space-y-2">
            {disponiveis.map((conta) => (
              <LinhaDeConta
                key={conta.id}
                nome={conta.nome}
                detalhe={
                  conta.instituicao
                    ? `${ROTULO_TIPO_CONTA[conta.tipo]} · ${conta.instituicao}`
                    : ROTULO_TIPO_CONTA[conta.tipo]
                }
                valor={conta.saldoAtual}
                id={conta.id}
              />
            ))}
          </section>

          {empresa && <BlocoEmpresa nome={empresa.nome} saldo={empresa.saldoAtual} />}
        </>
      )}

      {inativas.length > 0 && <BlocoArquivadas contas={inativas} />}
    </div>
  );
}

function EstadoVazio({ aoCriar }: { aoCriar: () => void }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-700 p-8 text-center">
      <p className="text-slate-300">Nenhuma conta cadastrada ainda.</p>
      <p className="mt-2 text-sm text-slate-500">
        Comece pela conta onde o salário cai. A carteira e a conta Empresa vêm depois, se fizerem
        sentido para você.
      </p>
      <button
        onClick={aoCriar}
        className="mt-4 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white"
      >
        Cadastrar a primeira
      </button>
    </div>
  );
}

function LinhaDeConta({
  nome,
  detalhe,
  valor,
  id,
}: {
  nome: string;
  detalhe: string;
  valor: Centavos;
  id: string;
}) {
  const arquivar = usarArquivarConta();

  return (
    <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900 px-4 py-3">
      <div className="min-w-0">
        <p className="truncate text-slate-100">{nome}</p>
        <p className="truncate text-xs text-slate-500">{detalhe}</p>
      </div>
      <div className="flex items-center gap-3">
        <span className={`dinheiro ${valor < 0 ? 'text-red-400' : 'text-slate-100'}`}>{formatar(valor)}</span>
        <button
          onClick={() => arquivar.mutate(id)}
          disabled={arquivar.isPending}
          title="Arquivar — o histórico é preservado"
          className="text-xs text-slate-500 hover:text-slate-300"
        >
          arquivar
        </button>
      </div>
    </div>
  );
}

/**
 * A conta Empresa em bloco próprio (§2.6). Três regras de interface aqui:
 * nunca a palavra "Saldo", nunca verde, e fora do consolidado — um número
 * subindo aqui parece boa notícia e significa o contrário.
 */
function BlocoEmpresa({ nome, saldo }: { nome: string; saldo: Centavos }) {
  const suspeito = empresaComSaldoSuspeito(saldo);

  return (
    <section className="rounded-xl border border-slate-700 bg-slate-900/60 p-4">
      <p className="text-sm text-slate-400">{nome}</p>
      <p className="mt-1 text-sm text-slate-400">{rotuloDaContaEmpresa(saldo)}</p>
      <p className="dinheiro mt-1 text-2xl font-semibold text-slate-200">{formatar(saldo === 0 ? 0 : Math.abs(saldo))}</p>
      <p className="mt-2 text-xs text-slate-500">
        Dinheiro seu parado dentro do negócio. É recebível, não caixa — por isso não entra no
        disponível para gastar.
      </p>
      {suspeito && (
        <p className="mt-2 rounded-md border border-amber-700/50 bg-amber-950/40 px-3 py-2 text-xs text-amber-300">
          Saldo negativo aqui quase sempre é erro de lançamento: pró-labore marcado como devolução
          de aporte. Pró-labore é receita e não reduz esta conta.
        </p>
      )}
    </section>
  );
}

function BlocoArquivadas({ contas }: { contas: { id: string; nome: string; tipo: TipoDeConta }[] }) {
  const desarquivar = usarDesarquivarConta();

  return (
    <section className="space-y-2">
      <h2 className="text-sm text-slate-500">Arquivadas</h2>
      {contas.map((conta) => (
        <div
          key={conta.id}
          className="flex items-center justify-between rounded-lg border border-slate-800/60 px-4 py-2"
        >
          <span className="text-sm text-slate-500">
            {conta.nome} · {ROTULO_TIPO_CONTA[conta.tipo]}
          </span>
          <button
            onClick={() => desarquivar.mutate(conta.id)}
            className="text-xs text-slate-500 hover:text-slate-300"
          >
            reativar
          </button>
        </div>
      ))}
      <p className="text-xs text-slate-600">
        Conta arquivada some dos seletores e do saldo, mas continua nos relatórios dos meses
        fechados.
      </p>
    </section>
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
    <form
      onSubmit={aoEnviar}
      className="space-y-4 rounded-xl border border-slate-800 bg-slate-900 p-4"
    >
      <div>
        <label className="mb-1 block text-sm text-slate-400">Nome</label>
        <input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Conta corrente, Carteira, Empresa…"
          autoFocus
          className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100 outline-none focus:border-slate-500"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm text-slate-400">Tipo</label>
        <div className="flex flex-wrap gap-2">
          {TIPOS_DE_CONTA_CADASTRAVEIS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTipo(t)}
              className={`rounded-full px-3 py-1.5 text-sm ${
                tipo === t
                  ? 'bg-emerald-600 text-white'
                  : 'border border-slate-700 text-slate-300 hover:border-slate-500'
              }`}
            >
              {ROTULO_TIPO_CONTA[t]}
            </button>
          ))}
        </div>
        {tipo === 'empresa' && (
          <p className="mt-2 text-xs text-slate-500">
            Conta de fronteira com o negócio (§2.6). Aporte é transferência, não despesa. Só pode
            existir uma.
          </p>
        )}
        {tipo === 'carteira' && (
          <p className="mt-2 text-xs text-slate-500">
            Dinheiro físico. Não vale caçar cada R$ 5 — o acerto é a contagem mensal.
          </p>
        )}
      </div>

      <div>
        <label className="mb-1 block text-sm text-slate-400">Instituição (opcional)</label>
        <input
          value={instituicao}
          onChange={(e) => setInstituicao(e.target.value)}
          className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100 outline-none focus:border-slate-500"
        />
      </div>

      <CampoValor valor={saldoInicial} aoMudar={setSaldoInicial} rotulo="Saldo inicial" />
      <p className="-mt-2 text-xs text-slate-500">
        O saldo do dia 1º deste mês, não o de hoje. Começar no dia 1º entrega um mês fechado de
        verdade já na primeira virada (§4.1).
      </p>

      {criar.isError && <p className="text-sm text-red-400">{(criar.error as Error).message}</p>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={criar.isPending || nome.trim() === ''}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {criar.isPending ? 'Salvando…' : 'Salvar'}
        </button>
        <button
          type="button"
          onClick={aoTerminar}
          className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
