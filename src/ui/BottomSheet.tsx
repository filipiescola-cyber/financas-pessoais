import { useEffect, useRef, type ReactNode } from 'react';

type Props = {
  aberto: boolean;
  aoFechar: () => void;
  children: ReactNode;
};

/**
 * Folha que sobe de baixo. Nunca página nova (§14): o usuário não perde o
 * contexto e não navega para lançar R$ 12 de pão.
 *
 * Fica colada embaixo porque é onde o polegar alcança — a mesma razão da barra
 * de navegação. `env(safe-area-inset-bottom)` mantém os botões acima da barra
 * de gestos do celular.
 *
 * O VOLTAR do Android fecha a folha em vez de sair da tela. Sem isso, quem
 * abria a folha e desistia era jogado para fora da página — o gesto mais
 * natural do aparelho fazia a coisa mais destrutiva possível, e ainda perdia o
 * que estava digitado. Não é o Escape do desktop com outro nome: são dois
 * gestos diferentes, e o celular é onde a folha mais é usada.
 */
export function BottomSheet({ aberto, aoFechar, children }: Props) {
  // O efeito depende SÓ de `aberto`. `aoFechar` costuma ser uma arrow criada
  // no render do pai, e depender dela empilharia uma entrada de histórico a
  // cada tecla digitada dentro da folha.
  const fechar = useRef(aoFechar);
  fechar.current = aoFechar;

  useEffect(() => {
    if (!aberto) return;

    function aoTeclar(evento: KeyboardEvent) {
      if (evento.key === 'Escape') fechar.current();
    }

    // Uma entrada de histórico só para o botão voltar ter o que consumir.
    // Ela não muda a URL: a folha não é uma tela, e virar rota daria um link
    // que abre o app com um formulário vazio por cima (§14).
    window.history.pushState({ folhaAberta: true }, '');

    function aoVoltar() {
      fechar.current();
    }

    window.addEventListener('popstate', aoVoltar);
    document.addEventListener('keydown', aoTeclar);

    // Trava a rolagem do fundo enquanto a folha está aberta.
    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('popstate', aoVoltar);
      document.removeEventListener('keydown', aoTeclar);
      document.body.style.overflow = overflowAnterior;

      // Fechou por outro caminho — botão, fundo, salvar — e a entrada extra
      // continua no histórico: consome sem navegar de verdade. Se quem fechou
      // foi o próprio voltar, o navegador já a tirou e `folhaAberta` é falso.
      if (window.history.state?.folhaAberta) window.history.back();
    };
  }, [aberto]);

  if (!aberto) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <button
        aria-label="Fechar"
        onClick={aoFechar}
        className="absolute inset-0 bg-black/60"
        tabIndex={-1}
      />
      <div className="subindo relative max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-borda bg-superficie p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl shadow-black/60 md:mb-8 md:rounded-2xl">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-700" />
        {children}
      </div>
    </div>
  );
}
