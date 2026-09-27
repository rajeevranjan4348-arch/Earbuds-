import { Canvas, useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import {
  coreSettingsService,
  COLOR_SCHEMES,
  ParticleCoreConfig
} from '../../services/coreSettingsService'
import { orbAnimationEngine } from '../../services/orbAnimationEngine'

const _blendColor = new THREE.Color()
const _ringColor = new THREE.Color()
const _scaleVec = new THREE.Vector3()

/**
 * Creates a high-precision crisp neon particle point sprite with a brilliant core
 */
function createCrispParticleTexture(): THREE.Texture {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.clearRect(0, 0, 64, 64)
    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 30)
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1.0)')
    gradient.addColorStop(0.15, 'rgba(200, 255, 210, 1.0)')
    gradient.addColorStop(0.35, 'rgba(0, 255, 65, 0.9)')
    gradient.addColorStop(0.65, 'rgba(0, 255, 65, 0.35)')
    gradient.addColorStop(0.9, 'rgba(0, 255, 65, 0.08)')
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)')

    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, 64, 64)
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.generateMipmaps = true
  texture.minFilter = THREE.LinearMipmapLinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.needsUpdate = true
  return texture
}

function dtEase(rate: number, delta: number): number {
  return 1 - Math.pow(1 - rate, delta * 60)
}

function ParticleShell({
  isConnected,
  isSpeaking,
  isListening = false,
  micLevel = 0,
  config
}: {
  isConnected: boolean
  isSpeaking: boolean
  isListening?: boolean
  micLevel?: number
  config: ParticleCoreConfig
}) {
  const ref = useRef<THREE.Points>(null)
  const volRef = useRef(0)
  
  // Dense particle count matching reference image (approx 4,800 - 5,400 crisp points)
  const COUNT = 5200

  const particleTexture = useMemo(() => createCrispParticleTexture(), [])

  const scheme = COLOR_SCHEMES[config.colorScheme] || COLOR_SCHEMES.emerald
  const idleCol = useMemo(() => new THREE.Color(scheme.idleColor || '#00ff41'), [scheme.idleColor])
  const activeCol = useMemo(() => new THREE.Color(scheme.activeColor || '#39ff14'), [scheme.activeColor])

  const { positions, original, colors, seeds } = useMemo(() => {
    const pos = new Float32Array(COUNT * 3)
    const orig = new Float32Array(COUNT * 3)
    const cols = new Float32Array(COUNT * 3)
    const s = new Float32Array(COUNT * 2)

    for (let i = 0; i < COUNT; i++) {
      // Golden Spiral / Fibonacci sphere lattice distribution
      const phi = Math.acos(1 - (2 * (i + 0.5)) / COUNT)
      const theta = Math.PI * (1 + Math.sqrt(5)) * i
      // Natural spherical shell with tiny micro-variation
      const r = 1.48 + (Math.random() - 0.5) * 0.03

      const px = r * Math.sin(phi) * Math.cos(theta)
      const py = r * Math.sin(phi) * Math.sin(theta)
      const pz = r * Math.cos(phi)

      pos[i * 3] = px
      pos[i * 3 + 1] = py
      pos[i * 3 + 2] = pz
      orig[i * 3] = px
      orig[i * 3 + 1] = py
      orig[i * 3 + 2] = pz

      // Intense neon green vertex colors with slight hue & brightness variations
      const tint = Math.random()
      if (tint > 0.85) {
        // Super bright lime/white-green highlight points
        cols[i * 3] = 0.55
        cols[i * 3 + 1] = 1.0
        cols[i * 3 + 2] = 0.55
      } else if (tint > 0.45) {
        // Vivid neon green
        cols[i * 3] = 0.0
        cols[i * 3 + 1] = 1.0
        cols[i * 3 + 2] = 0.25
      } else {
        // Deep electric emerald
        cols[i * 3] = 0.0
        cols[i * 3 + 1] = 0.95
        cols[i * 3 + 2] = 0.15
      }

      s[i * 2] = Math.random() * Math.PI * 2
      s[i * 2 + 1] = 0.6 + Math.random() * 0.8
    }
    return { positions: pos, original: orig, colors: cols, seeds: s }
  }, [COUNT])

  useFrame((_, delta) => {
    orbAnimationEngine.recordFrame(delta)

    if (!ref.current) return
    const pts = ref.current
    const geo = pts.geometry
    const mat = pts.material as THREE.PointsMaterial

    const safeDelta = Math.min(delta, 0.05)
    const isReduced = Boolean(config.reducedMotion)
    const speedMult = isReduced ? (config.speed || 1.0) * 0.3 : config.speed || 1.0
    const intensityMult = config.intensity || 1.0

    // Smooth, slow continuous 3D rotation
    pts.rotation.y += safeDelta * 0.045 * speedMult
    pts.rotation.x += safeDelta * 0.015 * speedMult

    const t = performance.now() * 0.001 * speedMult

    let targetVol = 0
    if (isSpeaking) {
      const pulse = Math.abs(Math.sin(t * 8.5) * 0.6 + Math.sin(t * 4.2) * 0.4)
      targetVol = (pulse * 0.7 + Math.random() * 0.1) * intensityMult
    } else if (isListening) {
      const micBoost = micLevel ? Math.min(micLevel * 3.0, 1.2) : Math.abs(Math.sin(t * 5.0)) * 0.35 + 0.15
      targetVol = (0.3 + micBoost * 0.85) * intensityMult
    } else {
      // Gentle natural breathing pulse
      targetVol = (Math.sin(t * 1.8) * 0.08 + 0.1) * intensityMult
    }

    const lerpSpeed = isSpeaking || isListening ? 0.16 : 0.08
    volRef.current += (targetVol - volRef.current) * dtEase(lerpSpeed, safeDelta)
    const vol = volRef.current

    _blendColor.lerpColors(idleCol, activeCol, Math.min(vol * 1.5, 1))
    mat.color.copy(_blendColor)
    
    // High luminous opacity for prominent visual brightness
    const baseOpacity = isConnected ? 0.95 : 0.85
    mat.opacity = (baseOpacity + vol * 0.15) * (config.glow || 1.0)

    // Micro-motion wave displacement on particles
    if (!isReduced) {
      const posArr = geo.attributes.position.array as Float32Array
      for (let i = 0; i < COUNT; i++) {
        const ix = i * 3
        const phase = seeds[i * 2]
        const weight = seeds[i * 2 + 1]

        const waveMult = isListening ? 7.5 : isSpeaking ? 6.0 : 2.5
        const wave = Math.sin(t * waveMult + phase) * (0.015 + vol * 0.08) * weight * intensityMult

        const ox = original[ix]
        const oy = original[ix + 1]
        const oz = original[ix + 2]
        const invR = 0.675 // ~ 1 / 1.48

        posArr[ix] = ox + ox * invR * wave
        posArr[ix + 1] = oy + oy * invR * wave
        posArr[ix + 2] = oz + oz * invR * wave
      }
      geo.attributes.position.needsUpdate = true
    }
  })

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
          // @ts-ignore
          usage={THREE.DynamicDrawUsage}
        />
        <bufferAttribute
          attach="attributes-color"
          args={[colors, 3]}
        />
      </bufferGeometry>
      <pointsMaterial
        // @ts-ignore
        size={0.034 * (config.glow || 1.0)}
        map={particleTexture}
        transparent
        opacity={0.92}
        sizeAttenuation
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        vertexColors
      />
    </points>
  )
}

function OrbitalRing({
  radius,
  tube,
  tilt,
  rotSpeed,
  isConnected,
  isSpeaking,
  isListening = false,
  micLevel = 0,
  phase = 0,
  config
}: {
  radius: number
  tube: number
  tilt: number
  rotSpeed: number
  isConnected: boolean
  isSpeaking: boolean
  isListening?: boolean
  micLevel?: number
  phase?: number
  config: ParticleCoreConfig
}) {
  const ref = useRef<THREE.Mesh>(null)
  const matRef = useRef<THREE.MeshBasicMaterial>(null)
  const volRef = useRef(0)

  const scheme = COLOR_SCHEMES[config.colorScheme] || COLOR_SCHEMES.emerald
  const ringCol = useMemo(() => new THREE.Color(scheme.ringColor || '#00ff41'), [scheme.ringColor])
  const glowCol = useMemo(() => new THREE.Color(scheme.ringGlow || '#39ff14'), [scheme.ringGlow])

  useFrame((_, delta) => {
    if (!ref.current || !matRef.current) return

    const safeDelta = Math.min(delta, 0.05)
    const speedMult = config.speed || 1.0
    const intensityMult = config.intensity || 1.0

    const rotBoost = isListening ? 1.4 : 1.0
    ref.current.rotation.y += safeDelta * rotSpeed * speedMult * rotBoost

    const t = performance.now() * 0.001 * speedMult + phase
    let targetVol = 0
    if (isSpeaking) {
      targetVol = (Math.abs(Math.sin(t * 8)) * 0.5 + 0.15) * intensityMult
    } else if (isListening) {
      const micBoost = micLevel ? Math.min(micLevel * 2.2, 1) : Math.abs(Math.sin(t * 4.5)) * 0.4 + 0.15
      targetVol = (0.2 + micBoost * 0.6) * intensityMult
    } else {
      targetVol = (Math.sin(t * 1.5) * 0.05 + 0.08) * intensityMult
    }
    volRef.current += (targetVol - volRef.current) * dtEase(0.1, safeDelta)
    const vol = volRef.current

    _ringColor.lerpColors(ringCol, glowCol, vol)
    matRef.current.color.copy(_ringColor)

    const targetOp = (0.15 + vol * 0.4) * (config.glow || 1.0)
    matRef.current.opacity += (targetOp - matRef.current.opacity) * dtEase(0.09, safeDelta)
  })

  return (
    <mesh ref={ref} rotation={[tilt, 0, 0]}>
      <torusGeometry args={[radius, tube, 2, 64]} />
      <meshBasicMaterial
        ref={matRef}
        // @ts-ignore
        color={ringCol}
        transparent
        opacity={0.12}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </mesh>
  )
}

function AIOrb({
  isConnected,
  isSpeaking,
  isListening = false,
  micLevel = 0,
  config
}: {
  isConnected: boolean
  isSpeaking: boolean
  isListening?: boolean
  micLevel?: number
  config: ParticleCoreConfig
}) {
  const groupRef = useRef<THREE.Group>(null)

  useFrame((_, delta) => {
    if (!groupRef.current) return

    const intensityScale = config.intensity || 1.0
    const micExpansion = isListening ? (micLevel || 0) * 0.22 : 0
    // Slightly reduced scale for ideal viewport height balance
    const baseScale = isSpeaking ? 0.85 : isListening ? 0.82 + micExpansion : 0.78
    const targetScale = baseScale * (0.9 + intensityScale * 0.1)
    _scaleVec.set(targetScale, targetScale, targetScale)
    
    const scaleEase = 1 - Math.pow(1 - 0.35, delta * 60)
    groupRef.current.scale.lerp(_scaleVec, scaleEase)
    const spinSpeed = isSpeaking ? 1.3 : isListening ? 1.2 : 1.0
    groupRef.current.rotation.y += delta * 0.02 * (config.speed || 1.0) * spinSpeed
  })

  return (
    <group ref={groupRef}>
      <ParticleShell
        isConnected={isConnected}
        isSpeaking={isSpeaking}
        isListening={isListening}
        micLevel={micLevel}
        config={config}
      />

      <OrbitalRing
        radius={1.75}
        tube={0.003}
        tilt={Math.PI * 0.12}
        rotSpeed={0.12}
        isConnected={isConnected}
        isSpeaking={isSpeaking}
        isListening={isListening}
        micLevel={micLevel}
        phase={0}
        config={config}
      />
      <OrbitalRing
        radius={1.9}
        tube={0.002}
        tilt={Math.PI * 0.45}
        rotSpeed={-0.08}
        isConnected={isConnected}
        isSpeaking={isSpeaking}
        isListening={isListening}
        micLevel={micLevel}
        phase={1.5}
        config={config}
      />
    </group>
  )
}

export default function AICore({
  isConnected = false,
  isSpeaking = false,
  isListening = false,
  micLevel = 0,
  onClick,
  className = ''
}: {
  isConnected?: boolean
  isSpeaking?: boolean
  isListening?: boolean
  micLevel?: number
  onClick?: () => void
  className?: string
}) {
  const [coreConfig, setCoreConfig] = useState<ParticleCoreConfig>(() => {
    return coreSettingsService.getSettings().particleCore
  })
  const [isHovered, setIsHovered] = useState(false)
  const [isVisible, setIsVisible] = useState(true)

  // Pause/reduce animation when tab/page is not visible to save GPU and battery
  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsVisible(!document.hidden)
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [])

  useEffect(() => {
    const unsub = coreSettingsService.subscribe((state) => {
      setCoreConfig(state.particleCore)
    })
    return unsub
  }, [])

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`w-full h-full flex items-center justify-center relative z-0 transition-all duration-500 ${
        onClick ? 'cursor-pointer pointer-events-auto' : 'pointer-events-none'
      } ${className}`}
      title={
        !isConnected
          ? 'Click to Initialize IRIS Voice AI'
          : isListening
            ? 'IRIS is listening... Click to mute or speak'
            : isSpeaking
              ? 'Click to interrupt IRIS speech'
              : 'Click to toggle IRIS voice'
      }
    >
      {/* Subtle atmospheric neon green glow halo matching reference */}
      <div
        className={`absolute w-72 h-72 sm:w-[380px] sm:h-[380px] rounded-full blur-[85px] pointer-events-none transition-all duration-700 ease-out ${
          isSpeaking
            ? 'bg-[#00ff41]/20 scale-115 animate-pulse'
            : isListening
              ? 'bg-[#39ff14]/25 scale-110'
              : isConnected
                ? 'bg-[#00ff41]/15 scale-100'
                : isHovered
                  ? 'bg-[#00ff41]/18 scale-105'
                  : 'bg-[#00ff41]/12 scale-95 opacity-80'
        }`}
      />

      {/* Ripple Rings when Listening / Speaking */}
      {(isListening || isSpeaking) && (
        <div
          className={`absolute w-64 h-64 sm:w-84 sm:h-84 rounded-full border border-dashed pointer-events-none transition-all duration-500 ${
            isSpeaking
              ? 'border-[#39ff14]/40 animate-spin'
              : 'border-[#00ff41]/40 animate-[spin_14s_linear_infinite]'
          }`}
          style={{
            transform: `scale(${1 + (micLevel || 0) * 0.3})`
          }}
        />
      )}

      <Canvas
        style={{ width: '100%', height: '100%' }}
        camera={{ position: [0, 0, 4.6], fov: 40 }}
        gl={{
          antialias: true,
          powerPreference: 'high-performance',
          alpha: true,
          depth: false,
          stencil: false
        }}
        dpr={typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1}
        frameloop={isVisible ? 'always' : 'never'}
      >
        <AIOrb
          isConnected={isConnected}
          isSpeaking={isSpeaking}
          isListening={isListening}
          micLevel={micLevel}
          config={{
            ...coreConfig,
            speed: (coreConfig.speed || 1) * (isSpeaking ? 1.3 : isListening ? 1.2 : isHovered ? 1.15 : 1),
            intensity: (coreConfig.intensity || 1) * (isSpeaking ? 1.4 : isListening ? 1.3 : 1.1)
          }}
        />
      </Canvas>
    </div>
  )
}

