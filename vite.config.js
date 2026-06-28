import { defineConfig } from 'vite';
import { copy } from 'vite-plugin-copy'; // npm install vite-plugin-copy

export default defineConfig({
  plugins: [
    copy({
      targets: [
        { src: 'src/icons/*', dest: 'dist/icons' }
      ]
    })
  ],
  build: {
    outDir: 'dist',
    assetsDir: '.',
    rollupOptions: {
      input: 'index.html'
    }
  }
});
