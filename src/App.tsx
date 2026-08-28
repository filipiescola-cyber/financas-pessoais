import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { ProvedorAutenticacao } from './dados/autenticacao';
import { ProvedorAviso } from './ui/Aviso';
import { ProvedorPrivacidade } from './ui/Privacidade';
import { Layout } from './ui/Layout';
import { RotaProtegida } from './ui/RotaProtegida';
import { Atalhos } from './telas/Atalhos';
import { Cartoes } from './telas/Cartoes';
import { Categorias } from './telas/Categorias';
import { Contas } from './telas/Contas';
import { Faturas } from './telas/Faturas';
import { Dados } from './telas/Dados';
import { Importar } from './telas/Importar';
import { Inicio } from './telas/Inicio';
import { Login } from './telas/Login';
import { Lote } from './telas/Lote';
import { Mais } from './telas/Mais';
import { Onboarding } from './telas/Onboarding';
import { Transacoes } from './telas/Transacoes';

export function App() {
  return (
    <ProvedorAutenticacao>
      <ProvedorPrivacidade>
      <ProvedorAviso>
        <BrowserRouter>
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
  );
}
