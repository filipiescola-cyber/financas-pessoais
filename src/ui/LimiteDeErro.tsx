import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * Rede de segurança contra tela branca.
 *
 * Sem isto, um erro em qualquer render derruba a árvore inteira e o app vira
 * uma página em branco — sem mensagem, sem caminho de volta, e sem nenhuma
 * pista do que aconteceu. Num app que guarda a vida financeira do usuário
 * isso é o pior desfecho possível: parece perda de dado quando é só um bug de
 * exibição.
 *
 * Precisa ser classe: `componentDidCatch` não tem equivalente em hook.
 */
export class LimiteDeErro extends Component<{ children: ReactNode }, { erro: Error | null }> {
  state: { erro: Error | null } = { erro: null };

  static getDerivedStateFromError(erro: Error) {
    return { erro };
  }

  componentDidCatch(erro: Error, info: ErrorInfo) {
    console.error('Erro de render:', erro, info.componentStack);
  }

  render() {
    if (this.state.erro === null) return this.props.children;

    return (
      <div className="flex min-h-dvh items-center justify-center p-6">
        <div className="w-full max-w-md space-y-4 rounded-xl border border-borda-forte bg-superficie p-6">
          <div>
            <h1 className="text-lg text-slate-100">Algo quebrou nesta tela</h1>
            <p className="mt-1 text-sm text-slate-400">
              É um erro de exibição. Nenhum dado seu foi perdido — o que está gravado continua
              gravado.
            </p>
          </div>

          <pre className="overflow-x-auto rounded-lg border border-borda bg-superficie-alta p-3 text-xs text-amber-400/80">
            {this.state.erro.message}
          </pre>

          <div className="flex gap-2">
            <button
              onClick={() => this.setState({ erro: null })}
              className="rounded-lg bg-sky-600 px-4 py-2 text-sm text-white hover:bg-sky-500"
            >
              Tentar de novo
            </button>
            <button
              onClick={() => {
                window.location.href = import.meta.env.BASE_URL;
              }}
              className="rounded-lg border border-borda-forte px-4 py-2 text-sm text-slate-300 hover:border-slate-500"
            >
              Voltar ao início
            </button>
          </div>
        </div>
      </div>
    );
  }
}
