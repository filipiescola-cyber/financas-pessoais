/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

// O GitHub Pages publica em user.github.io/NOME-DO-REPO/, então todo caminho
// absoluto precisa desse prefixo — inclusive os do service worker e do manifest.
// Fica numa constante porque três lugares dependem do mesmo valor.
const BASE = '/financas-pessoais/';

export default defineConfig({
  base: BASE,
  plugins: [
    react(),
    tailwind(),
    // Service worker ligado na Fase 8 (§12): o app abre sem rede e a fila de
    // sincronização sobe o que foi lançado offline.
    //
    // `prompt` em vez de `autoUpdate`: com autoUpdate a versão nova só assumia
    // no carregamento SEGUINTE, então o primeiro acesso depois de um deploy
    // servia o código velho sem dizer nada — e a correção parecia não ter
    // saído. Agora o app avisa e a troca é um clique.
    //
    // `injectRegister: null` porque o registro é feito no código, para poder
    // reagir ao aviso de versão nova.
    VitePWA({
      registerType: 'prompt',
      injectRegister: null,
      workbox: {
        // Só os arquivos do próprio app entram no cache. As chamadas ao
        // Supabase ficam SEMPRE na rede: dado financeiro em cache é dado que
        // mente, e a fila já cobre o caso de estar sem conexão.
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        navigateFallback: `${BASE}index.html`,
        cleanupOutdatedCaches: true,
      },
      manifest: {
        name: 'Finanças Pessoais',
        short_name: 'Finanças',
        description: 'Gestão financeira pessoal',
        lang: 'pt-BR',
        start_url: BASE,
        scope: BASE,
        display: 'standalone',
        background_color: '#0F172A',
        theme_color: '#0F172A',
        icons: [
          { src: `${BASE}icone.svg`, sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
    }),
  ],
  test: {
    // Só funções puras (§13.4). Não há teste de interface neste projeto.
    include: ['testes/**/*.test.ts'],
    environment: 'node',
  },
});
