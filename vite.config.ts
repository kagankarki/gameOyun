import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    host: '0.0.0.0', // Yerel ağdaki tüm cihazlardan (telefonlar vs.) erişime açar
    port: Number(process.env.PORT) || 5173,
    strictPort: true,
    cors: true,
    open: true,
  },
})
