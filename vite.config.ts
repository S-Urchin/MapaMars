import react from '@vitejs/plugin-react'
import { defineConfig, type Connect, type Plugin } from 'vite'
import { GET as horizons } from './api/horizons.ts'

/** Serves api/horizons.ts in dev and preview, as Vercel does in production. */
function horizonsApi(): Plugin {
  const handle = (server: { middlewares: Connect.Server }) => {
    server.middlewares.use('/api/horizons', async (req, res) => {
      const response = await horizons(new Request(new URL(req.originalUrl ?? req.url ?? '', 'http://localhost')))
      res.statusCode = response.status
      response.headers.forEach((value, key) => res.setHeader(key, value))
      res.end(await response.text())
    })
  }
  return { name: 'horizons-api', configureServer: handle, configurePreviewServer: handle }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), horizonsApi()],
})
