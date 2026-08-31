import { lazy, Suspense, type ComponentType } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { ProvedorAutenticacao } from './dados/autenticacao';
import { AtualizacaoDisponivel } from './ui/AtualizacaoDisponivel';
import { ProvedorAviso } from './ui/Aviso';
import { LimiteDeErro } from './ui/LimiteDeErro';
import { ProvedorPrivacidade } from './ui/Privacidade';
import { ProvedorTema } from './ui/Tema';
import { Layout } from './ui/Layout';
import { RotaProtegida } from './ui/RotaProtegida';
import { Inicio } from './telas/Inicio';
import { Login } from './telas/Login';

/**
 * Cada tela num pedaço próprio.
 *
 * O app inteiro vinha num arquivo só, e abrir o Início baixava também o
 * importador de OFX, o wizard de onboarding, os gráficos e todas as outras
 * telas — a maior parte delas usada uma vez por mês, ou uma vez na vida. Num
 * PWA que precisa abrir rápido no celular (§5.1), isso é o oposto do objetivo.
 *
 * Início e Login continuam no pedaço principal: são as duas primeiras telas
 * que qualquer sessão vê, e adiá-las trocaria um download menor por uma espera
 * na abertura, que é justamente o que se quer evitar.
 *
 * O `then` existe porque as telas são exportação nomeada, e `lazy` espera
 * `default`.
 */
function tela<T extends string>(carregar: () => Promise<Record<T, ComponentType>>, nome: T) {
  return lazy(() => carregar().then((modulo) => ({ default: modulo[nome] })));
}

const Onboarding = tela(() => import('./telas/Onboarding'), 'Onboarding');
const Transacoes = tela(() => import('./telas/Transacoes'), 'Transacoes');
const Relatorios = tela(() => import('./telas/Relatorios'), 'Relatorios');
const Orcamento = tela(() => import('./telas/Orcamento'), 'Orcamento');
const Metas = tela(() => import('./telas/Metas'), 'Metas');
const Investimentos = tela(() => import('./telas/Investimentos'), 'Investimentos');
const Dividas = tela(() => import('./telas/Dividas'), 'Dividas');
const Conferencia = tela(() => import('./telas/Conferencia'), 'Conferencia');
const FluxoDeCaixa = tela(() => import('./telas/FluxoDeCaixa'), 'FluxoDeCaixa');
const Fechamento = tela(() => import('./telas/Fechamento'), 'Fechamento');
const Simulador = tela(() => import('./telas/Simulador'), 'Simulador');
const Lote = tela(() => import('./telas/Lote'), 'Lote');
const Importar = tela(() => import('./telas/Importar'), 'Importar');
const Atalhos = tela(() => import('./telas/Atalhos'), 'Atalhos');
const Contas = tela(() => import('./telas/Contas'), 'Contas');
const Cartoes = tela(() => import('./telas/Cartoes'), 'Cartoes');
const Faturas = tela(() => import('./telas/Faturas'), 'Faturas');
const Categorias = tela(() => import('./telas/Categorias'), 'Categorias');
const Dados = tela(() => import('./telas/Dados'), 'Dados');
const Mais = tela(() => import('./telas/Mais'), 'Mais');

/**
 * O que aparece enquanto o pedaço da tela chega.
 *
 * Deliberadamente discreto e sem animação: numa conexão boa isso pisca por
 * 80ms, e um esqueleto animado nesse tempo chama mais atenção do que o
 * conteúdo que ele substitui.
 */
function Carregando() {
  return <p className="px-6 py-8 text-sm text-slate-500">Carregando…</p>;
}

export function App() {
  return (
    <LimiteDeErro>
      <ProvedorTema>
        <ProvedorAutenticacao>
          <ProvedorPrivacidade>
            <ProvedorAviso>
              <AtualizacaoDisponivel />
              {/* O Pages serve o app numa subpasta; sem o basename toda rota
                  apontaria para a raiz do domínio e nada resolveria. */}
              <BrowserRouter basename={import.meta.env.BASE_URL}>
                <Suspense fallback={<Carregando />}>
                  <Routes>
                    <Route path="/entrar" element={<Login />} />
                    {/* Fora do Layout: durante o wizard o FAB e as abas só distraem. */}
                    <Route
                      path="/comecar"
                      element={
                        <RotaProtegida>
                          <Onboarding />
                        </RotaProtegida>
                      }
                    />
                    <Route
                      element={
                        <RotaProtegida>
                          <Layout />
                        </RotaProtegida>
                      }
                    >
                      <Route path="/" element={<Inicio />} />
                      <Route path="/transacoes" element={<Transacoes />} />
                      <Route path="/relatorios" element={<Relatorios />} />
                      <Route path="/orcamento" element={<Orcamento />} />
                      <Route path="/metas" element={<Metas />} />
                      <Route path="/investimentos" element={<Investimentos />} />
                      <Route path="/dividas" element={<Dividas />} />
                      <Route path="/conferencia" element={<Conferencia />} />
                      <Route path="/fluxo" element={<FluxoDeCaixa />} />
                      <Route path="/fechamento" element={<Fechamento />} />
                      <Route path="/simulador" element={<Simulador />} />
                      <Route path="/lote" element={<Lote />} />
                      <Route path="/importar" element={<Importar />} />
                      <Route path="/atalhos" element={<Atalhos />} />
                      <Route path="/contas" element={<Contas />} />
                      <Route path="/cartoes" element={<Cartoes />} />
                      <Route path="/faturas" element={<Faturas />} />
                      <Route path="/categorias" element={<Categorias />} />
                      <Route path="/dados" element={<Dados />} />
                      <Route path="/mais" element={<Mais />} />
                    </Route>
                  </Routes>
                </Suspense>
              </BrowserRouter>
            </ProvedorAviso>
          </ProvedorPrivacidade>
        </ProvedorAutenticacao>
      </ProvedorTema>
    </LimiteDeErro>
  );
}
