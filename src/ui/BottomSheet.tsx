import { useEffect, type ReactNode } from 'react';

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
 */
export function BottomSheet({ aberto, aoFechar, children }: Props) {
  useEffect(() => {
    if (!aberto) return;
    function aoTeclar(evento: KeyboardEvent) {
      if (evento.key === 'Escape') aoFechar();
    }
    document.addEventListener('keydown', aoTeclar);
    // Trava a rolagem do fundo enquanto a folha está aberta.
    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', aoTeclar);
      document.body.style.overflow = overflowAnterior;
    };
  }, [aberto, aoFechar]);

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
