import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    // PORT verilmişse ona uy (araçlar 5173 doluyken başka port atayabiliyor)
    port: Number(process.env.PORT) || 5173,
    open: true,
  },
})
