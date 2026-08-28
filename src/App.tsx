import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { ProvedorAutenticacao } from './dados/autenticacao';
import { AtualizacaoDisponivel } from './ui/AtualizacaoDisponivel';
import { ProvedorAviso } from './ui/Aviso';
import { LimiteDeErro } from './ui/LimiteDeErro';
import { ProvedorPrivacidade } from './ui/Privacidade';
import { ProvedorTema } from './ui/Tema';
import { Layout } from './ui/Layout';
import { RotaProtegida } from './ui/RotaProtegida';
import { Atalhos } from './telas/Atalhos';
import { Cartoes } from './telas/Cartoes';
import { Categorias } from './telas/Categorias';
import { Conferencia } from './telas/Conferencia';
import { Contas } from './telas/Contas';
import { Faturas } from './telas/Faturas';
import { Dados } from './telas/Dados';
import { Fechamento } from './telas/Fechamento';
import { FluxoDeCaixa } from './telas/FluxoDeCaixa';
import { Importar } from './telas/Importar';
import { Investimentos } from './telas/Investimentos';
import { Inicio } from './telas/Inicio';
import { Login } from './telas/Login';
import { Metas } from './telas/Metas';
import { Orcamento } from './telas/Orcamento';
import { Relatorios } from './telas/Relatorios';
import { Simulador } from './telas/Simulador';
import { Lote } from './telas/Lote';
import { Mais } from './telas/Mais';
import { Onboarding } from './telas/Onboarding';
import { Transacoes } from './telas/Transacoes';

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
        </BrowserRouter>
      </ProvedorAviso>
      </ProvedorPrivacidade>
      </ProvedorAutenticacao>
      </ProvedorTema>
    </LimiteDeErro>
  );
}
