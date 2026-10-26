import { miniappManifest } from '@heybox/hb-sdk/vite';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const miniappRoot = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  base: './',
  publicDir: resolve(miniappRoot, '.generated-public'),
  plugins: [vue(), miniappManifest()],
  server: {
    proxy: {
      '/api': { target: 'http://127.0.0.1:8000', changeOrigin: true },
    },
  },
});
