import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { formatarBR, hoje, primeiroDiaDoMes, somarMeses, type DataISO } from '../dominio/datas';
import { formatar, type Centavos } from '../dominio/dinheiro';
import { usarBuscaDeCategoria } from '../dados/usarTransacoes';
import { IconeDeCategoria } from '../ui/iconesDeCategoria';
import {
  ROTULO_CENARIO,
  agruparPorCategoria,
  compromissoMensal,
  compromissosDoMes,
  diagnosticar,
  mesEmQueOCompromissoAcaba,
  mesesRestantes,
  piorMes,
  primeiroMesNegativo,
  projetarFluxo,
  resultadoDoMes,
  type Cenario,
  type Compromisso,
  type MesProjetado,
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
    // A projeção começa no MÊS QUE VEM (§8.2: "para cada mês futuro"), e parte
    // do saldo previsto para o fim deste mês — não do de hoje.
    //
    // Somar a renda inteira de agosto por cima de um saldo de 29 de agosto
    // contava duas vezes o salário que já caiu: o número crescia sozinho e não
    // batia com nada. O mês corrente já é respondido por Lançamentos, com o
    // saldo dia a dia.
    saldoAtual: dados.data.saldoAtual + dados.data.aindaNesteMes,
    aPartirDe: primeiroDiaDoMes(somarMeses(hoje(), 1)),
    horizonteEmMeses: HORIZONTE,
    renda: dados.data.renda,
    fixasMensais: dados.data.fixasMensais,
    fixasComPrazo: dados.data.fixasComPrazo,
    compromissos: dados.data.compromissos,
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
  const diagnostico = diagnosticar(projecao);
  // A saída do mês típico sai da própria mediana: entra menos o que falta.
  const saidaTipica = diagnostico ? dados.data.renda[cenario] - diagnostico.tipico : 0;

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

      {/*
        O diagnóstico vem antes de tudo porque era ele que faltava. A tela
        mostrava doze saldos ACUMULADOS descendo, e saldo acumulado não explica
        nada: dá para olhar a coluna inteira sem descobrir que a causa é a mesma
        todo mês, e que ela cabe numa linha — entram seis mil, saem nove e
        oitocentos, faltam três mil e oitocentos. Sempre os mesmos.
      */}
      {diagnostico && (
        <div
          className={`rounded-xl border p-4 ${
            diagnostico.tipico < 0
              ? 'border-amber-900/50 bg-amber-950/20'
              : 'border-emerald-900/50 bg-emerald-950/20'
          }`}
        >
          <p className="text-[11px] uppercase tracking-wider text-slate-500">
            {diagnostico.tipico < 0 ? 'Num mês típico, falta' : 'Num mês típico, sobra'}
          </p>
          <p
            className={`dinheiro mt-0.5 text-3xl font-semibold ${
              diagnostico.tipico < 0 ? 'text-amber-300' : 'text-emerald-300'
            }`}
          >
            {formatar(Math.abs(diagnostico.tipico))}
          </p>

          <p className="mt-2 text-sm leading-relaxed text-slate-300">
            Entram <Dinheiro centavos={dados.data.renda[cenario]} className="text-slate-100" /> e
            saem <Dinheiro centavos={saidaTipica} className="text-slate-100" />.
            {diagnostico.maiorSaida && (
              <>
                {' '}
                A maior parte são <strong>{diagnostico.maiorSaida.nome}</strong>, com{' '}
                {formatar(diagnostico.maiorSaida.valor)}.
              </>
            )}
          </p>

          {diagnostico.tipico < 0 && (
            <p className="mt-2 text-xs leading-relaxed text-slate-400">
              É essa diferença que se acumula mês a mês na lista abaixo — não um gasto novo em
              cada um deles. {diagnostico.mesesNoVermelho} dos {diagnostico.totalDeMeses} meses
              projetados fecham no vermelho.
            </p>
          )}
        </div>
      )}

      {negativo && (
        <Nota tom="atencao">
          No cenário "{ROTULO_CENARIO[cenario].toLowerCase()}", o saldo passa de zero em{' '}
          {mesCurto(negativo.mes)} — é quando a soma das diferenças come o que você tem hoje.
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

      <Secao titulo={`Para onde vai, em ${mesCurto(entrada.aPartirDe)}`}>
        <QuadrosPorCategoria
          compromissos={compromissosDoMes(entrada.compromissos, entrada.aPartirDe)}
          mes={entrada.aPartirDe}
          provisao={entrada.provisaoEventualMensal}
          variaveis={entrada.medianaDasVariaveis}
          entra={dados.data.renda[cenario]}
        />
      </Secao>

      <Secao titulo="Mês a mês">
        {/* De onde a primeira linha parte. Sem isto o número aparece do nada, e
            um saldo projetado que ninguém consegue conferir não serve. */}
        <p className="text-xs leading-relaxed text-slate-500">
          Começa no mês que vem, partindo de{' '}
          <Dinheiro centavos={entrada.saldoAtual} className="text-slate-300" /> — o saldo de hoje
          mais o que ainda falta acontecer em {mesCurto(primeiroDiaDoMes(hoje()))}. O mês corrente
          está em Lançamentos, com o saldo dia a dia.
        </p>

        <Cartao>
          <ul className="divide-y divide-borda">
            {projecao.map((mes) => (
              <LinhaDoMes
                key={mes.mes}
                mes={mes}
                compromissos={compromissosDoMes(entrada.compromissos, mes.mes)}
                provisao={entrada.provisaoEventualMensal}
                variaveis={entrada.medianaDasVariaveis}
              />
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
  origem: 'historico' | 'recorrencia' | 'semente' | 'ausente';
  meses: number;
  valor: number;
}) {
  if (origem === 'recorrencia') {
    return (
      <Nota>
        Renda projetada em {formatar(valor)}, a partir das <strong>fontes fixas cadastradas</strong>.
        Como ainda não há histórico e você não informou estimativa de renda variável, os três
        cenários são iguais — não há o que variar.
      </Nota>
    );
  }

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

const ROTULO_ESPECIE: Record<string, string> = {
  fixa: 'recorrência',
  divida: 'dívida',
  parcela: 'já lançado',
};

/**
 * Uma linha do mês, que abre.
 *
 * O total do mês responde "quanto" e cala sobre "o quê". Abrir era a única
 * coisa que faltava para a resposta estar na mesma tela em vez de exigir uma
 * ida a Lançamentos e uma volta — e num mês FUTURO essa ida nem resolve, porque
 * metade do que pesa ainda não virou lançamento.
 */
function LinhaDoMes({
  mes,
  compromissos,
  provisao,
  variaveis,
}: {
  mes: MesProjetado;
  compromissos: readonly Compromisso[];
  provisao: Centavos;
  variaveis: Centavos;
}) {
  const [aberto, setAberto] = useState(false);
  const resultado = resultadoDoMes(mes);

  return (
    <li className="px-4 py-3">
      {/*
        Dois números, e a ordem importa: o do MÊS explica, o acumulado só
        mostra o estrago. Antes só o acumulado aparecia, em destaque, e ele é o
        que menos ajuda a entender.
      */}
      <button
        onClick={() => setAberto((v) => !v)}
        className="flex w-full items-baseline justify-between gap-3 text-left"
      >
        <span className="flex items-baseline gap-2 text-sm text-slate-200">
          {formatarBR(mes.mes).slice(3)}
          <span className="text-xs text-slate-600">{aberto ? '−' : '+'}</span>
        </span>
        <span className="flex items-baseline gap-3">
          <span className="text-right">
            <span className="block text-[10px] uppercase tracking-wider text-slate-600">
              no mês
            </span>
            <Dinheiro
              centavos={resultado}
              className={`text-sm ${resultado < 0 ? 'text-amber-400' : 'text-emerald-400'}`}
            />
          </span>
          <span className="w-px self-stretch bg-borda" />
          <span className="text-right">
            <span className="block text-[10px] uppercase tracking-wider text-slate-600">
              acumulado
            </span>
            <Dinheiro
              centavos={mes.saldoFinal}
              className={`text-sm ${mes.saldoFinal < 0 ? 'text-red-400' : 'text-slate-100'}`}
            />
          </span>
        </span>
      </button>

      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
        <span className="text-emerald-400/70">entra {formatar(mes.receita)}</span>
        <span className="text-amber-400/70">sai {formatar(mes.totalDeSaidas)}</span>
      </div>

      {aberto && (
        <div className="mt-3">
          <QuadrosPorCategoria
            compromissos={compromissos}
            mes={mes.mes}
            provisao={provisao}
            variaveis={variaveis}
            entra={mes.receita}
          />
        </div>
      )}
    </li>
  );
}

/**
 * Para onde vai o dinheiro, um quadro por categoria (§2.5).
 *
 * Uma lista de vinte compromissos soltos responde "o que é isso" e não responde
 * "onde eu gasto" — e é a segunda que decide corte. Categoria é a unidade em
 * que se pensa gasto: ninguém corta "Claro Internet", corta "Assinaturas".
 *
 * Dentro do quadro os itens aparecem com nome, porque cortar exige saber qual
 * deles é. Os dois níveis existem pela mesma razão: um diz onde olhar, o outro
 * diz onde mexer.
 */
function QuadrosPorCategoria({
  compromissos,
  mes,
  provisao,
  variaveis,
  entra,
}: {
  compromissos: readonly Compromisso[];
  mes: DataISO;
  provisao: Centavos;
  variaveis: Centavos;
  entra: Centavos;
}) {
  const buscarCategoria = usarBuscaDeCategoria();
  const grupos = agruparPorCategoria(compromissos);

  if (grupos.length === 0 && provisao === 0 && variaveis === 0) {
    return <p className="text-xs text-slate-500">Nada comprometido neste mês.</p>;
  }

  return (
    <div className="space-y-2">
      {grupos.map((grupo) => {
        const categoria = buscarCategoria(grupo.categoriaId);
        // A fatia do que ENTRA, não do que sai: "consome 35% da renda" decide
        // alguma coisa; "é 35% dos gastos" não decide nada.
        const fatia = entra > 0 ? Math.round((grupo.total / entra) * 100) : 0;

        return (
          <div
            key={grupo.categoriaId ?? 'sem'}
            className="rounded-lg border border-borda bg-superficie-alta p-3"
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="flex min-w-0 items-center gap-1.5">
                <IconeDeCategoria
                  chave={categoria?.icone ?? null}
                  cor={categoria?.cor ?? null}
                  className="h-4 w-4 shrink-0"
                />
                <span className="truncate text-sm text-slate-100">
                  {categoria?.nome ?? 'Sem categoria'}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <Dinheiro centavos={-grupo.total} className="text-sm text-slate-200" />
                {fatia > 0 && (
                  <span className="block text-[10px] text-slate-600">
                    {fatia}% do que entra
                  </span>
                )}
              </span>
            </div>

            <ul className="mt-2 space-y-1 border-l border-borda pl-2.5">
              {grupo.itens.map((item) => {
                const faltam = mesesRestantes(item, mes);

                return (
                  <li
                    key={`${item.especie}-${item.nome}`}
                    className="flex items-baseline justify-between gap-3 text-xs"
                  >
                    <span className="min-w-0 truncate text-slate-400">
                      {item.nome}
                      <span className="text-slate-600">
                        {' · '}
                        {ROTULO_ESPECIE[item.especie]}
                        {faltam !== null && ` · faltam ${faltam}x`}
                      </span>
                    </span>
                    <Dinheiro centavos={-item.valor} className="shrink-0 text-slate-500" />
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}

      {(provisao > 0 || variaveis > 0) && (
        <div className="rounded-lg border border-dashed border-borda-forte p-3">
          <p className="text-xs leading-relaxed text-slate-500">
            Mais {provisao > 0 && <>{formatar(provisao)} de provisão para eventuais</>}
            {provisao > 0 && variaveis > 0 && ' e '}
            {variaveis > 0 && <>{formatar(variaveis)} de gastos variáveis</>}. Estes ficam sem
            categoria de propósito: não são compromisso, são a média do que costuma acontecer, e
            listá-los como conta a pagar sugeriria um corte que não existe.
          </p>
        </div>
      )}
    </div>
  );
}
