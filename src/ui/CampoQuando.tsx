// Quando a recorrência acontece, e até quando (§5.2).
//
// Os dois campos vivem aqui porque são pedidos nos mesmos dois lugares — o
// cadastro em Atalhos e os passos de despesa fixa e renda do onboarding — e a
// regra que traduz "36x" em data de término não pode ter duas versões.

import { formatarBR, hoje, type DataISO } from '../dominio/datas';
import type { Feriados } from '../dominio/diasUteis';
import {
  dataDaOcorrencia,
  proximaOcorrencia,
  repeticoesRestantes,
  rotuloDoDia,
  terminoParaRepeticoes,
  type RegraDoDia,
} from '../dominio/recorrencias';
import { Campo, Chip, ENTRADA } from './base';

export type ModoDePrazo = 'sem' | 'parcelas' | 'ate';

const REGRAS: { valor: RegraDoDia; rotulo: string }[] = [
  { valor: 'fixo', rotulo: 'Dia fixo' },
  { valor: 'dia_util', rotulo: 'Dia útil' },
  { valor: 'dia_util_do_fim', rotulo: 'Dia útil, do fim' },
];

const PRAZOS: { valor: ModoDePrazo; rotulo: string }[] = [
  { valor: 'sem', rotulo: 'Sem prazo' },
  { valor: 'parcelas', rotulo: 'Nº de parcelas' },
  { valor: 'ate', rotulo: 'Até um mês' },
];

/** Com regra de dia útil o número é ORDINAL: nenhum mês tem mais de 23. */
export function maximoDoDia(regra: RegraDoDia): number {
  return regra === 'fixo' ? 31 : 23;
}

export function diaEhValido(dia: number, regra: RegraDoDia): boolean {
  return dia >= 1 && dia <= maximoDoDia(regra);
}

/**
 * A data da última ocorrência, a partir do que a tela coletou.
 *
 * O banco guarda só o término: "36x" e "até dez/2028" são o mesmo fato dito de
 * dois jeitos, e guardar os dois deixaria um deles ficar para trás.
 */
export function terminoEscolhido(
  modo: ModoDePrazo,
  parcelas: string,
  mesFinal: string,
  dia: number,
  regra: RegraDoDia,
  feriados: Feriados,
): DataISO | null {
  if (!diaEhValido(dia, regra)) return null;
  if (modo === 'parcelas' && Number(parcelas) >= 1) {
    return terminoParaRepeticoes(hoje(), dia, regra, Number(parcelas), feriados);
  }
  if (modo === 'ate' && /^\d{4}-\d{2}$/.test(mesFinal)) {
    return dataDaOcorrencia(`${mesFinal}-01`, dia, regra, feriados);
  }
  return null;
}

export function CampoQuando({
  rotulo,
  dia,
  regra,
  feriados,
  aoMudarDia,
  aoMudarRegra,
}: {
  rotulo: string;
  dia: string;
  regra: RegraDoDia;
  feriados: Feriados;
  aoMudarDia: (dia: string) => void;
  aoMudarRegra: (regra: RegraDoDia) => void;
}) {
  const numero = Number(dia);
  const valido = diaEhValido(numero, regra);

  return (
    <Campo rotulo={rotulo}>
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          {REGRAS.map((opcao) => (
            <Chip
              key={opcao.valor}
              ativo={regra === opcao.valor}
              aoClicar={() => aoMudarRegra(opcao.valor)}
            >
              {opcao.rotulo}
            </Chip>
          ))}
        </div>

        <input
          inputMode="numeric"
          value={dia}
          onChange={(e) => aoMudarDia(e.target.value.replace(/\D/g, '').slice(0, 2))}
          placeholder={regra === 'fixo' ? '1 a 31' : `1 a ${maximoDoDia(regra)}`}
          className={ENTRADA}
        />

        {valido && (
          <p className="text-xs text-slate-500">
            {rotuloDoDia(numero, regra)} · a próxima cai em{' '}
            <span className="text-slate-300">
              {formatarBR(proximaOcorrencia(hoje(), numero, regra, feriados))}
            </span>
            .
          </p>
        )}
      </div>
    </Campo>
  );
}

export function CampoPrazo({
  modo,
  parcelas,
  mesFinal,
  terminaEm,
  dia,
  regra,
  feriados,
  aoMudarModo,
  aoMudarParcelas,
  aoMudarMesFinal,
}: {
  modo: ModoDePrazo;
  parcelas: string;
  mesFinal: string;
  terminaEm: DataISO | null;
  dia: number;
  regra: RegraDoDia;
  feriados: Feriados;
  aoMudarModo: (modo: ModoDePrazo) => void;
  aoMudarParcelas: (parcelas: string) => void;
  aoMudarMesFinal: (mes: string) => void;
}) {
  return (
    <Campo rotulo="Prazo">
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          {PRAZOS.map((opcao) => (
            <Chip
              key={opcao.valor}
              ativo={modo === opcao.valor}
              aoClicar={() => aoMudarModo(opcao.valor)}
            >
              {opcao.rotulo}
            </Chip>
          ))}
        </div>

        {modo === 'parcelas' && (
          <input
            inputMode="numeric"
            value={parcelas}
            onChange={(e) => aoMudarParcelas(e.target.value.replace(/\D/g, '').slice(0, 3))}
            placeholder="36"
            className={ENTRADA}
          />
        )}

        {modo === 'ate' && (
          <input
            type="month"
            value={mesFinal}
            onChange={(e) => aoMudarMesFinal(e.target.value)}
            className={ENTRADA}
          />
        )}

        {modo === 'sem' ? (
          <p className="text-xs text-slate-500">
            Repete todo mês, sem data para acabar. É o caso do aluguel e do salário.
          </p>
        ) : terminaEm === null ? (
          <p className="text-xs text-slate-500">
            Financiamento, curso, consórcio: some sozinha depois da última, e o fluxo de caixa
            mostra o alívio no mês seguinte.
          </p>
        ) : (
          <p className="text-xs text-slate-500">
            Última em <span className="text-slate-300">{formatarBR(terminaEm)}</span> ·{' '}
            {repeticoesRestantes(hoje(), terminaEm, dia, regra, feriados)}x a partir de agora.
          </p>
        )}
      </div>
    </Campo>
  );
}
