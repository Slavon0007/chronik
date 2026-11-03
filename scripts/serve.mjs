/** Minimal static server for the production build (correct MIME types on Windows). */
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'

const root = path.resolve(process.env.SERVE_DIR || 'dist')
const port = Number(process.env.PORT || 4173)

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ico': 'image/x-icon',
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url || '/', 'http://localhost')
    let filePath = path.join(root, decodeURIComponent(url.pathname))
    if (!filePath.startsWith(root)) {
      response.writeHead(403).end('Forbidden')
      return
    }

    let info = await stat(filePath).catch(() => null)
    if (info?.isDirectory()) {
      if (!url.pathname.endsWith('/')) {
        response.writeHead(301, { Location: `${url.pathname}/${url.search}` }).end()
        return
      }
      filePath = path.join(filePath, 'index.html')
      info = await stat(filePath).catch(() => null)
    }
    if (!info) {
      filePath = path.join(root, '404.html')
      info = await stat(filePath).catch(() => null)
      if (!info) {
        filePath = path.join(root, 'index.html')
        info = await stat(filePath)
      }
    }

    const data = await readFile(filePath)
    const ext = path.extname(filePath).toLowerCase()
    response.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-store',
      'Service-Worker-Allowed': '/',
    })
    response.end(data)
  } catch (error) {
    response.writeHead(500).end(`Server error: ${error.message}`)
  }
})

server.listen(port, '127.0.0.1', () => {
  console.log(`Chronik preview: http://127.0.0.1:${port}`)
})
