import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  const oauthPort = env.OAUTH_SERVER_PORT || '8787';
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
      // localtest.me resolves to 127.0.0.1 — used for Meta OAuth when
      // "localhost" is not accepted as an App Domain.
      allowedHosts: ['.localtest.me', '.trycloudflare.com', '.internalc.my.id'],
      proxy: {
        '/auth': `http://localhost:${oauthPort}`,
        '/api': `http://localhost:${oauthPort}`,
      },
    },
  };
});
