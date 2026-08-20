import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      // more specific prefix listed first so it wins over the generic '/api' below
      '/api/pdf': 'http://127.0.0.1:8010',
      '/api': 'http://127.0.0.1:8000',
    },
  },
})
