import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { formatar, type Centavos } from '../dominio/dinheiro';
import {
  completarUltimaParte,
  distribuirIgualmente,
  situacaoDaDivisao,
  type MotivoDaEmpresa,
  type ParteDaDivisao,
} from '../dominio/divisao';
import {
  desfazerDivisao,
  dividirTransacao,
  filhasDe,
  type Transacao,
} from '../dados/transacoes';
import { usarCategorias } from '../dados/usarTransacoes';
import { usarInvalidarTransacoes } from '../dados/usarInvalidacao';
import { usarAviso } from '../ui/Aviso';
import { CampoValor } from './CampoValor';
import { Botao, Chip, ENTRADA, Nota } from './base';

/**
 * Os motivos que cabem numa compra dividida (§2.6).
 *
 * `devolucao` fica de fora de propósito: ela é a empresa te pagando de volta,
 * e isso não é pedaço de uma compra que VOCÊ fez. Oferecê-la aqui convidaria a
 * marcar um aporte como devolução — o erro que o §2.6 chama de "achar que
 * recuperou o aporte quando só recebeu salário".
 */
const MOTIVOS: { valor: MotivoDaEmpresa; rotulo: string; ajuda: string }[] = [
  {
    valor: 'investimento',
    rotulo: 'Investimento',
    ajuda: 'Equipamento, ferramenta. Normal e esperado — amortiza ao longo de meses.',
  },
  {
    valor: 'giro',
    rotulo: 'Giro',
    ajuda: 'Filamento, embalagem, insumo. Deveria voltar em semanas, via vendas.',
  },
  {
    valor: 'subsidio',
    rotulo: 'Subsídio',
    ajuda: 'Conta operacional que a empresa não cobre. Se repetir, o negócio não se paga.',
  },
];

const PARTE_VAZIA: ParteDaDivisao = {
  valor: 0,
  categoriaId: null,
  descricao: '',
  motivoEmpresa: null,
};

/**
 * Divisão de transação (§5.5).
 *
 * Uma compra, mais de uma categoria. O caso que o §5.5 cita é o mercado onde
 * metade é comida e metade é embalagem da empresa.
 *
 * A tela abre já com a compra partida ao meio, porque é o que quase sempre se
 * quer: dois pedaços, e um deles ajustado. Digitar o primeiro valor e apertar
 * "completar" resolve o resto — a sobra vai na última parte, que é a regra do
 * §13.1 e não uma escolha desta tela.
 *
 * O saldo não se mexe em momento nenhum. Dividir é dizer melhor o que já
 * aconteceu, não lançar de novo.
 */
export function DivisaoDeTransacao({
  transacao,
  aoTerminar,
}: {
  transacao: Transacao;
  aoTerminar: () => void;
}) {
  const invalidar = usarInvalidarTransacoes();
  const { mostrar } = usarAviso();
  const categorias = usarCategorias();

  const jaDivididas = useQuery({
    queryKey: ['filhas-da-transacao', transacao.id],
    queryFn: () => filhasDe(transacao.id),
  });

  const total = Math.abs(transacao.valor);

  const [partes, setPartes] = useState<ParteDaDivisao[] | null>(null);

  const existentes = jaDivididas.data ?? [];

  const inicial: ParteDaDivisao[] =
    existentes.length > 0
      ? existentes.map((filha) => ({
          valor: Math.abs(filha.valor),
          categoriaId: filha.categoriaId,
          descricao: filha.descricao ?? '',
          motivoEmpresa: (filha.motivoEmpresa as MotivoDaEmpresa | null) ?? null,
        }))
      : distribuirIgualmente(total, 2).map((valor) => ({
          ...PARTE_VAZIA,
          valor,
          categoriaId: transacao.categoriaId,
        }));

  const atual = partes ?? inicial;
  const situacao = situacaoDaDivisao(transacao.valor, atual);

  function mudar(indice: number, mudanca: Partial<ParteDaDivisao>) {
    setPartes(atual.map((parte, i) => (i === indice ? { ...parte, ...mudanca } : parte)));
  }

  const doTipo = (categorias.data ?? []).filter(
    (c) => c.tipo === (transacao.tipo === 'receita' ? 'receita' : 'despesa'),
  );

  const salvar = useMutation({
    mutationFn: () => dividirTransacao({ pai: transacao, partes: atual }),
    onSuccess: async () => {
      await invalidar();
      mostrar(`Dividido em ${atual.length} partes.`);
      aoTerminar();
    },
  });

  const desfazer = useMutation({
    mutationFn: () => desfazerDivisao(transacao.id),
    onSuccess: async () => {
      await invalidar();
      mostrar('Divisão desfeita. O lançamento voltou a ser uma linha só.');
      aoTerminar();
    },
  });

  /*
    O aguarde vem DEPOIS de todos os hooks, e não antes.

    Sair mais cedo pularia os `useMutation` daqui de baixo, e aí a contagem de
    hooks mudaria entre um render e o seguinte — o React derruba o componente
    com "rendered more hooks than during the previous render". É uma das
    poucas regras do React que quebram em produção e passam no teste de tipo.

    Enquanto as partes existentes não chegam não há o que editar: começar do
    meio a meio e sobrescrever depois faria o formulário piscar com números que
    ninguém digitou.
  */
  if (jaDivididas.isPending) {
    return <p className="mt-3 text-xs text-slate-500">Carregando as partes…</p>;
  }

  return (
    <div className="mt-3 space-y-4 rounded-lg border border-borda-forte bg-superficie-alta p-3">
      <div>
        <h3 className="text-sm font-medium text-slate-100">Dividir em categorias</h3>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">
          O saldo não se mexe: {formatar(total)} saiu da conta uma vez só, e continua saindo. A
          divisão só diz em que categorias esse dinheiro foi parar — é ela que os relatórios usam.
        </p>
      </div>

      <div className="space-y-3">
        {atual.map((parte, indice) => (
          <div key={indice} className="space-y-2 rounded-md border border-borda p-3">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xs uppercase tracking-wide text-slate-600">
                Parte {indice + 1}
              </span>
              {atual.length > 2 && (
                <button
                  onClick={() => setPartes(atual.filter((_, i) => i !== indice))}
                  className="text-xs text-slate-600 transition hover:text-red-400"
                >
                  Remover
                </button>
              )}
            </div>

            <CampoValor
              valor={parte.valor}
              aoMudar={(valor) => mudar(indice, { valor })}
              rotulo="Quanto desta parte"
            />

            <div className="flex flex-wrap gap-1.5">
              {doTipo.map((categoria) => (
                <Chip
                  key={categoria.id}
                  ativo={parte.categoriaId === categoria.id}
                  aoClicar={() =>
                    mudar(indice, {
                      categoriaId: parte.categoriaId === categoria.id ? null : categoria.id,
                      // Categoria e empresa são respostas para a mesma pergunta:
                      // onde este dinheiro foi parar. Marcar uma limpa a outra.
                      motivoEmpresa: null,
                    })
                  }
                >
                  {categoria.nome}
                </Chip>
              ))}
            </div>

            <input
              value={parte.descricao}
              onChange={(e) => mudar(indice, { descricao: e.target.value })}
              placeholder="Descrição desta parte (opcional)"
              className={ENTRADA}
            />

            <div className="border-t border-borda pt-2">
              <span className="text-xs text-slate-500">Esta parte é da empresa? (§2.6)</span>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <Chip
                  ativo={parte.motivoEmpresa === null}
                  aoClicar={() => mudar(indice, { motivoEmpresa: null })}
                >
                  Não, é minha
                </Chip>
                {MOTIVOS.map((motivo) => (
                  <Chip
                    key={motivo.valor}
                    ativo={parte.motivoEmpresa === motivo.valor}
                    aoClicar={() =>
                      mudar(indice, { motivoEmpresa: motivo.valor, categoriaId: null })
                    }
                  >
                    {motivo.rotulo}
                  </Chip>
                ))}
              </div>
              {parte.motivoEmpresa !== null && (
                <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
                  {MOTIVOS.find((m) => m.valor === parte.motivoEmpresa)?.ajuda} Esta parte não conta
                  como despesa sua: ela vira transferência e aumenta o que a empresa te deve.
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setPartes([...atual, { ...PARTE_VAZIA }])}
          className="text-xs text-slate-500 transition hover:text-slate-300"
        >
          Mais uma parte
        </button>
        {!situacao.fecha && (
          <button
            onClick={() => setPartes(completarUltimaParte(transacao.valor, atual))}
            className="text-xs text-emerald-500 transition hover:text-emerald-400"
          >
            Jogar o resto na última
          </button>
        )}
      </div>

      {/* A SOBRA, e não o alocado: "faltam R$ 12,40" diz o que fazer;
          "R$ 67,60 de R$ 80,00" faz a pessoa subtrair de cabeça. */}
      <div
        className={`flex items-baseline justify-between rounded-md border px-3 py-2 text-sm ${
          situacao.fecha
            ? 'border-emerald-900/50 bg-emerald-950/20 text-emerald-300'
            : 'border-amber-900/50 bg-amber-950/20 text-amber-300'
        }`}
      >
        <span className="text-xs">
          {situacao.fecha
            ? 'As partes somam o lançamento'
            : situacao.sobra > 0
              ? 'Ainda falta distribuir'
              : 'As partes passam do lançamento'}
        </span>
        <span className="numero dinheiro">
          {situacao.fecha ? formatar(situacao.total) : formatar(Math.abs(situacao.sobra))}
        </span>
      </div>

      {existentes.length > 0 && (
        <Nota>
          Este lançamento já está dividido em {existentes.length} partes. Salvar substitui as
          atuais — somar por cima dobraria a compra no relatório por categoria.
        </Nota>
      )}

      <div className="flex flex-wrap gap-2">
        <Botao
          aoClicar={() => salvar.mutate()}
          desabilitado={situacao.impedimento !== null || salvar.isPending}
        >
          {salvar.isPending ? 'Salvando…' : 'Salvar divisão'}
        </Botao>
        <Botao tipo="secundario" aoClicar={aoTerminar}>
          Cancelar
        </Botao>
        {existentes.length > 0 && (
          <button
            onClick={() => desfazer.mutate()}
            disabled={desfazer.isPending}
            className="text-xs text-slate-600 transition hover:text-red-400"
          >
            Desfazer divisão
          </button>
        )}
      </div>

      {situacao.impedimento !== null && (
        <p className="text-xs text-slate-500">{situacao.impedimento}</p>
      )}
    </div>
  );
}

/** Uma parte, como ela aparece embaixo do lançamento na lista. */
export function ParteNaLista({
  descricao,
  categoria,
  valor,
  daEmpresa,
}: {
  descricao: string | null;
  categoria: string | null;
  valor: Centavos;
  daEmpresa: boolean;
}) {
  return (
    <li className="flex items-baseline justify-between gap-3 text-xs">
      <span className="min-w-0 truncate text-slate-500">
        {categoria ?? (daEmpresa ? 'Empresa' : 'Sem categoria')}
        {descricao ? <span className="text-slate-600"> · {descricao}</span> : null}
      </span>
      <span className="numero dinheiro shrink-0 text-slate-500">
        {formatar(Math.abs(valor))}
      </span>
    </li>
  );
}
