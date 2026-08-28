import { useState } from 'react';
import { formatarBR, hoje, primeiroDiaDoMes, somarMeses, ultimoDiaDoMes, type DataISO } from '../dominio/datas';
import { formatar } from '../dominio/dinheiro';
import {
  despesaPorNatureza,
  evolucaoMensal,
  gastoPorCategoria,
  mesesComMovimento,
  totalDeDespesas,
  totalDeReceitas,
  type TransacaoDeRelatorio,
} from '../dominio/relatorios';
import { naturezaEfetiva } from '../dominio/natureza';
import { usarCategorias, usarTransacoes } from '../dados/usarTransacoes';
import { BarrasHorizontais, ColunasAgrupadas, COR_ENTRADA, COR_SAIDA } from '../ui/graficos';
import { Botao, Cartao, CartaoIndicador, Dinheiro, Nota, Pagina, Secao, Vazio } from '../ui/base';
import { IconeDeCategoria } from '../ui/iconesDeCategoria';

const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

const JANELA_EM_MESES = 6;

/**
 * Relatórios (§11). Consolidações em cima de dados que já existem.
 *
 * O §13.5 é explícito: relatório sem histórico mostra "precisa de pelo menos um
 * mês fechado", não um gráfico vazio. Gráfico zerado parece defeito e ensina o
 * usuário a ignorar a tela.
 */
export function Relatorios() {
  const [mes, setMes] = useState<DataISO>(primeiroDiaDoMes(hoje()));
  const [verTabela, setVerTabela] = useState(false);

  const categorias = usarCategorias(true);

  // A janela inteira de uma vez: o gráfico de evolução precisa dela, e o mês
  // selecionado é um recorte do que já está em memória.
  const inicioDaJanela = primeiroDiaDoMes(somarMeses(mes, -(JANELA_EM_MESES - 1)));
  const consulta = usarTransacoes({ de: inicioDaJanela, ate: ultimoDiaDoMes(mes) });

  const nomeCategoria = new Map((categorias.data ?? []).map((c) => [c.id, c.nome]));
  const porId = new Map((categorias.data ?? []).map((c) => [c.id, c]));
  const naturezaCategoria = new Map((categorias.data ?? []).map((c) => [c.id, c.natureza]));

  // Quem tem filha cede o lugar a ela no relatório por categoria (§5.5). Isso é
  // derivado da própria lista: filha aponta para o pai por transacao_pai_id.
  const paisComFilhas = new Set(
    (consulta.data ?? []).map((t) => t.transacaoPaiId).filter((id): id is string => id !== null),
  );

  const paraRelatorio: TransacaoDeRelatorio[] = (consulta.data ?? []).map((t) => ({
    valor: t.valor,
    tipo: t.tipo,
    dataCompetencia: t.dataCompetencia,
    categoriaId: t.categoriaId,
    // A da transação vence a da categoria (§2.5): mercado é variável, mas a
    // compra da viagem pode ser eventual.
    natureza: naturezaEfetiva(t, {
      natureza: t.categoriaId ? (naturezaCategoria.get(t.categoriaId) ?? null) : null,
    }),
    transacaoPaiId: t.transacaoPaiId,
    temFilhas: paisComFilhas.has(t.id),
  }));

  const doMes = paraRelatorio.filter(
    (t) => t.dataCompetencia >= mes && t.dataCompetencia <= ultimoDiaDoMes(mes),
  );

  const receitas = totalDeReceitas(doMes);
  const despesas = totalDeDespesas(doMes);
  const natureza = despesaPorNatureza(doMes);
  const porCategoria = gastoPorCategoria(doMes);
  const evolucao = evolucaoMensal(paraRelatorio, mes, JANELA_EM_MESES);
  const historico = mesesComMovimento(paraRelatorio);

  const nomeDoMes = `${MESES[Number(mes.split('-')[1]) - 1]} de ${mes.slice(0, 4)}`;

  if (consulta.isPending) {
    return (
      <Pagina titulo="Relatórios">
        <p className="text-slate-400">Carregando…</p>
      </Pagina>
    );
  }

  if (historico === 0) {
    return (
      <Pagina titulo="Relatórios" subtitulo={nomeDoMes}>
        <Vazio
          titulo="Ainda não há o que relatar"
          descricao="Relatório precisa de pelo menos um mês com movimento. Um gráfico zerado pareceria defeito, então ele não é desenhado."
        />
      </Pagina>
    );
  }

  return (
    <Pagina
      titulo="Relatórios"
      subtitulo={nomeDoMes}
      acao={
        <div className="flex items-center gap-1">
          <Botao tipo="secundario" aoClicar={() => setMes(somarMeses(mes, -1))} className="px-3">
            ‹
          </Botao>
          <Botao tipo="secundario" aoClicar={() => setMes(somarMeses(mes, 1))} className="px-3">
            ›
          </Botao>
        </div>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <CartaoIndicador rotulo="Entrou no mês" sotaque="verde" valor={formatar(receitas)} />
        <CartaoIndicador rotulo="Saiu no mês" sotaque="ambar" valor={formatar(despesas)} />
      </div>

      {/* §2.5: os três blocos separados, NUNCA um total único de despesa. */}
      <Secao titulo="Para onde foi, por natureza">
        <div className="grid gap-3 sm:grid-cols-3">
          <CartaoIndicador
            rotulo="Fixa"
            sotaque="azul"
            tamanho="medio"
            valor={formatar(natureza.fixa)}
            detalhe="Custo de vida mínimo: o que precisa entrar todo mês para nada atrasar."
          />
          <CartaoIndicador
            rotulo="Variável"
            sotaque="ambar"
            tamanho="medio"
            valor={formatar(natureza.variavel)}
            detalhe="Onde dá para cortar. Relatório de corte só faz sentido aqui."
          />
          <CartaoIndicador
            rotulo="Eventual"
            sotaque="roxo"
            tamanho="medio"
            valor={formatar(natureza.eventual)}
            detalhe="Não é mensal. Precisa de provisão: o valor anual dividido por 12."
          />
        </div>

        {natureza.semNatureza > 0 && (
          <Nota tom="atencao">
            {formatar(natureza.semNatureza)} em despesas sem natureza definida. Elas ficam fora dos
            três blocos — ajuste a natureza das categorias em Mais → Categorias para elas
            aparecerem no lugar certo.
          </Nota>
        )}

        <p className="text-xs leading-relaxed text-slate-600">
          Os três aparecem separados de propósito. Um total único de despesa esconde exatamente a
          informação que interessa: quanto do seu mês é obrigatório e quanto é escolha.
        </p>
      </Secao>

      <Secao
        titulo={`Entrou x saiu — últimos ${JANELA_EM_MESES} meses`}
        acao={
          <button
            onClick={() => setVerTabela((v) => !v)}
            className="text-xs text-emerald-400 hover:text-emerald-300"
          >
            {verTabela ? 'Ver gráfico' : 'Ver tabela'}
          </button>
        }
      >
        <Cartao className="p-4">
          {historico < 2 ? (
            <p className="py-6 text-center text-sm text-slate-500">
              A evolução aparece a partir do segundo mês com movimento. Com um mês só, a
              comparação não diz nada.
            </p>
          ) : verTabela ? (
            <TabelaDaEvolucao dados={evolucao} />
          ) : (
            <ColunasAgrupadas
              dados={evolucao.map((m) => ({
                rotulo: MESES_CURTOS[Number(m.mes.split('-')[1]) - 1] ?? m.mes,
                entrada: m.receitas,
                saida: m.despesas,
              }))}
            />
          )}
        </Cartao>
      </Secao>

      <Secao titulo={`Gasto por categoria em ${MESES[Number(mes.split('-')[1]) - 1]}`}>
        <Cartao className="p-4">
          {porCategoria.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">
              Nenhuma despesa neste mês.
            </p>
          ) : (
            <BarrasHorizontais
              dados={porCategoria.map((fatia) => {
                const categoria = fatia.categoriaId ? porId.get(fatia.categoriaId) : undefined;
                return {
                  rotulo: fatia.categoriaId
                    ? (nomeCategoria.get(fatia.categoriaId) ?? 'Categoria removida')
                    : 'Sem categoria',
                  valor: fatia.total,
                  icone: categoria ? (
                    <IconeDeCategoria
                      chave={categoria.icone}
                      cor={categoria.cor}
                      className="h-4 w-4"
                    />
                  ) : null,
                };
              })}
            />
          )}
        </Cartao>
      </Secao>

      <Nota>
        Relatório de gasto usa a data em que a despesa aconteceu, não a data em que o dinheiro
        saiu. Uma compra parcelada no cartão é gasto do mês da compra, mesmo que as parcelas caiam
        nos meses seguintes.
      </Nota>
    </Pagina>
  );
}

/** Alternativa em tabela: o mesmo dado sem depender de leitura de cor ou tamanho. */
function TabelaDaEvolucao({
  dados,
}: {
  dados: { mes: DataISO; receitas: number; despesas: number }[];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wider text-slate-500">
            <th className="pb-2 font-medium">Mês</th>
            <th className="pb-2 text-right font-medium" style={{ color: COR_ENTRADA }}>
              Entrou
            </th>
            <th className="pb-2 text-right font-medium" style={{ color: COR_SAIDA }}>
              Saiu
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-borda">
          {dados.map((linha) => (
            <tr key={linha.mes}>
              <td className="py-2 text-slate-300">{formatarBR(linha.mes).slice(3)}</td>
              <td className="py-2 text-right">
                <Dinheiro centavos={linha.receitas} className="text-slate-300" />
              </td>
              <td className="py-2 text-right">
                <Dinheiro centavos={linha.despesas} className="text-slate-300" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
