import { useState, type FormEvent } from 'react';
import { hoje } from '../dominio/datas';
import { formatar, type Centavos } from '../dominio/dinheiro';
import { descreverFatura, ehDiaValido, faturaDeReferencia } from '../dominio/fatura';
import { CampoValor } from '../ui/CampoValor';
import {
  usarArquivarCartao,
  usarCartoes,
  usarCriarCartao,
  usarDesarquivarCartao,
} from '../dados/usarCartoes';

export function Cartoes() {
  const cartoes = usarCartoes(true);
  const [mostrandoFormulario, setMostrandoFormulario] = useState(false);

  if (cartoes.isPending) return <p className="p-6 text-slate-400">Carregando cartões…</p>;
  if (cartoes.isError) {
    return <p className="p-6 text-red-400">Erro ao carregar: {(cartoes.error as Error).message}</p>;
  }

  const ativos = cartoes.data.filter((c) => c.conta.ativo);
  const arquivados = cartoes.data.filter((c) => !c.conta.ativo);

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 pb-24">
      <header className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold text-slate-100">Cartões</h1>
        <button
          onClick={() => setMostrandoFormulario((v) => !v)}
          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white"
        >
          {mostrandoFormulario ? 'Cancelar' : 'Novo cartão'}
        </button>
      </header>

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
                <div className="min-w-0">
                  <p className="truncate text-slate-100">{cartao.conta.nome}</p>
                  <p className="text-xs text-slate-500">
                    Fecha dia {cartao.diaFechamento} · vence dia {cartao.diaVencimento}
                    {cartao.limite !== null && ` · limite ${formatar(cartao.limite)}`}
                  </p>
                </div>
                <ArquivarCartao contaId={cartao.contaId} />
              </div>
              <p className="mt-3 rounded-md bg-superficie-alta px-3 py-2 text-xs text-slate-300">
                {descreverFatura(fatura)}
              </p>
            </article>
          );
        })}
      </section>

      <p className="rounded-lg border border-borda px-4 py-3 text-xs text-slate-500">
        As faturas ainda não são geradas: agrupamento, fechamento e pagamento são a Fase 2. Até lá,
        uma compra no cartão é lançada e aparece normalmente na lista, só não fica agrupada em
        fatura.
      </p>

      {arquivados.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm text-slate-500">Arquivados</h2>
          {arquivados.map((cartao) => (
            <DesarquivarCartao
              key={cartao.contaId}
              contaId={cartao.contaId}
              nome={cartao.conta.nome}
            />
          ))}
        </section>
      )}
    </div>
  );
}

function ArquivarCartao({ contaId }: { contaId: string }) {
  const arquivar = usarArquivarCartao();
  return (
    <button
      onClick={() => arquivar.mutate(contaId)}
      disabled={arquivar.isPending}
      className="shrink-0 text-xs text-slate-500 hover:text-slate-300"
    >
      arquivar
    </button>
  );
}

function DesarquivarCartao({ contaId, nome }: { contaId: string; nome: string }) {
  const desarquivar = usarDesarquivarCartao();
  return (
    <div className="flex items-center justify-between rounded-lg border border-borda px-4 py-2">
      <span className="text-sm text-slate-500">{nome}</span>
      <button
        onClick={() => desarquivar.mutate(contaId)}
        className="text-xs text-slate-500 hover:text-slate-300"
      >
        reativar
      </button>
    </div>
  );
}

function FormularioCartao({ aoTerminar }: { aoTerminar: () => void }) {
  const criar = usarCriarCartao();
  const [nome, setNome] = useState('');
  const [instituicao, setInstituicao] = useState('');
  const [limite, setLimite] = useState<Centavos>(0);
  const [diaFechamento, setDiaFechamento] = useState('');
  const [diaVencimento, setDiaVencimento] = useState('');

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
      limite: limite === 0 ? null : limite,
      diaFechamento: fechamento,
      diaVencimento: vencimento,
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

      <div>
        <label className="mb-1 block text-sm text-slate-400">Instituição (opcional)</label>
        <input
          value={instituicao}
          onChange={(e) => setInstituicao(e.target.value)}
          className="w-full rounded-lg border border-borda-forte bg-superficie-alta px-3 py-2 text-slate-100 outline-none focus:border-slate-500"
        />
      </div>

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
