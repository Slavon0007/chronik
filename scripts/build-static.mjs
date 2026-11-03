/**
 * Self-contained static build (esbuild). It is the default `npm run build`
 * so the PWA can be deployed to GitHub Pages, Netlify or any static host —
 * including project pages served from a sub-path.
 */
import { cp, readFile, rm, writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import path from 'node:path'

const root = process.cwd()
const dist = path.join(root, 'dist')

await rm(dist, { recursive: true, force: true })

const esbuildBin = path.join(root, 'node_modules', 'esbuild', 'bin', 'esbuild')
const publicEnv = {
  PROD: true,
  DEV: false,
  VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL || '',
  VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY || '',
}
const args = [
  'src/main.tsx',
  '--bundle',
  '--format=esm',
  '--outdir=dist',
  '--entry-names=assets/app-[hash]',
  '--asset-names=assets/[name]-[hash]',
  '--metafile=dist/meta.json',
  '--loader:.woff2=file',
  '--loader:.png=file',
  '--minify',
  '--target=es2020',
  '--jsx=automatic',
  '--external:/fonts/*',
  '--define:process.env.NODE_ENV="production"',
  `--define:import.meta.env=${JSON.stringify(publicEnv)}`,
]

const result = spawnSync(process.execPath, [esbuildBin, ...args], {
  cwd: root,
  stdio: 'inherit',
})
if (result.status !== 0) process.exit(result.status ?? 1)

await cp(path.join(root, 'public'), dist, { recursive: true })

const meta = JSON.parse(await readFile(path.join(dist, 'meta.json'), 'utf8'))
const outputs = Object.keys(meta.outputs ?? {})
const jsFile = outputs.find((file) => file.endsWith('.js'))
const cssFile = outputs.find((file) => file.endsWith('.css'))
if (!jsFile || !cssFile) {
  throw new Error('Could not determine the hashed JS/CSS entry names from esbuild metadata')
}
const assetPath = (file) => `./${file.replace(/^dist[\\/]/, '').replaceAll('\\', '/')}`

const cssPath = path.join(root, cssFile)
let css = await readFile(cssPath, 'utf8')
// The CSS is emitted into /assets; public fonts live one level up. Relative
// URLs keep the build portable when GitHub Pages serves it under /<repo>/.
css = css.replace(/url\((['"]?)\/fonts\//g, (_match, quote) => `url(${quote}../fonts/`)
await writeFile(cssPath, css)

let html = await readFile(path.join(root, 'index.html'), 'utf8')
html = html.replace(
  '</head>',
  `    <link rel="stylesheet" href="${assetPath(cssFile)}" />\n  </head>`,
)
html = html.replace(
  '<script type="module" src="/src/main.tsx"></script>',
  `<script type="module" src="${assetPath(jsFile)}"></script>`,
)
await writeFile(path.join(dist, 'index.html'), html)
// GitHub Pages uses 404.html for unknown deep links; serve the app shell there.
await writeFile(path.join(dist, '404.html'), html)
await rm(path.join(dist, 'meta.json'), { force: true })

console.log('Static build written to dist/')
