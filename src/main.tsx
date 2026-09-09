import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import {
  MutationCache,
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import { App } from './App';
import { avisarErro } from './ui/Aviso';
import './index.css';

/**
 * A mensagem que o usuário vê quando algo falha.
 *
 * Erro de rede chega com texto de biblioteca ("Failed to fetch"), que não diz
 * nada a ninguém e ainda por cima esconde a informação útil: o lançamento não
 * se perdeu, ele está na fila (Fase 8).
 */
function mensagem(erro: unknown, prefixo: string): string {
  const texto = erro instanceof Error ? erro.message : String(erro);

  if (/failed to fetch|networkerror|load failed|fetch failed/i.test(texto)) {
    return 'Sem conexão com o servidor. O que você lançar agora fica na fila e sobe quando a rede voltar.';
  }

  return `${prefixo} ${texto}`;
}

// Saldo é calculado, nunca armazenado (§13.2): toda escrita precisa invalidar a
// leitura correspondente. Por isso o cache do TanStack entra desde a fundação.
const clienteQuery = new QueryClient({
  /*
    Falha de gravação nunca passa em silêncio.

    Um `onError` por mutation é a mesma "lista feita à mão em cada tela" que já
    deixou a invalidação incompleta duas vezes: eram setenta e cinco mutations
    e UM tratamento de erro. Quando a gravação falhava, o botão parava de girar
    e a tela não dizia nada — e quem não vê nem confirmação nem erro tenta de
    novo, duplicando o lançamento, ou desiste achando que o app quebrou.

    Aqui vale para todas de uma vez, e as mensagens que a camada de dados
    escreve com cuidado finalmente chegam à tela.
  */
  mutationCache: new MutationCache({
    onError: (erro) => avisarErro(mensagem(erro, 'Não deu para salvar:')),
  }),
  /*
    Falha de LEITURA também avisa.

    A tela renderiza `?? []` quando a consulta não volta, então um erro de
    leitura vira lista vazia — e lista vazia num app de finanças lê-se como
    "não houve movimento", que é uma afirmação, não uma falha. O §13.5 é
    explícito: nunca mostrar zero onde a resposta certa é "ainda não sei".
  */
  queryCache: new QueryCache({
    onError: (erro) => avisarErro(mensagem(erro, 'Não deu para carregar:')),
  }),
  defaultOptions: {
    queries: {
      // Dado financeiro velho na tela é pior do que uma consulta a mais.
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: true,
    },
  },
});

const raiz = document.getElementById('raiz');
if (!raiz) throw new Error('Elemento #raiz não encontrado no index.html.');

createRoot(raiz).render(
  <StrictMode>
    <QueryClientProvider client={clienteQuery}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
