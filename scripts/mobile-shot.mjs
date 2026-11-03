/** Capture a true 390px mobile viewport through the DevTools protocol. */
import { writeFile } from 'node:fs/promises'

const port = process.argv[2] || '63535'
const width = Number(process.argv[3] || 390)
const height = Number(process.argv[4] || 844)
const out = process.argv[5] || 'chronik-mobile-390.png'

const targets = await fetch(`http://127.0.0.1:${port}/json`).then((response) => response.json())
const page = targets.find((target) => target.type === 'page' && target.url.includes('4174'))
if (!page) throw new Error('Chronik page not found')

const socket = new WebSocket(page.webSocketDebuggerUrl)
let nextId = 0
const pending = new Map()

socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data)
  if (message.id && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id)
    pending.delete(message.id)
    if (message.error) reject(new Error(message.error.message))
    else resolve(message.result)
  }
})

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++nextId
    pending.set(id, { resolve, reject })
    socket.send(JSON.stringify({ id, method, params }))
  })
}

await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true })
  socket.addEventListener('error', reject, { once: true })
})

await send('Page.enable')
await send('Emulation.setDeviceMetricsOverride', {
  width,
  height,
  deviceScaleFactor: 2,
  mobile: true,
  screenWidth: width,
  screenHeight: height,
})
await send('Emulation.setUserAgentOverride', {
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
})
await new Promise((resolve) => setTimeout(resolve, 1600))
const result = await send('Page.captureScreenshot', { format: 'png', fromSurface: true })
await writeFile(out, Buffer.from(result.data, 'base64'))
console.log(`Saved ${out} (${width}x${height} CSS px, 2x)`)
socket.close()
