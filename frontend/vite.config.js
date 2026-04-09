import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // e.g. "0.0.0.0", allows Vite to be accessed inside the Docker container
    port: 3000, // Default 5173, change to match your previous port if needed
  },
  preview: {
    port: 3001, // Ensures the preview server runs on the correct port
  },
});