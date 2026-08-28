/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwind(),
    // Manifest agora, service worker só na Fase 8 (§12).
    // injectRegister: null impede o registro do SW — cache offline mal
    // configurado durante o desenvolvimento serve versão velha e faz perder horas.
    VitePWA({
      injectRegister: null,
      manifest: {
        name: 'Finanças Pessoais',
        short_name: 'Finanças',
        description: 'Gestão financeira pessoal',
        lang: 'pt-BR',
        start_url: '/',
        display: 'standalone',
        background_color: '#0F172A',
        theme_color: '#0F172A',
        icons: [
          { src: '/icone.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
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
