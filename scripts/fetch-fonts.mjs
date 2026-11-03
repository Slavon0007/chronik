/**
 * Downloads the variable font files used by the Chronik UI and writes
 * local @font-face declarations. Run once: node scripts/fetch-fonts.mjs
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36'

const families = [
  {
    query: 'Fraunces:ital,opsz,wght@0,9..144,300..700;1,9..144,300..600',
    faces: [
      { file: 'fraunces-latin', style: 'normal', weight: '300 700' },
      { file: 'fraunces-italic-latin', style: 'italic', weight: '300 600' },
    ],
  },
  {
    query: 'Manrope:wght@400..700',
    faces: [{ file: 'manrope-latin', style: 'normal', weight: '400 700' }],
  },
]

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = path.join(root, 'public', 'fonts')
await mkdir(outDir, { recursive: true })

const cssBlocks = []

for (const family of families) {
  const url = `https://fonts.googleapis.com/css2?family=${family.query}&display=swap`
  const res = await fetch(url, { headers: { 'user-agent': UA } })
  if (!res.ok) throw new Error(`Font CSS failed: ${res.status}`)
  const css = await res.text()

  // Split the stylesheet into its per-subset @font-face blocks.
  const blocks = css.split('@font-face').slice(1)
  for (const face of family.faces) {
    // Find the block whose font-style matches and whose trailing comment is /* latin */.
    const candidates = blocks.filter((block) => {
      const style = /font-style:\s*(\w+)/.exec(block)?.[1]
      return style === face.style
    })
    const latinBlock = candidates.find((b) => /\/\*\s*latin\s*\*\//.test(b))
    if (!latinBlock) throw new Error(`No latin subset for ${face.file}`)
    const src = /url\((https:[^)]+\.woff2)\)/.exec(latinBlock)?.[1]
    if (!src) throw new Error(`No woff2 src for ${face.file}`)

    const fontRes = await fetch(src, { headers: { 'user-agent': UA } })
    if (!fontRes.ok) throw new Error(`Font download failed: ${fontRes.status}`)
    const buf = Buffer.from(await fontRes.arrayBuffer())
    await writeFile(path.join(outDir, `${face.file}.woff2`), buf)
    console.log(`${face.file}.woff2  ${(buf.length / 1024).toFixed(1)} kB`)

    cssBlocks.push(`@font-face {
  font-family: '${face.file.startsWith('fraunces') ? 'Fraunces' : 'Manrope'}';
  font-style: ${face.style};
  font-weight: ${face.weight};
  font-display: swap;
  src: url('/fonts/${face.file}.woff2') format('woff2');
}`)
  }
}

await writeFile(path.join(root, 'src', 'fonts.css'), `${cssBlocks.join('\n\n')}\n`)
console.log('Wrote src/fonts.css')
