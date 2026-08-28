import { useId, type ChangeEvent, type ClipboardEvent } from 'react';
import { analisarTexto, formatarSemSimbolo, type Centavos } from '../dominio/dinheiro';

type Props = {
  valor: Centavos;
  aoMudar: (centavos: Centavos) => void;
  rotulo?: string;
  autoFocus?: boolean;
  className?: string;
};

const LIMITE = 99_999_999_999;

/**
 * Campo de dinheiro com digitação estilo caixa registradora (§5.1).
 *
 * O usuário digita 1, 2, 5, 0 e vê R$ 0,01 → R$ 0,12 → R$ 1,25 → R$ 12,50.
 * Nunca digita vírgula, ponto ou "R$" — obrigar isso é antipadrão (§5.4).
 *
 * A implementação lê apenas os dígitos do campo em vez de tratar teclas: assim
 * funciona igual com teclado físico, teclado de celular, autocorreção e colagem.
 * Este componente é o mais reusado do app — vai para dentro da folha de
 * lançamento rápido na 1.7.
 */
export function CampoValor({ valor, aoMudar, rotulo, autoFocus, className }: Props) {
  const id = useId();

  function aoDigitar(evento: ChangeEvent<HTMLInputElement>) {
    const digitos = evento.target.value.replace(/\D/g, '');
    if (digitos === '') return aoMudar(0);
    const centavos = Number(digitos.slice(0, 11));
    aoMudar(Math.min(centavos, LIMITE));
  }

  function aoColar(evento: ClipboardEvent<HTMLInputElement>) {
    const texto = evento.clipboardData.getData('text');
    const interpretado = analisarTexto(texto);
    // Só intercepta o que dá para entender com certeza; o resto segue o caminho
    // normal de digitação, que também funciona.
    if (interpretado !== null) {
      evento.preventDefault();
      aoMudar(Math.min(Math.abs(interpretado), LIMITE));
    }
  }

  return (
    <div className={className}>
      {rotulo && (
        <label htmlFor={id} className="mb-1 block text-sm text-slate-400">
          {rotulo}
        </label>
      )}
      <div className="flex items-center gap-2 rounded-lg border border-borda-forte bg-superficie-alta px-3 py-2 focus-within:border-slate-500">
        <span className="text-slate-400">R$</span>
        <input
          id={id}
          // inputMode numérico abre o teclado de números no celular sem impedir
          // colagem, o que type="number" faria.
          inputMode="numeric"
          autoComplete="off"
          autoFocus={autoFocus}
          value={formatarSemSimbolo(valor)}
          onChange={aoDigitar}
          onPaste={aoColar}
          onFocus={(e) => e.target.select()}
          className="w-full bg-transparent text-right text-lg text-slate-100 outline-none"
        />
      </div>
    </div>
  );
}
