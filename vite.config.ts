import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react()],
    // Use relative base path so it works on any repo name (e.g. /SpiroGraph/ or /my-game/)
    base: "./",
    define: {
      // Prevents "process is not defined" error in browser
      'process.env.API_KEY': JSON.stringify(env.API_KEY || "")
    }
  }
})