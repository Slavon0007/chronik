/** Drive the mobile UI at a true 390×844 viewport and capture key screens. */
import { writeFile } from 'node:fs/promises'

const port = process.argv[2] || '60692'
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

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function evaluate(expression) {
  const result = await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  })
  return result.result?.value
}

async function shot(name) {
  await wait(500)
  const result = await send('Page.captureScreenshot', { format: 'png', fromSurface: true })
  await writeFile(name, Buffer.from(result.data, 'base64'))
  console.log(`saved ${name}`)
}

await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true })
  socket.addEventListener('error', reject, { once: true })
})

await send('Page.enable')
await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', {
  width: 390,
  height: 844,
  deviceScaleFactor: 2,
  mobile: true,
  screenWidth: 390,
  screenHeight: 844,
})
await send('Page.navigate', { url: 'http://127.0.0.1:4174/?nosw=1&v=mobile' })
await wait(2800)

// 1. Filter sheet
await evaluate("document.querySelector('.filter-fab').click()")
await shot('chronik-mobile-filter.png')

// 2. Apply and open list
await evaluate("document.querySelector('.sidebar__apply').click()")
await wait(600)
await evaluate("document.querySelector('[aria-label=\"Liste öffnen\"]').click()")
await shot('chronik-mobile-list.png')

// 3. First event details
await evaluate("document.querySelector('.event-card__main').click()")
await shot('chronik-mobile-detail.png')

const state = await evaluate(
  "JSON.stringify({w:innerWidth,h:innerHeight,detail:!!document.querySelector('.detail-panel'),title:document.querySelector('.detail-panel h2')?.textContent})",
)
console.log(state)
socket.close()
