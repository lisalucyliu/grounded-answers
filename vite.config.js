import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import apiDevRoute from './dev/apiDevRoute.js';

export default defineConfig({
  // apiDevRoute only runs in `vite` dev mode. See dev/apiDevRoute.js.
  plugins: [react(), apiDevRoute()],
});
