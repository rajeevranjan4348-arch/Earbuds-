import React, { Component, ReactNode } from 'react'
import IndexRoot from './IRISRoot'
import { Mem0Provider } from './context/Mem0Context'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('IRIS System Component Caught Error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-screen w-screen bg-black text-white p-6 font-mono select-none">
          <div className="max-w-md w-full bg-zinc-950 border border-emerald-500/30 rounded-2xl p-6 shadow-2xl text-center space-y-4">
            <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mx-auto text-emerald-400">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
            <h2 className="text-lg font-bold tracking-wider text-emerald-400">
              IRIS NEURAL RECOVERY
            </h2>
            <p className="text-xs text-zinc-400 leading-relaxed">
              The operating interface encountered a runtime initialization anomaly.
            </p>
            {this.state.error && (
              <div className="text-[11px] text-zinc-500 bg-zinc-900/80 p-2.5 rounded-lg text-left overflow-x-auto border border-white/5">
                {this.state.error.message}
              </div>
            )}
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null })
                window.location.reload()
              }}
              className="w-full py-2.5 px-4 bg-emerald-500 hover:bg-emerald-400 text-black font-semibold text-xs rounded-xl tracking-wider uppercase transition-colors"
            >
              Reboot Core Layer
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

const App = () => {
  return (
    <ErrorBoundary>
      <Mem0Provider>
        <IndexRoot />
      </Mem0Provider>
    </ErrorBoundary>
  )
}

export default App
