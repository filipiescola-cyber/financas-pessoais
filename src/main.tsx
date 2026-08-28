import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from './App';
import './index.css';

// Saldo é calculado, nunca armazenado (§13.2): toda escrita precisa invalidar a
// leitura correspondente. Por isso o cache do TanStack entra desde a fundação.
const clienteQuery = new QueryClient({
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
