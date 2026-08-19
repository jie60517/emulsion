import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Served from https://jie60517.github.io/emulsion/, so assets need that prefix.
export default defineConfig({
  base: '/emulsion/',
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        // The spike is a second entry so it can be run in a real browser
        // without threading throwaway code through the app.
        main: 'index.html',
        experiment: 'experiment.html',
      },
    },
  },
});
