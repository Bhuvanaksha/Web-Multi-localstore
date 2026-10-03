import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 8175,
    // Dev proxy: eliminates CORS entirely — /api and /socket.io hit the backend.
    proxy: {
      '/api': {
        target: 'http://localhost:5347',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:5347',
        ws: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
