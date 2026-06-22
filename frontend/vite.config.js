import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

function getDevProxyTarget(apiUrl) {
  if (!apiUrl) {
    return null
  }

  try {
    const parsedUrl = new URL(apiUrl)
    parsedUrl.pathname = parsedUrl.pathname.replace(/\/api\/?$/, '') || '/'
    parsedUrl.search = ''
    parsedUrl.hash = ''

    return parsedUrl.toString().replace(/\/$/, '')
  } catch {
    return null
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const devProxyTarget = getDevProxyTarget(env.VITE_API_URL)

  return {
    plugins: [
      react(),
      tailwindcss()
    ],
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            mui: ['@mui/material', '@mui/x-charts', '@emotion/react', '@emotion/styled'],
            react: ['react', 'react-dom', 'react-router-dom'],
            vendor: ['axios', 'gridstack', 'lucide-react', 'react-icons']
          }
        }
      }
    },
    server: {
      port: 5173,
      proxy: devProxyTarget ? {
        '/api': {
          target: devProxyTarget,
          changeOrigin: true
        }
      } : undefined
    }
  }
})
