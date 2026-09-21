import './shims/electron-shim'
import './assets/main.css'

// Filter benign Three.js deprecation warnings coming from fiber/three internals
if (typeof window !== 'undefined') {
  const originalWarn = console.warn
  console.warn = (...args: any[]) => {
    const firstArg = args[0]
    if (typeof firstArg === 'string' && firstArg.includes('THREE.Clock: This module has been deprecated')) {
      return
    }
    originalWarn.apply(console, args)
  }
}

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)

