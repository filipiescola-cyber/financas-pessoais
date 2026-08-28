import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { ProvedorAutenticacao } from './dados/autenticacao';
import { Layout } from './ui/Layout';
import { RotaProtegida } from './ui/RotaProtegida';
import { Contas } from './telas/Contas';
import { Inicio } from './telas/Inicio';
import { Login } from './telas/Login';

export function App() {
  return (
    <ProvedorAutenticacao>
      <BrowserRouter>
        <Routes>
          <Route path="/entrar" element={<Login />} />
          <Route
            element={
              <RotaProtegida>
                <Layout />
              </RotaProtegida>
            }
          >
            <Route path="/" element={<Inicio />} />
            <Route path="/contas" element={<Contas />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ProvedorAutenticacao>
  );
}
