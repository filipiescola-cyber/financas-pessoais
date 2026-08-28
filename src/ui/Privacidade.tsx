import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

type ContextoPrivacidade = { privado: boolean; alternar: () => void };

const Contexto = createContext<ContextoPrivacidade | null>(null);

const CHAVE = 'modo-privado';

/**
 * Modo privado (§10.4): borra todos os valores da tela. Ônibus, trabalho,
 * alguém do lado. Custa dez linhas de CSS e é das funcionalidades mais usadas
 * em app de finanças.
 *
 * A preferência fica no navegador, não no banco: é uma escolha do aparelho —
 * faz sentido ligado no celular e desligado no computador de casa.
 */
export function ProvedorPrivacidade({ children }: { children: ReactNode }) {
  const [privado, setPrivado] = useState(false);

  useEffect(() => {
    try {
      setPrivado(localStorage.getItem(CHAVE) === '1');
    } catch {
      // Navegador com armazenamento bloqueado: segue com o padrão desligado.
    }
  }, []);

  const alternar = useCallback(() => {
    setPrivado((atual) => {
      const proximo = !atual;
      try {
        localStorage.setItem(CHAVE, proximo ? '1' : '0');
      } catch {
        // Preferência não persiste, mas o modo funciona nesta sessão.
      }
      return proximo;
    });
  }, []);

  return (
    <Contexto.Provider value={{ privado, alternar }}>
      <div data-privado={privado ? 'true' : 'false'}>{children}</div>
    </Contexto.Provider>
  );
}

export function usarPrivacidade() {
  const contexto = useContext(Contexto);
  if (!contexto) throw new Error('usarPrivacidade precisa estar dentro de ProvedorPrivacidade.');
  return contexto;
}
