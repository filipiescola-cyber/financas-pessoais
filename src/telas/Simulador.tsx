import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  hoje,
  primeiroDiaDoMes,
  somarMeses,
  ultimoDiaDoMes,
  type DataISO,
} from '../dominio/datas';
import { formatar, type Centavos } from '../dominio/dinheiro';
import {
  ROTULO_CENARIO,
  melhorMesParaComprar,
  mesesParaComprar,
  simularCompra,
  type Cenario,
  type ImpactoDaCompra,
} from '../dominio/projecao';
import { montarDadosDaProjecao } from '../dados/projecao';
import { listarOrcamentos } from '../dados/orcamentos';
import { orcamentoComACompra } from '../dominio/orcamento';
import { usarCategorias, usarTransacoes } from '../dados/usarTransacoes';
import { CampoValor } from '../ui/CampoValor';
import { Link } from 'react-router-dom';
import { Botao, Cartao, CartaoIndicador, Chip, Nota, Pagina, Secao, Vazio } from '../ui/base';
import { ChipsDeParcelas } from '../ui/ChipsDeParcelas';

const HORIZONTE = 12;

const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

function mesCurto(data: DataISO): string {
  return `${MESES_CURTOS[Number(data.split('-')[1]) - 1]}/${data.slice(2, 4)}`;
}

/**
 * Simulador de impacto de compra (§8.4). "O recurso mais útil do app inteiro."
 *
 * Vive fora do fluxo de compra de propósito: é assim que vai ser mais usado —
 * dentro da loja, antes de comprar.
 *
 * Regra dura do §8.4: NÃO MORALIZAR. Nada de "tem certeza?", nada de emoji
 * triste, nada de comparação com o mês passado. Mostrar o número e sair da
 * frente. A decisão é do usuário. Nada aqui é gravado.
 */
export function Simulador() {
  const [valor, setValor] = useState<Centavos>(0);
  const [parcelas, setParcelas] = useState(1);
  const [cenario, setCenario] = useState<Cenario>('pessimista');
  const [quando, setQuando] = useState<DataISO>(primeiroDiaDoMes(hoje()));
  const [categoriaId, setCategoriaId] = useState<string | null>(null);

  const dados = useQuery({ queryKey: ['projecao'], queryFn: () => montarDadosDaProjecao() });
  const categorias = usarCategorias();

  // O teto e o já gasto são do MÊS DA COMPRA, não do mês corrente: adiar uma
  // compra para dezembro e ver o teto de setembro responderia outra pergunta.
  const orcamentos = useQuery({
    queryKey: ['orcamentos', quando],
    queryFn: () => listarOrcamentos(quando),
  });

  const doMesDaCompra = usarTransacoes({ de: quando, ate: ultimoDiaDoMes(quando) });

  if (dados.isPending) {
    return (
      <Pagina titulo="Simulador">
        <p className="text-slate-400">Calculando…</p>
      </Pagina>
    );
  }

  if (dados.isError) {
    return (
      <Pagina titulo="Simulador">
        <p className="text-red-400">Erro: {(dados.error as Error).message}</p>
      </Pagina>
    );
  }

  // Mesma guarda do fluxo de caixa: sem renda e sem fixas não há projeção, e
  // "seu mês mais apertado: R$ 0,00" seria um número inventado com cara de
  // resposta (§13.5).
  const semBase = dados.data.renda.origem === 'ausente' && dados.data.fixasMensais === 0;

  if (semBase) {
    return (
      <Pagina titulo="Simulador" subtitulo="O que esta compra faz com os próximos meses">
        <Vazio
          titulo="Ainda não dá para simular"
          descricao="O simulador compara a projeção com e sem a compra — e a projeção precisa saber de onde vem o dinheiro e o que sai todo mês. Sem isso, qualquer número aqui seria inventado."
          acao={
            <Link to="/comecar">
              <Botao>Completar configuração</Botao>
            </Link>
          }
        />
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
    provisaoEventualMensal: dados.data.provisaoEventualMensal,
    medianaDasVariaveis: dados.data.medianaDasVariaveis,
    jaLancadoPorMes: dados.data.jaLancadoPorMes,
    liberacoesPorMes: dados.data.liberacoesPorMes,
    anuaisPorMes: dados.data.anuaisPorMes,
  };

  const impacto =
    valor > 0
      ? simularCompra(entrada, cenario, { valor, parcelas, primeiroMes: quando })
      : null;

  /**
   * Em que mês essa compra dói menos (§8.4).
   *
   * A mesma compra em meses diferentes dá resultados diferentes, e a diferença
   * não é intuitiva: adiar um mês pode não resolver nada — se o aperto vem de
   * parcelas que só acabam em março — como pode resolver tudo, se o mês
   * seguinte é o que uma dívida termina. Só a conta responde.
   */
  const opcoes = valor > 0 ? mesesParaComprar(entrada, cenario, { valor, parcelas }, 6) : [];
  const melhorMes = melhorMesParaComprar(opcoes);

  const teto = (orcamentos.data ?? []).find((o) => o.categoriaId === categoriaId) ?? null;
  const nomeDaCategoria =
    (categorias.data ?? []).find((c) => c.id === categoriaId)?.nome ?? null;

  const jaGastoNaCategoria = (doMesDaCompra.data ?? [])
    .filter((t) => t.tipo === 'despesa' && t.categoriaId === categoriaId)
    .reduce((total, t) => total + Math.abs(t.valor), 0);

  // Só a primeira parcela pesa no teto do mês da compra: as outras caem em
  // meses que têm teto próprio.
  const noOrcamento =
    teto && impacto
      ? orcamentoComACompra(
          teto.valorPlanejado,
          jaGastoNaCategoria,
          impacto.valorDaParcela,
          hoje(),
        )
      : null;

  const aumentoDoCompromisso = impacto
    ? impacto.compromissoDepois - impacto.compromissoAntes
    : 0;

  return (
    <Pagina titulo="Simulador" subtitulo="O que esta compra faz com os próximos meses">
      <Cartao className="space-y-4 p-4">
        <CampoValor valor={valor} aoMudar={setValor} rotulo="Valor da compra" autoFocus />

        <div>
          <span className="text-sm text-slate-400">Em quantas vezes</span>
          <ChipsDeParcelas
            parcelas={parcelas}
            aoMudar={setParcelas}
            opcoes={[1, 2, 3, 4, 6, 10, 12, 18, 24]}
          />
        </div>

        <div>
          <span className="text-sm text-slate-400">Quando</span>
          <p className="mt-0.5 text-xs leading-relaxed text-slate-600">
            A primeira parcela cai neste mês. Mudar a data muda tudo: uma dívida que acaba em
            janeiro deixa fevereiro bem mais folgado que dezembro.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {[0, 1, 2, 3].map((n) => {
              const mes = primeiroDiaDoMes(somarMeses(hoje(), n));
              return (
                <Chip key={mes} ativo={quando === mes} aoClicar={() => setQuando(mes)}>
                  {n === 0 ? 'Este mês' : n === 1 ? 'Mês que vem' : mesCurto(mes)}
                </Chip>
              );
            })}
          </div>
        </div>

        <div>
          <span className="text-sm text-slate-400">Categoria (opcional)</span>
          <p className="mt-0.5 text-xs leading-relaxed text-slate-600">
            Com ela o app também diz se a compra fura o teto que você definiu. Ter dinheiro e
            furar o teto são coisas diferentes.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {(categorias.data ?? [])
              .filter((c) => c.tipo === 'despesa')
              .map((c) => (
                <Chip
                  key={c.id}
                  ativo={categoriaId === c.id}
                  aoClicar={() => setCategoriaId(categoriaId === c.id ? null : c.id)}
                >
                  {c.nome}
                </Chip>
              ))}
          </div>
        </div>

        <div>
          <span className="text-sm text-slate-400">Cenário de renda</span>
          <div className="mt-2 flex flex-wrap gap-2">
            {(['pessimista', 'provavel', 'otimista'] as const).map((c) => (
              <Chip key={c} ativo={cenario === c} aoClicar={() => setCenario(c)}>
                {ROTULO_CENARIO[c]}
              </Chip>
            ))}
          </div>
        </div>
      </Cartao>

      {impacto === null ? (
        <Nota>
          Digite o valor para ver o efeito. Nada aqui é gravado — dá para usar como calculadora
          avulsa, dentro da loja.
        </Nota>
      ) : (
        <>
          {/* 1º em destaque: o pior mês. "É esse número que muda comportamento." */}
          <Secao titulo="Seu mês mais apertado">
            <div className="grid gap-3 sm:grid-cols-2">
              <CartaoIndicador
                rotulo="Hoje"
                sotaque="neutro"
                valor={formatar(impacto.piorMesAntes?.saldoFinal ?? 0)}
                detalhe={
                  impacto.piorMesAntes ? `Em ${mesCurto(impacto.piorMesAntes.mes)}` : undefined
                }
              />
              <CartaoIndicador
                rotulo="Com esta compra"
                sotaque={(impacto.piorMesDepois?.saldoFinal ?? 0) < 0 ? 'ambar' : 'azul'}
                valor={formatar(impacto.piorMesDepois?.saldoFinal ?? 0)}
                detalhe={
                  impacto.piorMesDepois ? `Em ${mesCurto(impacto.piorMesDepois.mes)}` : undefined
                }
              />
            </div>
          </Secao>

          {/* 2º: se algum mês fica negativo, qual e por quanto. */}
          {impacto.primeiroNegativoDepois && !impacto.primeiroNegativoAntes && (
            <Nota tom="atencao">
              Com esta compra, o saldo fica negativo em{' '}
              {mesCurto(impacto.primeiroNegativoDepois.mes)}:{' '}
              {formatar(impacto.primeiroNegativoDepois.saldoFinal)}. Sem ela, nenhum mês do
              horizonte fica negativo.
            </Nota>
          )}

          {impacto.primeiroNegativoDepois && impacto.primeiroNegativoAntes && (
            <Nota tom="atencao">
              O saldo já ficaria negativo em {mesCurto(impacto.primeiroNegativoAntes.mes)} sem esta
              compra. Com ela, em {mesCurto(impacto.primeiroNegativoDepois.mes)}.
            </Nota>
          )}

          {/*
            O teto da categoria (§8.4). Ter dinheiro e furar o teto são
            perguntas independentes: dá para o saldo aguentar e a compra ainda
            estourar o que você tinha decidido gastar ali.
          */}
          {noOrcamento && (
            <Nota tom={noOrcamento.passaAEstourar ? 'atencao' : undefined}>
              {noOrcamento.passaAEstourar ? (
                <>
                  A primeira parcela fura o teto de{' '}
                  <strong>{nomeDaCategoria ?? 'a categoria'}</strong> deste mês: cabiam{' '}
                  {formatar(noOrcamento.cabiaAinda)} e a compra pede{' '}
                  {formatar(impacto.valorDaParcela)}.
                </>
              ) : (
                <>
                  Cabe no teto de <strong>{nomeDaCategoria ?? 'a categoria'}</strong>: sobram{' '}
                  {formatar(noOrcamento.depois.restante)} depois dela, de{' '}
                  {formatar(noOrcamento.antes.planejado)} planejados.
                </>
              )}
            </Nota>
          )}

          {categoriaId !== null && teto === null && (
            <Nota>
              Sem teto definido para essa categoria em {mesCurto(quando)}, não dá para dizer se a
              compra fura alguma coisa — só o saldo responde.
            </Nota>
          )}

          {/*
            Em que mês comprar (§8.4).
            Aparece só quando ADIAR muda o resultado: sugerir esperar por nada
            seria moralizar, que é exatamente o que o §8.4 proíbe. Quando o mês
            escolhido já é o indicado, também vale dizer — é uma resposta.
          */}
          {melhorMes && melhorMes.mes !== quando && (
            <Nota tom={melhorMes.ficaNegativo ? undefined : 'positivo'}>
              {melhorMes.ficaNegativo ? (
                <>
                  Nenhum dos próximos seis meses escapa do vermelho com esta compra. O menos ruim
                  é <strong>{mesCurto(melhorMes.mes)}</strong>, com pior saldo de{' '}
                  {formatar(melhorMes.piorSaldo)}.
                </>
              ) : (
                <>
                  Começando em <strong>{mesCurto(melhorMes.mes)}</strong>, nenhum mês do horizonte
                  fica negativo — o pior fecha em {formatar(melhorMes.piorSaldo)}.
                </>
              )}
            </Nota>
          )}

          {melhorMes && melhorMes.mes === quando && !melhorMes.ficaNegativo && (
            <Nota tom="positivo">
              {mesCurto(quando)} já é o melhor mês: adiar não melhora o pior saldo.
            </Nota>
          )}

          {/* 3º: o formato do estrago, mês a mês. */}
          <Secao titulo="Saldo no fim de cada mês, antes e depois">
            <MiniFluxo impacto={impacto} parcelas={parcelas} />
          </Secao>

          {/* 4º: compromisso mensal depois da compra. */}
          <Secao titulo="Compromisso mensal">
            <Cartao className="p-4">
              <p className="text-sm text-slate-300">
                Você passa de{' '}
                <span className="numero dinheiro">{formatar(impacto.compromissoAntes)}</span> para{' '}
                <span className="numero dinheiro">{formatar(impacto.compromissoDepois)}</span> por
                mês já comprometidos
                {impacto.ultimaParcela && parcelas > 1 && (
                  <>
                    , até {mesCurto(impacto.ultimaParcela)}
                  </>
                )}
                .
              </p>
              {parcelas > 1 && (
                <p className="mt-2 text-xs text-slate-500">
                  {parcelas}x de {formatar(impacto.valorDaParcela)} · aumento de{' '}
                  {formatar(aumentoDoCompromisso)} por mês
                </p>
              )}
            </Cartao>
          </Secao>

          <Nota>
            Projeção no cenário "{ROTULO_CENARIO[cenario].toLowerCase()}". Decisão de compra se
            toma olhando o mês ruim, não o típico — é para isso que o cenário está aqui em cima.
          </Nota>
        </>
      )}
    </Pagina>
  );
}

/**
 * O antes e o depois, mês a mês.
 *
 * O pior mês responde "dá ou não dá", mas não mostra o FORMATO do aperto: uma
 * compra que segura três meses e passa e outra que baixa o saldo para sempre
 * podem ter exatamente o mesmo pior mês. A distância entre as duas barras
 * parando — ou não — de crescer é o que separa as duas.
 *
 * Sem moralizar (§8.4): a barra mostra o tamanho, não opina sobre ele.
 */
function MiniFluxo({ impacto, parcelas }: { impacto: ImpactoDaCompra; parcelas: number }) {
  // Uma escala só para os doze meses, senão cada barra mediria uma coisa e a
  // comparação — que é o ponto — não existiria.
  const escala = Math.max(
    ...impacto.antes.map((m) => Math.abs(m.saldoFinal)),
    ...impacto.depois.map((m) => Math.abs(m.saldoFinal)),
    1,
  );
  const largura = (valor: Centavos) => `${(Math.abs(valor) / escala) * 100}%`;

  const temNegativo = impacto.depois.some((m) => m.saldoFinal < 0);

  return (
    <Cartao className="p-4">
      <ul className="space-y-2.5">
        {impacto.antes.map((mes, i) => {
          const depois = impacto.depois[i]!;
          const comeu = mes.saldoFinal - depois.saldoFinal;
          const negativo = depois.saldoFinal < 0;

          return (
            <li key={mes.mes}>
              <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
                <span className="text-slate-400">{mesCurto(mes.mes)}</span>
                <span className="flex items-baseline gap-1.5">
                  <span className="numero dinheiro text-slate-500">{formatar(mes.saldoFinal)}</span>
                  <span className="text-slate-600">→</span>
                  <span
                    className={`numero dinheiro ${negativo ? 'text-red-400' : 'text-slate-200'}`}
                  >
                    {formatar(depois.saldoFinal)}
                  </span>
                </span>
              </div>

              <div className="flex h-1.5 w-full gap-0.5 overflow-hidden rounded-full bg-superficie-alta">
                {negativo ? (
                  <div className="h-full rounded-full bg-red-500" style={{ width: largura(depois.saldoFinal) }} />
                ) : (
                  <>
                    <div
                      className="h-full rounded-full bg-emerald-500"
                      style={{ width: largura(depois.saldoFinal) }}
                    />
                    {comeu > 0 && (
                      <div
                        className="h-full rounded-full bg-amber-500/60"
                        style={{ width: largura(comeu) }}
                      />
                    )}
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <p className="mt-3.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-4 rounded-full bg-emerald-500" /> O que sobra
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-4 rounded-full bg-amber-500/60" /> O que a compra já levou até
          aqui
        </span>
        {temNegativo && (
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-4 rounded-full bg-red-500" /> O tamanho do buraco
          </span>
        )}
      </p>

      {parcelas > 1 && (
        <p className="mt-2 text-xs leading-relaxed text-slate-500">
          Cada linha é o <strong>saldo</strong> no fim do mês, não o gasto do mês. Saldo acumula:
          no terceiro mês você já pagou três parcelas de{' '}
          <span className="numero dinheiro text-slate-400">
            {formatar(impacto.valorDaParcela)}
          </span>
          , então a distância entre os dois números é três vezes ela — e cresce até a última.
        </p>
      )}
    </Cartao>
  );
}
