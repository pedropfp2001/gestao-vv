import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(__dirname, '.') } },
  server: {
    // Em desenvolvimento, a API roda em outra porta (npm run dev:server).
    proxy: { '/api': 'http://localhost:3000' },
  },
});
