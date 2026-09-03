import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Runs on a different port from the public site (5173) on purpose --
// this is a completely separate app, not a route inside the main one.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
  },
})
