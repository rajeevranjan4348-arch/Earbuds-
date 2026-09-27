import React from 'react'
import IndexRoot from './IRISRoot'
import { Mem0Provider } from './context/Mem0Context'
import { useGlobalSmoothScroll } from './hooks/useGlobalSmoothScroll'

export default function App() {
  useGlobalSmoothScroll()

  return (
    <Mem0Provider>
      <div className="relative w-screen h-screen overflow-hidden antialiased bg-[var(--iris-bg-main)] text-[var(--iris-text-primary)]">
        {/* IRIS Neural OS Main Environment */}
        <IndexRoot />
      </div>
    </Mem0Provider>
  )
}
