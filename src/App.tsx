import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { ProvedorAutenticacao } from './dados/autenticacao';
import { ProvedorAviso } from './ui/Aviso';
import { Layout } from './ui/Layout';
import { RotaProtegida } from './ui/RotaProtegida';
import { Cartoes } from './telas/Cartoes';
import { Categorias } from './telas/Categorias';
import { Contas } from './telas/Contas';
import { Dados } from './telas/Dados';
import { Inicio } from './telas/Inicio';
import { Login } from './telas/Login';
import { Mais } from './telas/Mais';
import { Onboarding } from './telas/Onboarding';
import { Transacoes } from './telas/Transacoes';

export function App() {
  return (
    <ProvedorAutenticacao>
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
              <Route path="/contas" element={<Contas />} />
              <Route path="/cartoes" element={<Cartoes />} />
              <Route path="/categorias" element={<Categorias />} />
              <Route path="/dados" element={<Dados />} />
              <Route path="/mais" element={<Mais />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </ProvedorAviso>
    </ProvedorAutenticacao>
  );
}
