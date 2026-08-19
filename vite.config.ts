import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Served from https://jie60517.github.io/emulsion/, so assets need that prefix.
export default defineConfig({
  base: '/emulsion/',
  plugins: [react()],
});
