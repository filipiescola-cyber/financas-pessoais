import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { formatarBR, hoje, primeiroDiaDoMes, type DataISO } from '../dominio/datas';
import { formatar } from '../dominio/dinheiro';
import {
  compromissoMensal,
  mesEmQueOCompromissoAcaba,
  piorMes,
  primeiroMesNegativo,
  projetarFluxo,
  ROTULO_CENARIO,
  type Cenario,
} from '../dominio/projecao';
import { montarDadosDaProjecao } from '../dados/projecao';
import { Botao, Cartao, CartaoIndicador, Chip, Dinheiro, Nota, Pagina, Secao, Vazio } from '../ui/base';
import { Link } from 'react-router-dom';

const HORIZONTE = 12;

const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

function mesCurto(data: DataISO): string {
  return `${MESES_CURTOS[Number(data.split('-')[1]) - 1]}/${data.slice(2, 4)}`;
}

/**
 * Fluxo de caixa projetado (§8).
 *
 * "A pergunta certa é: como fica o saldo nos próximos meses se eu fizer isso?"
 *
 * A tela mostra a confiança de cada componente porque uma projeção que finge
 * precisão é pior do que projeção nenhuma (§8.2).
 */
export function FluxoDeCaixa() {
  const [cenario, setCenario] = useState<Cenario>('provavel');
  const dados = useQuery({ queryKey: ['projecao'], queryFn: () => montarDadosDaProjecao() });

  if (dados.isPending) {
    return (
      <Pagina titulo="Fluxo de caixa">
        <p className="text-slate-400">Calculando…</p>
      </Pagina>
    );
  }

  if (dados.isError) {
    return (
      <Pagina titulo="Fluxo de caixa">
        <p className="text-red-400">Erro: {(dados.error as Error).message}</p>
      </Pagina>
    );
  }

  const entrada = {
    saldoAtual: dados.data.saldoAtual,
    aPartirDe: primeiroDiaDoMes(hoje()),
    horizonteEmMeses: HORIZONTE,
    renda: dados.data.renda,
    fixasMensais: dados.data.fixasMensais,
    provisaoEventualMensal: dados.data.provisaoEventualMensal,
    medianaDasVariaveis: dados.data.medianaDasVariaveis,
    jaLancadoPorMes: dados.data.jaLancadoPorMes,
  };

  if (dados.data.renda.origem === 'ausente' && dados.data.fixasMensais === 0) {
    return (
      <Pagina titulo="Fluxo de caixa">
        <Vazio
          titulo="Ainda não dá para projetar"
          descricao="A projeção precisa saber de onde vem o dinheiro e o que sai todo mês. Cadastre suas fontes de renda e despesas fixas no onboarding — é o passo que faz esta tela começar a funcionar."
          acao={
            <Link to="/comecar">
              <Botao>Completar configuração</Botao>
            </Link>
          }
        />
      </Pagina>
    );
  }

  const projecao = projetarFluxo(entrada, cenario);
  const pior = piorMes(projecao);
  const negativo = primeiroMesNegativo(projecao);
  const compromisso = compromissoMensal(entrada.jaLancadoPorMes, entrada.aPartirDe);
  const fimDoCompromisso = mesEmQueOCompromissoAcaba(entrada.jaLancadoPorMes);

  return (
    <Pagina titulo="Fluxo de caixa" subtitulo={`Próximos ${HORIZONTE} meses`}>
      <div className="flex flex-wrap gap-2">
        {(['pessimista', 'provavel', 'otimista'] as const).map((c) => (
          <Chip key={c} ativo={cenario === c} aoClicar={() => setCenario(c)}>
            {ROTULO_CENARIO[c]}
          </Chip>
        ))}
      </div>

      <OrigemDaRenda
        origem={dados.data.renda.origem}
        meses={dados.data.renda.mesesDeHistorico}
        valor={dados.data.renda[cenario]}
      />

      {negativo && (
        <Nota tom="atencao">
          No cenário "{ROTULO_CENARIO[cenario].toLowerCase()}", o saldo fica negativo em{' '}
          {mesCurto(negativo.mes)}: {formatar(negativo.saldoFinal)}.
        </Nota>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {pior && (
          <CartaoIndicador
            rotulo="Mês mais apertado"
            sotaque={pior.saldoFinal < 0 ? 'ambar' : 'azul'}
            valor={formatar(pior.saldoFinal)}
            detalhe={`Em ${mesCurto(pior.mes)}. É esse número que decide compra, não o saldo de hoje.`}
          />
        )}
        <CartaoIndicador
          rotulo="Já comprometido no próximo mês"
          sotaque="roxo"
          valor={formatar(compromisso)}
          detalhe={
            fimDoCompromisso
              ? `Parcelas e recorrências já lançadas. A última cai em ${mesCurto(fimDoCompromisso)}.`
              : 'Nada parcelado à frente.'
          }
        />
      </div>

      <Secao titulo="Mês a mês">
        <Cartao>
          <ul className="divide-y divide-borda">
            {projecao.map((mes) => (
              <li key={mes.mes} className="px-4 py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm text-slate-200">{formatarBR(mes.mes).slice(3)}</span>
                  <Dinheiro
                    centavos={mes.saldoFinal}
                    className={`text-sm ${mes.saldoFinal < 0 ? 'text-red-400' : 'text-slate-100'}`}
                  />
                </div>
                <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
                  <span>entra {formatar(mes.receita)}</span>
                  {mes.saidas.jaLancado > 0 && (
                    <span title="Já lançado no banco: fato consumado">
                      parcelas {formatar(mes.saidas.jaLancado)}
                    </span>
                  )}
                  {mes.saidas.fixas > 0 && <span>fixas {formatar(mes.saidas.fixas)}</span>}
                  {mes.saidas.provisaoEventual > 0 && (
                    <span title="Eventual do ano dividido por 12">
                      provisão {formatar(mes.saidas.provisaoEventual)}
                    </span>
                  )}
                  {mes.saidas.variaveis > 0 && (
                    <span title="Mediana dos últimos meses: a parte mais incerta">
                      variáveis {formatar(mes.saidas.variaveis)}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Cartao>
      </Secao>

      <Secao titulo="De onde vem cada número">
        <Cartao className="p-4">
          <ul className="space-y-2 text-xs leading-relaxed text-slate-500">
            <li>
              <strong className="text-slate-300">Parcelas — confiança alta.</strong> Já estão
              gravadas no banco com data futura. Não é estimativa, é fato consumado.
            </li>
            <li>
              <strong className="text-slate-300">Fixas — confiança alta.</strong> Soma das
              recorrências de despesa cadastradas.
            </li>
            <li>
              <strong className="text-slate-300">Provisão de eventual — média.</strong> O gasto
              eventual do último ano dividido por 12. Sem isso o IPVA de janeiro sempre parece um
              desastre.
            </li>
            <li>
              <strong className="text-slate-300">Variáveis — baixa.</strong> Mediana dos últimos
              meses, nunca média: um mês excepcional distorceria a projeção justo para quem menos
              pode errar.
            </li>
          </ul>
        </Cartao>
      </Secao>

      <Nota>
        Decisão de compra se toma olhando o cenário de mês ruim, não o típico. É por isso que os
        três estão aqui e não escondidos atrás de uma média só.
      </Nota>
    </Pagina>
  );
}

function OrigemDaRenda({
  origem,
  meses,
  valor,
}: {
  origem: 'historico' | 'semente' | 'ausente';
  meses: number;
  valor: number;
}) {
  if (origem === 'historico') {
    return (
      <Nota>
        Renda projetada em {formatar(valor)}, a partir da mediana de {meses} mês(es) de histórico
        real. Venda de bem, reembolso e restituição ficam de fora do cálculo — são altas e
        isoladas, e puxariam a mediana para cima.
      </Nota>
    );
  }

  if (origem === 'semente') {
    return (
      <Nota tom="atencao">
        Renda projetada em {formatar(valor)}, a partir da <strong>estimativa que você informou</strong>{' '}
        no onboarding — ainda não há 3 meses de histórico. A partir daí o app troca pela mediana
        real e avisa aqui.
      </Nota>
    );
  }

  return (
    <Nota tom="atencao">
      Sem fonte de renda cadastrada e sem histórico, a projeção assume receita zero. Cadastre suas
      fontes no onboarding para os números fazerem sentido.
    </Nota>
  );
}
