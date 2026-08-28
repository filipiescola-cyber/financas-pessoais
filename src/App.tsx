import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { ProvedorAutenticacao } from './dados/autenticacao';
import { RotaProtegida } from './ui/RotaProtegida';
import { Inicio } from './telas/Inicio';
import { Login } from './telas/Login';

export function App() {
  return (
    <ProvedorAutenticacao>
      <BrowserRouter>
        <Routes>
          <Route path="/entrar" element={<Login />} />
          <Route
            path="/"
            element={
              <RotaProtegida>
                <Inicio />
              </RotaProtegida>
            }
          />
        </Routes>
      </BrowserRouter>
    </ProvedorAutenticacao>
  );
}
