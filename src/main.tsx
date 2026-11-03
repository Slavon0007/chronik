import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import './leaflet-global'
import 'leaflet.markercluster'
import './fonts.css'
import './styles.css'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

const swDisabled = new URLSearchParams(window.location.search).has('nosw')

if ('serviceWorker' in navigator && import.meta.env.PROD && !swDisabled) {
  window.addEventListener('load', () => {
    const workerUrl = new URL('sw.js', document.baseURI).href
    navigator.serviceWorker.register(workerUrl).catch(() => {
      // Offline support is progressive enhancement.
    })
  })
}
