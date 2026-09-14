import { defineConfig } from 'vite';

export default defineConfig({
  base: './', // GitHub Pages 서브경로 대응 (username.github.io/tekken-p2p/)
  server: { port: 5174, host: true },
  build: { target: 'esnext' },
});
