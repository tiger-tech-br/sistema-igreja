import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: { target: 'es2022', sourcemap: false },
  server: {
    proxy: { '/api/leitor': 'http://127.0.0.1:3000' }
  }
});
