import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatarBR, type DataISO } from '../dominio/datas';
import { formatar, type Centavos } from '../dominio/dinheiro';
import { calcularReserva, progressoDaMeta } from '../dominio/orcamento';
import { entraNoConsolidado } from '../dominio/saldo';
import {
  atualizarValorDaMeta,
  criarMeta,
  excluirMeta,
  listarMetas,
} from '../dados/orcamentos';
import { montarDadosDaProjecao } from '../dados/projecao';
import { usarContasComSaldo } from '../dados/usarContas';
import { CampoValor } from '../ui/CampoValor';
import { Botao, Campo, Cartao, CartaoIndicador, Dinheiro, ENTRADA, Nota, Pagina, Secao, Vazio } from '../ui/base';

/**
 * Metas e reserva de emergência (§8.8).
 *
 * A reserva é medida em MESES de custo fixo, não em reais: "você tem R$ 8.000"
 * não diz nada; "você tem 3,2 meses cobertos" diz tudo. O denominador é a
 * despesa fixa, porque em emergência real as variáveis são a primeira coisa
 * que se corta.
 */
export function Metas() {
  const [criando, setCriando] = useState(false);
  const contas = usarContasComSaldo();
  const projecao = useQuery({ queryKey: ['projecao'], queryFn: () => montarDadosDaProjecao() });
  const metas = useQuery({ queryKey: ['metas'], queryFn: listarMetas });

  const saldo = (contas.data ?? [])
    .filter(entraNoConsolidado)
    .reduce((total, c) => total + c.saldoAtual, 0);

  // Renda irregular muda a régua da reserva de 3 para 6 meses (§8.8). O sinal
  // aqui é a própria origem da projeção: quem tem salário fixo tem recorrência
  // de receita cadastrada e histórico estável.
  const rendaIrregular = (projecao.data?.renda.origem ?? 'ausente') !== 'historico'
    ? true
    : projecao.data!.renda.pessimista < projecao.data!.renda.otimista;

  const reserva = calcularReserva(saldo, projecao.data?.fixasMensais ?? 0, rendaIrregular);

  return (
    <Pagina
      titulo="Metas"
      subtitulo="Reserva e objetivos"
      acao={
        <Botao aoClicar={() => setCriando((v) => !v)} tipo={criando ? 'secundario' : 'primario'}>
          {criando ? 'Cancelar' : 'Nova meta'}
        </Botao>
      }
    >
      <Secao titulo="Reserva de emergência">
        {reserva.mesesCobertos === null ? (
          <Nota tom="atencao">
            Sem despesas fixas cadastradas, não dá para dizer quantos meses a reserva cobre — e um
            número inventado seria pior que nenhum. Cadastre suas fixas em Mais → Atalhos.
          </Nota>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <CartaoIndicador
                rotulo="Meses de custo fixo cobertos"
                sotaque={reserva.suficiente ? 'verde' : 'ambar'}
                valor={reserva.mesesCobertos.toFixed(1).replace('.', ',')}
                detalhe={`Referência para o seu caso: ${reserva.referencia} meses.`}
              />
              <CartaoIndicador
                rotulo="Custo de vida mínimo"
                sotaque="azul"
                tamanho="medio"
                valor={formatar(reserva.custoFixoMensal)}
                detalhe="Soma das despesas fixas. É o que precisa entrar todo mês para nada atrasar."
              />
            </div>
            <p className="text-xs leading-relaxed text-slate-600">
              O denominador é a despesa fixa, não a total: em emergência real as variáveis são a
              primeira coisa que se corta.
              {rendaIrregular &&
                ' Como sua renda oscila, a referência é 6 meses em vez de 3 — a receita pode sumir por um período inteiro.'}
            </p>
          </>
        )}
      </Secao>

      {criando && <FormularioDeMeta aoTerminar={() => setCriando(false)} />}

      <Secao titulo="Objetivos">
        {(metas.data ?? []).length === 0 ? (
          <Vazio
            titulo="Nenhuma meta cadastrada"
            descricao="Viagem, equipamento, troca de carro. A meta guarda o alvo e o quanto já foi juntado — o progresso é atualizado por você, porque o dinheiro pode estar em qualquer lugar."
            acao={<Botao aoClicar={() => setCriando(true)}>Criar a primeira</Botao>}
          />
        ) : (
          <div className="space-y-2">
            {(metas.data ?? []).map((meta) => (
              <LinhaDaMeta key={meta.id} meta={meta} />
            ))}
          </div>
        )}
      </Secao>
    </Pagina>
  );
}

function LinhaDaMeta({
  meta,
}: {
  meta: { id: string; nome: string; valorAlvo: Centavos; valorAtual: Centavos; prazo: DataISO | null };
}) {
  const cliente = useQueryClient();
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState<Centavos>(meta.valorAtual);

  const progresso = progressoDaMeta(meta.valorAlvo, meta.valorAtual);

  const salvar = useMutation({
    mutationFn: () => atualizarValorDaMeta(meta.id, valor),
    onSuccess: async () => {
      await cliente.invalidateQueries({ queryKey: ['metas'] });
      setEditando(false);
    },
  });

  const remover = useMutation({
    mutationFn: () => excluirMeta(meta.id),
    onSuccess: () => cliente.invalidateQueries({ queryKey: ['metas'] }),
  });

  return (
    <Cartao className="p-4">
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-slate-100">{meta.nome}</p>
          {meta.prazo && (
            <p className="text-xs text-slate-500">até {formatarBR(meta.prazo)}</p>
          )}
        </div>
        <div className="flex shrink-0 gap-3">
          <button
            onClick={() => setEditando((v) => !v)}
            className="text-xs text-slate-500 hover:text-slate-300"
          >
            atualizar
          </button>
          <button
            onClick={() => remover.mutate()}
            className="text-xs text-slate-600 hover:text-red-400"
          >
            excluir
          </button>
        </div>
      </div>

      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-superficie-alta">
        <div
          className={`h-full rounded-full transition-all ${
            progresso.concluida ? 'bg-emerald-500' : 'bg-sky-500'
          }`}
          style={{ width: `${progresso.proporcao * 100}%` }}
        />
      </div>

      <div className="mt-1.5 flex items-baseline justify-between gap-3 text-xs">
        <span className="text-slate-500">
          <Dinheiro centavos={meta.valorAtual} className="text-slate-300" /> de{' '}
          <Dinheiro centavos={meta.valorAlvo} className="text-slate-400" />
        </span>
        <span className={progresso.concluida ? 'text-emerald-400' : 'text-slate-500'}>
          {progresso.concluida
            ? 'concluída'
            : `faltam ${formatar(progresso.falta)}`}
        </span>
      </div>

      {editando && (
        <div className="mt-3 space-y-2 rounded-lg border border-borda-forte bg-superficie-alta p-3">
          <CampoValor valor={valor} aoMudar={setValor} rotulo="Quanto já foi juntado" />
          <div className="flex gap-2">
            <Botao aoClicar={() => salvar.mutate()} desabilitado={salvar.isPending}>
              Salvar
            </Botao>
            <Botao tipo="secundario" aoClicar={() => setEditando(false)}>
              Cancelar
            </Botao>
          </div>
        </div>
      )}
    </Cartao>
  );
}

function FormularioDeMeta({ aoTerminar }: { aoTerminar: () => void }) {
  const cliente = useQueryClient();
  const [nome, setNome] = useState('');
  const [valorAlvo, setValorAlvo] = useState<Centavos>(0);
  const [valorAtual, setValorAtual] = useState<Centavos>(0);
  const [prazo, setPrazo] = useState('');

  const criar = useMutation({
    mutationFn: () =>
      criarMeta({ nome, valorAlvo, valorAtual, prazo: prazo === '' ? null : prazo }),
    onSuccess: async () => {
      await cliente.invalidateQueries({ queryKey: ['metas'] });
      aoTerminar();
    },
  });

  return (
    <Cartao className="space-y-4 p-4">
      <Campo rotulo="Nome">
        <input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Reserva de emergência, viagem, notebook…"
          autoFocus
          className={ENTRADA}
        />
      </Campo>

      <CampoValor valor={valorAlvo} aoMudar={setValorAlvo} rotulo="Quanto quer juntar" />
      <CampoValor valor={valorAtual} aoMudar={setValorAtual} rotulo="Quanto já tem" />

      <Campo rotulo="Prazo (opcional)">
        <input
          type="date"
          value={prazo}
          onChange={(e) => setPrazo(e.target.value)}
          className={ENTRADA}
        />
      </Campo>

      {criar.isError && <p className="text-sm text-red-400">{(criar.error as Error).message}</p>}

      <div className="flex gap-2">
        <Botao
          aoClicar={() => criar.mutate()}
          desabilitado={nome.trim() === '' || valorAlvo <= 0 || criar.isPending}
        >
          Salvar meta
        </Botao>
        <Botao tipo="secundario" aoClicar={aoTerminar}>
          Cancelar
        </Botao>
      </div>
    </Cartao>
  );
}
