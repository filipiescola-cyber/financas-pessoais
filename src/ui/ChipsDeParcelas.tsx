// Escolha do número de parcelas (§2.2, §5.1).
//
// Os atalhos cobrem o comum — 2x, 3x, 6x, 12x —, mas loja parcela em 5x, em 7x,
// em 15x, e a lista fixa obrigava a arredondar para um número que não foi o da
// compra. Uma parcela a mais ou a menos desloca dinheiro de mês, que é
// justamente o que a fatura e a projeção existem para acertar.
//
// O teto não é decoração: cada parcela vira uma transação gravada, então "300"
// digitado por engano criaria 300 linhas em faturas que o app teria que
// inventar até 2051. Sessenta cobre o parcelamento mais longo que se vê na
// prática e ainda para um zero a mais no caminho.

import { useState } from 'react';
import { Chip } from './base';

export const MAXIMO_DE_PARCELAS = 60;

export function ChipsDeParcelas({
  parcelas,
  aoMudar,
  opcoes,
}: {
  parcelas: number;
  aoMudar: (parcelas: number) => void;
  opcoes: readonly number[];
}) {
  // Um valor fora dos atalhos só pode ter vindo do campo livre: ele fica aberto
  // sozinho, senão a tela mostraria "7x" escolhido sem nada marcado.
  const personalizada = !opcoes.includes(parcelas);
  const [pedirNumero, setPedirNumero] = useState(false);
  const aberto = pedirNumero || personalizada;

  // Estado próprio, não derivado de `parcelas`: derivando, digitar "15"
  // quebrava no meio — o "1" caía num atalho existente, o campo deixava de ser
  // "personalizado", o valor voltava para vazio e sobrava "5".
  const [texto, setTexto] = useState(personalizada ? String(parcelas) : '');

  return (
    <>
      <div className="mt-2 flex flex-wrap gap-2">
        {opcoes.map((n) => (
          <Chip
            key={n}
            ativo={parcelas === n}
            aoClicar={() => {
              setPedirNumero(false);
              setTexto('');
              aoMudar(n);
            }}
          >
            {n === 1 ? 'À vista' : `${n}x`}
          </Chip>
        ))}

        <Chip
          ativo={personalizada}
          aoClicar={() => {
            // Abrir sempre começa limpo: reaproveitar o texto de uma abertura
            // anterior fazia o número novo ser digitado ATRÁS do velho.
            setTexto('');
            setPedirNumero((v) => !v);
          }}
        >
          Outro
        </Chip>
      </div>

      {aberto && (
        <input
          inputMode="numeric"
          autoFocus
          value={texto}
          onChange={(e) => {
            // Fica aberto até alguém escolher um atalho: sem isto, apagar o
            // campo levava `parcelas` de volta para 1, que é um atalho, e a
            // caixa se fechava no meio da digitação.
            setPedirNumero(true);
            // Dois dígitos, que é o tamanho do teto. Aceitar um terceiro e
            // depois cortar para 60 faria "150" virar "60" sem explicação, na
            // frente de quem só errou uma tecla.
            const digitos = e.target.value.replace(/\D/g, '').slice(0, 2);
            const numero = Math.min(Math.max(Number(digitos) || 1, 1), MAXIMO_DE_PARCELAS);
            setTexto(digitos === '' ? '' : String(numero));
            // Campo vazio volta para à vista, para nunca ficar sem opção marcada.
            aoMudar(numero);
          }}
          placeholder={`2 a ${MAXIMO_DE_PARCELAS}`}
          aria-label="Número de parcelas"
          className="mt-2 w-28 rounded-lg border border-borda-forte bg-superficie-alta px-3 py-2 text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-emerald-600"
        />
      )}
    </>
  );
}
