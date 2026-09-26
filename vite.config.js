import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'dist',
    assetsDir: '.',
    target: 'es2022',
    rollupOptions: {
      input: 'index.html'
    }
  },
  publicDir: 'public'
});
