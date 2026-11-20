import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [],
      manifest: {
        name: 'Metas.com.br',
        short_name: 'Metas',
        description: 'Seu sonho merece um plano.',
        theme_color: '#172b25',
        background_color: '#f6f7f4',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' }
        ]
      },
      workbox: {
        navigateFallback: 'index.html',
        // Somente arquivos estáticos do app. Dados privados/API nunca entram no cache.
        runtimeCaching: []
      }
    })
  ]
});
