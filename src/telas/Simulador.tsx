import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { hoje, primeiroDiaDoMes, somarMeses, type DataISO } from '../dominio/datas';
import { formatar, type Centavos } from '../dominio/dinheiro';
import { ROTULO_CENARIO, simularCompra, type Cenario } from '../dominio/projecao';
import { montarDadosDaProjecao } from '../dados/projecao';
import { CampoValor } from '../ui/CampoValor';
import { Link } from 'react-router-dom';
import { Botao, Cartao, CartaoIndicador, Chip, Nota, Pagina, Secao, Vazio } from '../ui/base';

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

  const dados = useQuery({ queryKey: ['projecao'], queryFn: () => montarDadosDaProjecao() });

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
    provisaoEventualMensal: dados.data.provisaoEventualMensal,
    medianaDasVariaveis: dados.data.medianaDasVariaveis,
    jaLancadoPorMes: dados.data.jaLancadoPorMes,
  };

  const impacto =
    valor > 0
      ? simularCompra(entrada, cenario, {
          valor,
          parcelas,
          primeiroMes: primeiroDiaDoMes(hoje()),
        })
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
          <div className="mt-2 flex flex-wrap gap-2">
            {[1, 2, 3, 4, 6, 10, 12, 18, 24].map((n) => (
              <Chip key={n} ativo={parcelas === n} aoClicar={() => setParcelas(n)}>
                {n === 1 ? 'À vista' : `${n}x`}
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

          {/* 3º: compromisso mensal depois da compra. */}
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
