import { readFileSync, writeFileSync } from 'node:fs'

let html = readFileSync('dist/index.html', 'utf8')
const hook = `<script>
window.addEventListener('error', function (event) {
  document.body.innerHTML = '<pre id="err">' + ((event.error && event.error.stack) || event.message) + '</pre>'
})
window.addEventListener('unhandledrejection', function (event) {
  document.body.innerHTML = '<pre id="err">' + ((event.reason && event.reason.stack) || event.reason) + '</pre>'
})
</script>`
html = html.replace('<script type="module"', `${hook}\n<script type="module"`)
writeFileSync('dist/debug.html', html)
console.log('written')
