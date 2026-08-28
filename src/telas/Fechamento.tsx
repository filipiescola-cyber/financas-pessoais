import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { formatarBR, hoje, primeiroDiaDoMes, somarMeses, ultimoDiaDoMes, type DataISO } from '../dominio/datas';
import { formatar } from '../dominio/dinheiro';
import {
  despesaPorNatureza,
  totalDeDespesas,
  totalDeReceitas,
  type TransacaoDeRelatorio,
} from '../dominio/relatorios';
import { copiarOrcamentoDoMesAnterior } from '../dados/orcamentos';
import { baixarArquivo, exportarTudo, nomeDoArquivo } from '../dados/exportar';
import { usarContasComSaldo } from '../dados/usarContas';
import { naturezaEfetiva } from '../dominio/natureza';
import { usarCategorias, usarTransacoes } from '../dados/usarTransacoes';
import { usarAviso } from '../ui/Aviso';
import { Botao, Cartao, CartaoIndicador, Dinheiro, Nota, Pagina, Secao } from '../ui/base';

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

function nomeDoMes(data: DataISO): string {
  return `${MESES[Number(data.split('-')[1]) - 1]} de ${data.slice(0, 4)}`;
}

/**
 * Fechamento mensal (§8.7).
 *
 * "Ritual de 10 minutos, uma vez por mês. É o que mantém o app vivo depois que
 * o entusiasmo inicial passa. Sem esse ritual o app vira projeto abandonado no
 * mês 4."
 *
 * A tela é uma lista de passos, não um relatório: o objetivo é terminar, não
 * contemplar. Cada passo aponta para onde resolver e volta para cá.
 */
export function Fechamento() {
  const { mostrar } = usarAviso();
  const cliente = useQueryClient();

  // Fecha-se o mês ANTERIOR, não o corrente: o mês em curso ainda vai mudar.
  const mesFechado = primeiroDiaDoMes(somarMeses(hoje(), -1));
  const mesNovo = primeiroDiaDoMes(hoje());

  const [feitos, setFeitos] = useState<Set<string>>(new Set());
  const marcar = (passo: string) =>
    setFeitos((atual) => {
      const proximo = new Set(atual);
      proximo.has(passo) ? proximo.delete(passo) : proximo.add(passo);
      return proximo;
    });

  const contas = usarContasComSaldo();
  const categorias = usarCategorias(true);
  const doMes = usarTransacoes({ de: mesFechado, ate: ultimoDiaDoMes(mesFechado) });

  const naturezaDaCategoria = new Map((categorias.data ?? []).map((c) => [c.id, c.natureza]));

  const paraRelatorio: TransacaoDeRelatorio[] = (doMes.data ?? []).map((t) => ({
    valor: t.valor,
    tipo: t.tipo,
    dataCompetencia: t.dataCompetencia,
    categoriaId: t.categoriaId,
    natureza: naturezaEfetiva(t, {
      natureza: t.categoriaId ? (naturezaDaCategoria.get(t.categoriaId) ?? null) : null,
    }),
    transacaoPaiId: t.transacaoPaiId,
    temFilhas: false,
  }));

  const receitas = totalDeReceitas(paraRelatorio);
  const despesas = totalDeDespesas(paraRelatorio);
  const natureza = despesaPorNatureza(paraRelatorio);

  const semCategoria = (doMes.data ?? []).filter(
    (t) => t.categoriaId === null && t.tipo !== 'transferencia',
  );

  const semConferencia = (contas.data ?? []).filter(
    (c) =>
      ['corrente', 'poupanca', 'carteira'].includes(c.tipo) &&
      (c.dataConferencia === null || c.dataConferencia < mesFechado),
  );

  const copiarOrcamento = useMutation({
    mutationFn: () => copiarOrcamentoDoMesAnterior(mesNovo, mesFechado),
    onSuccess: async (quantidade) => {
      await cliente.invalidateQueries({ queryKey: ['orcamentos'] });
      marcar('orcamento');
      mostrar(
        quantidade > 0
          ? `${quantidade} teto(s) copiado(s) para ${nomeDoMes(mesNovo)}.`
          : 'Não havia teto definido no mês anterior.',
      );
    },
  });

  const backup = useMutation({
    mutationFn: exportarTudo,
    onSuccess: (dados) => {
      baixarArquivo(nomeDoArquivo('json'), JSON.stringify(dados, null, 2), 'application/json');
      marcar('backup');
      mostrar('Backup baixado.');
    },
  });

  const sobra = receitas - despesas;

  return (
    <Pagina titulo="Fechamento mensal" subtitulo={nomeDoMes(mesFechado)}>
      <Nota>
        Dez minutos, uma vez por mês. É o ritual que mantém o app vivo depois que o entusiasmo
        inicial passa — e o passo que mais decide se o projeto sobrevive ao mês 4.
      </Nota>

      <Passo
        numero={1}
        titulo="Conferir os saldos"
        feito={feitos.has('conferencia') || semConferencia.length === 0}
        aoMarcar={() => marcar('conferencia')}
      >
        {semConferencia.length === 0 ? (
          <p className="text-sm text-slate-400">Todas as contas já foram conferidas neste ciclo.</p>
        ) : (
          <>
            <p className="text-sm text-slate-400">
              {semConferencia.length} conta(s) sem conferência desde {nomeDoMes(mesFechado)}:{' '}
              {semConferencia.map((c) => c.nome).join(', ')}.
            </p>
            <Link to="/conferencia">
              <Botao tipo="secundario">Ir para a conferência</Botao>
            </Link>
          </>
        )}
      </Passo>

      <Passo
        numero={2}
        titulo="Revisar o que ficou sem categoria"
        feito={feitos.has('categorias') || semCategoria.length === 0}
        aoMarcar={() => marcar('categorias')}
      >
        {semCategoria.length === 0 ? (
          <p className="text-sm text-slate-400">Nada sem categoria no mês. </p>
        ) : (
          <>
            <p className="text-sm text-slate-400">
              {semCategoria.length} lançamento(s) sem categoria. Eles somem do relatório por
              categoria — e é justamente esse relatório que mostra onde dá para cortar.
            </p>
            <ul className="space-y-1 text-xs text-slate-500">
              {semCategoria.slice(0, 5).map((t) => (
                <li key={t.id} className="flex justify-between gap-3">
                  <span className="truncate">
                    {formatarBR(t.dataCompetencia)} · {t.descricao || 'sem descrição'}
                  </span>
                  <Dinheiro centavos={t.valor} className="shrink-0" />
                </li>
              ))}
              {semCategoria.length > 5 && <li>e mais {semCategoria.length - 5}…</li>}
            </ul>
            <Link to="/transacoes">
              <Botao tipo="secundario">Ir para os lançamentos</Botao>
            </Link>
          </>
        )}
      </Passo>

      <Passo
        numero={3}
        titulo={`Como foi ${nomeDoMes(mesFechado)}`}
        feito={feitos.has('resumo')}
        aoMarcar={() => marcar('resumo')}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <CartaoIndicador rotulo="Entrou" sotaque="verde" tamanho="medio" valor={formatar(receitas)} />
          <CartaoIndicador rotulo="Saiu" sotaque="ambar" tamanho="medio" valor={formatar(despesas)} />
        </div>

        <p className={`text-sm ${sobra < 0 ? 'text-amber-300' : 'text-slate-300'}`}>
          {sobra >= 0
            ? `Sobrou ${formatar(sobra)}.`
            : `Faltou ${formatar(Math.abs(sobra))} — o mês fechou no vermelho.`}
        </p>

        <div className="grid gap-2 text-xs text-slate-500 sm:grid-cols-3">
          <span>fixas {formatar(natureza.fixa)}</span>
          <span>variáveis {formatar(natureza.variavel)}</span>
          <span>eventuais {formatar(natureza.eventual)}</span>
        </div>

        <p className="text-xs leading-relaxed text-slate-600">
          As fixas são o seu custo de vida mínimo. As variáveis são onde dá para cortar. As
          eventuais precisam de provisão, não de corte.
        </p>

        <Link to="/relatorios">
          <Botao tipo="secundario">Ver relatório completo</Botao>
        </Link>
      </Passo>

      <Passo
        numero={4}
        titulo={`Preparar ${nomeDoMes(mesNovo)}`}
        feito={feitos.has('orcamento')}
        aoMarcar={() => marcar('orcamento')}
      >
        <p className="text-sm text-slate-400">
          Copiar os tetos do mês anterior evita redigitar tudo. Depois é só ajustar o que mudou.
        </p>
        <div className="flex flex-wrap gap-2">
          <Botao
            tipo="secundario"
            aoClicar={() => copiarOrcamento.mutate()}
            desabilitado={copiarOrcamento.isPending}
          >
            {copiarOrcamento.isPending ? 'Copiando…' : 'Copiar orçamento do mês anterior'}
          </Botao>
          <Link to="/orcamento">
            <Botao tipo="secundario">Ajustar tetos</Botao>
          </Link>
        </div>
      </Passo>

      <Passo
        numero={5}
        titulo="Backup"
        feito={feitos.has('backup')}
        aoMarcar={() => marcar('backup')}
      >
        <p className="text-sm text-slate-400">
          Um arquivo por mês, guardado fora do computador. É o que separa "perdi o histórico" de
          "perdi um mês".
        </p>
        <Botao tipo="secundario" aoClicar={() => backup.mutate()} desabilitado={backup.isPending}>
          {backup.isPending ? 'Exportando…' : 'Baixar backup em JSON'}
        </Botao>
      </Passo>

      {feitos.size >= 4 && (
        <Nota tom="positivo">
          Fechamento concluído. O próximo é no dia 1º do mês que vem — e é a repetição disso que
          mantém o app confiável.
        </Nota>
      )}
    </Pagina>
  );
}

function Passo({
  numero,
  titulo,
  feito,
  aoMarcar,
  children,
}: {
  numero: number;
  titulo: string;
  feito: boolean;
  aoMarcar: () => void;
  children: React.ReactNode;
}) {
  return (
    <Secao>
      <Cartao className={`p-4 ${feito ? 'opacity-70' : ''}`}>
        <div className="flex items-start gap-3">
          <button
            onClick={aoMarcar}
            aria-pressed={feito}
            className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs transition ${
              feito
                ? 'border-emerald-600 bg-emerald-600 text-white'
                : 'border-borda-forte text-slate-500'
            }`}
          >
            {feito ? '✓' : numero}
          </button>
          <div className="min-w-0 flex-1 space-y-3">
            <h2 className={`font-medium ${feito ? 'text-slate-400 line-through' : 'text-slate-100'}`}>
              {titulo}
            </h2>
            {!feito && children}
          </div>
        </div>
      </Cartao>
    </Secao>
  );
}
