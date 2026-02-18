import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: '/ui/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/query': 'http://localhost:8086',
      '/write': 'http://localhost:8086',
      '/ping': 'http://localhost:8086',
      '/debug': 'http://localhost:8086',
    },
  },
});
